import { createHash, randomUUID } from 'node:crypto';
import { logger } from '../../logger.js';
import { AppError } from '../../errors/app-error.js';
import { categoryType } from '../../constants/categories.js';
import type { ImageAiService, ImageInput, BilledCallContext } from './ai-interfaces.js';

// OpenAI 이미지(gpt-image-1) 기반 도면/실물·가상피팅 생성.
//  - images/edits 엔드포인트: 참조 이미지(업로드 디자인) + 프롬프트 → 변형 이미지(b64) 반환.
//  - Gemini 서비스와 동일한 안전장치(입력크기 캡·dedup·일일한도·과금로그)를 그대로 유지.
const DEFAULT_MODEL = 'gpt-image-1';
const DEFAULT_QUALITY = 'medium';     // low | medium | high | auto (비용↔품질). 환경변수로 조절.
const DEFAULT_DAILY_LIMIT = 30;
const DEDUP_WINDOW_MS = 60_000;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const OPENAI_EDIT_URL = 'https://api.openai.com/v1/images/edits';

interface DailyCounter { date: string; count: number; }

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}
function approxBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}
function hashImages(images: ImageInput[]): string {
  const h = createHash('sha256');
  for (const img of images) h.update(img.base64);
  return h.digest('hex');
}

const GENDER_DESC: Record<string, string> = {
  female: 'a young Korean woman university student in her twenties',
  male: 'a young Korean man university student in his twenties',
  female_athletic: 'a young athletic Korean woman university student in her twenties',
  male_athletic: 'a young athletic Korean man university student in his twenties',
};
const BG_DESC: Record<string, string> = {
  studio: 'a clean photo studio with soft, even lighting and a plain light-gray backdrop',
  campus: 'an outdoor university campus background, softly blurred',
  classroom: 'a bright university classroom background, softly blurred',
  outdoor: 'a clean outdoor street background, softly blurred',
};

// ─── 프롬프트(모델 무관 — Gemini 버전과 동일 문구 유지) ───
function buildTryOnPrompt(modelType: string, background: string, category: string): string {
  const who = GENDER_DESC[modelType] || GENDER_DESC.female;
  const bg = BG_DESC[background] || BG_DESC.studio;
  const type = categoryType(category);
  if (type === 'goods') {
    return (
      'The attached image(s) are reference photos of ONE merchandise product. If multiple photos are attached, treat them as different views of the SAME product. Generate ONE photorealistic e-commerce product display image of that exact product:\n' +
      '- Present it as a clean studio product/showcase shot — the product attractively arranged/displayed (e.g. standing or propped on a clean surface or pedestal), as if photographed for an online store.\n' +
      '- Do NOT place it on a human body or treat it as clothing. No model wearing it.\n' +
      '- The printed/designed side faces the camera, fully visible and undistorted.\n\n' +
      'Background: ' + bg + '. Soft, even studio lighting, gentle shadow under the product.\n' +
      'The product MUST match the attached reference EXACTLY: same colors, logos, lettering, patterns, shape — do not invent or omit any detail.\n' +
      'Output exactly ONE image.'
    );
  }
  return (
    'You are a virtual TRY-ON generator. The attached image(s) show the DESIGN of ONE garment — they may be a flat technical drawing / 도면 / flat-lay. ' +
    'These references exist ONLY so you can copy the garment\'s appearance; they are NOT the output and must NOT be reproduced as-is.\n\n' +
    'TASK: generate ONE photorealistic PHOTOGRAPH of a real human ' + who + ' actually WEARING this exact garment on their body, shown in two halves side-by-side:\n' +
    '- LEFT half: the model facing the camera (front of the garment visible, worn on the chest/torso).\n' +
    '- RIGHT half: the SAME model turned with their back to the camera (back of the garment visible).\n\n' +
    'CRITICAL — the result MUST be a real person wearing the garment as a true 3D worn photo: natural fabric folds, drape, wrinkles and the shape of a human body underneath. ' +
    'Do NOT output a flat design, a technical flat, a 도면, a flat-lay, a hanging garment, or an empty mannequin. It MUST be worn by a living human body. Never just echo the reference image.\n' +
    'PRESERVE THE DESIGN EXACTLY as in the references: same base/body color, same sleeve and contrast colors, and every logo, lettering, pattern and graphic at the SAME position, size, proportion and colors. ' +
    'Do NOT invent, omit, recolor, resize, move or restyle any design element — only wrap the existing design naturally onto the worn garment.\n' +
    'Do NOT show the person\'s face or head: crop just below the shoulders so the head/face is OUT of frame — show only shoulders/upper chest down to the waist/hips. No face, no hair, no neck-up.\n' +
    'Background: ' + bg + ' — identical in both halves. Same body, lighting and framing in both halves; only the camera angle differs.\n' +
    'Crop tight, minimal whitespace. Output exactly ONE image.'
  );
}

const FACE_LABEL: Record<string, string> = {
  front: 'FRONT', back: 'BACK', left: 'LEFT side', right: 'RIGHT side', neck: 'NECK / collar', wrap: 'WRAP-around',
};
function facesBlock(faces: string[]): { mapping: string; layout: string } | null {
  const labeled = faces.map((f) => FACE_LABEL[f] || '').filter(Boolean);
  if (labeled.length < 2) return null;
  const mapping = labeled.map((lbl, i) => `image ${i + 1} = the ${lbl}`).join(', ');
  return {
    mapping,
    layout:
      `Lay the result out as a single clean image split into ${labeled.length} clearly separated panels in this exact left-to-right order: ${labeled.join(' | ')}. ` +
      'Separate each panel with a clear thin vertical divider line and a small gap, and print its angle name (FRONT / BACK / LEFT / RIGHT) as a small caption under each panel. ' +
      "Each panel MUST faithfully reproduce ONLY that angle's own artwork at its exact placement — every side's design must be clearly visible in its own panel; never omit, duplicate or swap a side's design between panels.",
  };
}
function buildProductPhotoPrompt(category: string, faces: string[] = []): string {
  const fb = facesBlock(faces);
  const fidelity =
    'Reproduce the uploaded design EXACTLY as given: same product/garment color, and every logo, lettering, pattern, embroidery and graphic at its exact position, size, shape and colors. ' +
    'Do NOT recolor, restyle, add, remove, crop, distort or reinterpret anything. Keep white / light areas exactly as they are (do NOT make them transparent and do NOT change their color). ';
  if (categoryType(category) === 'goods') {
    return (
      'The attached image(s) are the designed views of ONE custom merchandise product (multiple images = different faces of the SAME product). ' +
      (fb ? `The images map to faces as follows: ${fb.mapping}. ` : '') +
      'Produce ONE clean, FLAT product layout ("도면" / technical flat) of that EXACT product:\n' +
      '- Show the product FLAT and front-on — a clean product flat-lay / technical flat drawing, evenly lit. NO human, NO mannequin, NO 3D perspective, NO dramatic studio styling or strong shadows.\n' +
      '- ' + fidelity + '\n' +
      (fb ? fb.layout + '\n' : '') +
      'Plain solid white background, flat even lighting, minimal shadow. Output exactly ONE image.'
    );
  }
  const labeled = faces.map((f) => FACE_LABEL[f] || '').filter(Boolean);
  const mapping = labeled.length
    ? `The attached images map to garment faces as follows: ${labeled.map((l, i) => `image ${i + 1} = the ${l}`).join(', ')}. `
    : '';
  return (
    'The attached images are the designed faces of ONE custom garment (flat design mockups). ' + mapping +
    'Produce ONE clean, FLAT garment layout ("도면" / technical flat), laid out as EXACTLY TWO panels of the SAME garment side by side, separated by ONE thin vertical divider, each with a small caption beneath — "FRONT" on the left and "BACK" on the right:\n' +
    '- LEFT panel = the FRONT of the garment with the FRONT-face design on the chest.\n' +
    '- RIGHT panel = the BACK of the garment with the BACK-face design.\n' +
    '- A LEFT-side or RIGHT-side reference image is a SLEEVE design: place it on the matching sleeve, clearly visible on that sleeve in BOTH the front and the back panel.\n' +
    '- ALWAYS output exactly these two panels (the FRONT and the BACK of this one garment). NEVER output a side/profile-only view, never a single panel, never omit the FRONT, never relabel the back as a side.\n' +
    '- Draw each garment FLAT and front-on — a clean flat-lay / technical flat of the garment shape. NOT on a person or mannequin, NO 3D perspective, NO heavy fabric folds or dramatic lighting.\n' +
    '- ' + fidelity + '\n' +
    'Plain solid white background, flat even lighting, minimal shadow. Output exactly ONE image containing the two FRONT and BACK panels.'
  );
}

// 의류(앞|뒤 2패널·2분할)는 가로형, 굿즈(단일 제품)는 정사각.
function sizeForCategory(category: string): '1024x1024' | '1536x1024' {
  return categoryType(category) === 'goods' ? '1024x1024' : '1536x1024';
}

export class OpenAiImageService implements ImageAiService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly quality: string;
  private readonly timeoutMs: number;
  private readonly dailyLimit: number;
  private daily: DailyCounter = { date: todayUtc(), count: 0 };
  private readonly dedupCache = new Map<string, { ts: number; output: ImageInput }>();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.model = process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_MODEL;
    this.quality = process.env.OPENAI_IMAGE_QUALITY ?? DEFAULT_QUALITY;
    this.timeoutMs = parsePositiveInt(process.env.OPENAI_IMAGE_TIMEOUT_MS, 120_000);
    this.dailyLimit = parsePositiveInt(process.env.AI_IMAGE_DAILY_LIMIT, DEFAULT_DAILY_LIMIT);
  }

  static fromEnv(): OpenAiImageService | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return new OpenAiImageService(apiKey);
  }

  async generateBlueprint(clothing: ImageInput[], ctx: BilledCallContext, category = 'etc', faces: string[] = []): Promise<ImageInput> {
    if (clothing.length === 0) throw new AppError('MISSING_REQUIRED_FIELD', '실물 생성에 사용할 이미지가 없습니다');
    if (clothing.length > 5) throw new AppError('MISSING_REQUIRED_FIELD', '실물 생성용 이미지는 최대 5장까지 첨부 가능합니다');
    // 도면은 일관성 우선 → 고정 dedup 키(동일 입력이면 60초 내 같은 결과 재사용)
    return this.callOnce(buildProductPhotoPrompt(category, faces), clothing, ctx, sizeForCategory(category), 'fixed');
  }

  async generateTryOn(
    garments: ImageInput[],
    opts: { modelType: string; background: string; category?: string },
    ctx: BilledCallContext,
  ): Promise<ImageInput> {
    if (garments.length === 0) throw new AppError('MISSING_REQUIRED_FIELD', '피팅에 사용할 이미지가 없습니다');
    if (garments.length > 5) throw new AppError('MISSING_REQUIRED_FIELD', '이미지는 최대 5장까지 첨부 가능합니다');
    // 가상피팅은 매번 다른 사람/자세 → dedup 비활성(랜덤 변종키)로 항상 새 결과.
    return this.callOnce(buildTryOnPrompt(opts.modelType, opts.background, opts.category || 'top'), garments, ctx, sizeForCategory(opts.category || 'top'), randomUUID());
  }

  // 단일 OpenAI 호출. 재시도 없음. 안전장치 다섯 겹(Gemini 서비스와 동일 정책).
  private async callOnce(prompt: string, images: ImageInput[], ctx: BilledCallContext, size: string, variant: string): Promise<ImageInput> {
    // [1/5] 입력 크기 캡
    for (const img of images) {
      if (approxBytes(img.base64) > MAX_INPUT_BYTES) {
        throw new AppError('MISSING_REQUIRED_FIELD', '입력 이미지가 너무 큽니다 (8MB 이하)');
      }
    }

    // [2/5] 60초 dedup — 변종키(variant) 포함. 도면=고정('fixed')이라 dedup, 가상피팅=랜덤이라 매번 새로.
    const cacheKey = `${ctx.route}:${hashImages(images)}:${variant}`;
    const now = Date.now();
    for (const [k, v] of this.dedupCache) {
      if (now - v.ts > DEDUP_WINDOW_MS) this.dedupCache.delete(k);
    }
    const cached = this.dedupCache.get(cacheKey);
    if (cached) {
      logger.warn({ route: ctx.route, userId: ctx.userId, ageMs: now - cached.ts }, '[OPENAI-IMG-DEDUP] 동일 입력 캐시 응답 (호출 생략)');
      return cached.output;
    }

    // [3/5] 일일 한도
    if (this.daily.date !== todayUtc()) this.daily = { date: todayUtc(), count: 0 };
    if (this.daily.count >= this.dailyLimit) {
      throw new AppError('AI_UNAVAILABLE', `오늘 AI 호출 한도(${this.dailyLimit}회)에 도달했습니다. 자정 UTC 이후 다시 시도해주세요`);
    }

    // [4/5] 과금 호출 로그 — 호출 직전 기록(실패해도 청구 가능)
    const inputBytes = images.reduce((acc, img) => acc + approxBytes(img.base64), 0);
    this.daily.count += 1;
    logger.warn({ route: ctx.route, userId: ctx.userId, inputBytes, model: this.model, quality: this.quality, size, todayCount: this.daily.count, dailyLimit: this.dailyLimit }, '[OPENAI-IMG-BILLED] OpenAI 이미지 호출 시작');

    // [5/5] 실제 호출 — multipart(images/edits). 재시도 없음.
    const form = new FormData();
    form.append('model', this.model);
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('quality', this.quality);
    form.append('n', '1');
    images.forEach((img, i) => {
      const buf = Buffer.from(img.base64, 'base64');
      const ext = (img.mimeType && img.mimeType.includes('jpeg')) ? 'jpg' : (img.mimeType && img.mimeType.includes('webp')) ? 'webp' : 'png';
      form.append('image[]', new Blob([new Uint8Array(buf)], { type: img.mimeType || 'image/png' }), `design-${i}.${ext}`);
    });

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    let res: globalThis.Response;
    try {
      res = await fetch(OPENAI_EDIT_URL, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}` }, body: form, signal: ac.signal });
    } catch (err) {
      logger.error({ err, route: ctx.route, userId: ctx.userId }, '[OPENAI-IMG-FAILED] OpenAI 호출 실패(네트워크/타임아웃)');
      throw new AppError('AI_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // 업스트림 원본 에러는 로그로만(키/쿼터/검증 등 디버깅용), 클라엔 일반 메시지.
      const errText = await res.text().catch(() => '');
      logger.error({ route: ctx.route, userId: ctx.userId, status: res.status, errText: errText.slice(0, 600) }, '[OPENAI-IMG-FAILED] OpenAI 비정상 응답');
      throw new AppError('AI_UNAVAILABLE', 'AI가 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
    }

    let json: { data?: Array<{ b64_json?: string }> };
    try {
      json = await res.json() as typeof json;
    } catch (err) {
      logger.error({ err, route: ctx.route, userId: ctx.userId }, '[OPENAI-IMG-FAILED] 응답 JSON 파싱 실패');
      throw new AppError('AI_UNAVAILABLE');
    }
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) {
      logger.warn({ route: ctx.route, userId: ctx.userId }, '[OPENAI-IMG-NOIMAGE] 이미지 미반환');
      throw new AppError('AI_UNAVAILABLE', 'AI가 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
    }

    const imageOut: ImageInput = { mimeType: 'image/png', base64: b64 };
    this.dedupCache.set(cacheKey, { ts: now, output: imageOut });
    logger.info({ route: ctx.route, userId: ctx.userId, outputBytes: approxBytes(b64) }, '[OPENAI-IMG-BILLED] 호출 완료');
    return imageOut;
  }
}
