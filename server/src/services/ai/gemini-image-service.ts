import { GoogleGenAI } from '@google/genai';
import { createHash } from 'node:crypto';
import { logger } from '../../logger.js';
import { AppError } from '../../errors/app-error.js';
import { categoryType } from '../../constants/categories.js';

const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const DEFAULT_DAILY_LIMIT = 30;
const DEDUP_WINDOW_MS = 60_000;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

export interface ImageInput {
  mimeType: string;
  base64: string;
}

export interface BilledCallContext {
  route: 'blueprint' | 'try-on';
  userId: string;
}

interface DailyCounter {
  date: string;
  count: number;
}

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

// 생성 옵션. 도면=고정 seed(일관성), 가상피팅=랜덤 seed(매번 다른 사람/자세).
interface GenConfig {
  seed?: number;        // 미지정 시 모델이 매 호출 무작위 → 결과 다양
  temperature: number;  // 낮으면 일관, 높으면 다양
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}

function hashImages(images: ImageInput[]): string {
  const h = createHash('sha256');
  for (const img of images) h.update(img.base64);
  return h.digest('hex');
}

type ModelType = 'female' | 'male' | 'female_athletic' | 'male_athletic';
type Background = 'studio' | 'campus' | 'classroom' | 'outdoor';

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

// 업로드한 디자인 이미지를 적용한 사진 프롬프트.
// category slug → 타입(의류/굿즈)으로 모드 결정: 의류=모델 착용 앞/뒤, 굿즈=전시 진열 컷.
function buildTryOnPrompt(modelType: string, background: string, category: string): string {
  const who = GENDER_DESC[modelType] || GENDER_DESC.female;
  const bg = BG_DESC[background] || BG_DESC.studio;
  const type = categoryType(category);

  // 굿즈(에코백·키링·폰케이스·스티커 등): 사람에 "입히지" 않고 전시·진열 제품 컷으로.
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

  // 의류(과잠/후드티/반팔티): 모델이 착용한 앞/뒤 2분할. 얼굴은 안 나오게(어깨 윗부분 크롭).
  return (
    'The attached image(s) are reference photos of ONE garment design (clothing). If multiple photos are attached, treat them as different views/details of the SAME garment. Generate ONE photorealistic image of ' + who +
    ' wearing that exact garment, shown in two halves side-by-side:\n' +
    '- LEFT half: the body facing the camera (front of the garment visible).\n' +
    '- RIGHT half: the SAME body with their back to the camera (back of the garment visible).\n\n' +
    'IMPORTANT: do NOT show the person\'s face or head. Crop the frame just below the shoulders so the head/face is OUT of frame — show only from the shoulders/upper chest down to the waist. No face, no hair, no neck-up.\n' +
    'Background: ' + bg + ' — identical in both halves. Same body, lighting and framing in both halves; only the camera angle differs.\n' +
    'The garment MUST match the attached design EXACTLY: same colors, logos, lettering, patterns, sleeve color contrast — do not invent or omit any detail.\n' +
    'Crop tight, minimal whitespace. Output exactly ONE image.'
  );
}

// "AI 실물 보기" — 디자인을 적용한 실제 제작된 제품 사진(도면 X, 포토리얼리스틱). 모델 착용 X(그건 가상피팅).
//  category 로 의류/굿즈 구분: 의류=고스트 마네킹 실물 옷, 굿즈=실물 제품 진열 컷.
const FACE_LABEL: Record<string, string> = {
  front: 'FRONT', back: 'BACK', left: 'LEFT side', right: 'RIGHT side', neck: 'NECK / collar', wrap: 'WRAP-around',
};
// 이미지 순서 ↔ 면(front/back/left/right) 매핑을 프롬프트로 명시 + 면별 패널 분리 지시.
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
  if (categoryType(category) === 'goods') {
    return (
      'The attached image(s) are reference views of ONE custom merchandise product (multiple images = front/back/different sides of the SAME product). ' +
      (fb ? `The images map to faces as follows: ${fb.mapping}. ` : '') +
      'Generate ONE photorealistic e-commerce product photo of that EXACT product as a REAL, manufactured item:\n' +
      '- A clean studio product shot — the real product attractively presented (e.g. standing or propped on a clean surface), as if actually photographed for an online store. Realistic material, texture, lighting and a soft shadow.\n' +
      '- This MUST look like a REAL photographed product, NOT a flat 2D drawing, sketch or technical illustration.\n' +
      '- No human model. The designed side faces the camera, fully visible and undistorted.\n\n' +
      (fb ? fb.layout + '\n\n' : '') +
      'Background: clean light studio. The product MUST match the references EXACTLY: same colors, logos, lettering, patterns, shape — do not invent or omit any detail.\n' +
      'Output exactly ONE image.'
    );
  }
  // 의류: 고스트 마네킹 — 결과는 무조건 앞|뒤 2패널. 옆면(소매) 디자인은 양쪽 패널의 소매에 반영.
  const labeled = faces.map((f) => FACE_LABEL[f] || '').filter(Boolean);
  const mapping = labeled.length
    ? `The attached images map to garment faces as follows: ${labeled.map((l, i) => `image ${i + 1} = the ${l}`).join(', ')}. `
    : '';
  return (
    'The attached images are different faces of ONE custom garment. ' + mapping +
    'Generate ONE photorealistic GHOST / INVISIBLE-MANNEQUIN product photo of that EXACT garment, laid out as EXACTLY TWO panels of the SAME garment side by side, separated by ONE clear thin vertical divider, each with a small caption beneath — "FRONT" on the left and "BACK" on the right:\n' +
    '- LEFT panel = the FRONT of the garment (print the FRONT-face design on the chest).\n' +
    '- RIGHT panel = the BACK of the garment (print the BACK-face design).\n' +
    '- A LEFT-side or RIGHT-side reference image is a SLEEVE design: print it on the matching sleeve, and it MUST be clearly visible on that sleeve in BOTH the front and the back panel (a sleeve shows from both front and back).\n' +
    '- ALWAYS output exactly these two panels — the FRONT and the BACK of this one garment. NEVER output a side/profile-only view, never a single panel, never omit the FRONT, never relabel the back as a side.\n' +
    '- A REAL photographed garment with natural fabric folds, texture, stitching and seams — NOT a flat 2D drawing or sketch. No human, no face, no body.\n\n' +
    'Clean white / light studio background, soft even lighting, gentle shadow. Match the references EXACTLY: garment colors, sleeve/contrast colors, every logo, embroidery, patch, lettering and pattern at its exact placement — do not invent or omit anything. Output exactly ONE image containing the two panels.'
  );
}

export class GeminiImageService {
  private readonly ai: GoogleGenAI;
  private readonly model: string;
  private readonly dailyLimit: number;
  private daily: DailyCounter = { date: todayUtc(), count: 0 };
  private readonly dedupCache = new Map<string, { ts: number; output: ImageInput }>();

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
    this.dailyLimit = parsePositiveInt(process.env.AI_GEMINI_DAILY_LIMIT, DEFAULT_DAILY_LIMIT);
  }

  static fromEnv(): GeminiImageService | null {
    // GEMINI_API_KEY 또는 GEMINI_KEY 둘 다 허용 (사용자 .env 작성 편의)
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GEMINI_KEY;
    if (!apiKey) return null;
    return new GeminiImageService(apiKey);
  }

  // "AI 실물 보기" — 디자인 적용한 실제 제품(실물) 사진 생성. category 로 의류/굿즈 구분.
  async generateBlueprint(clothing: ImageInput[], ctx: BilledCallContext, category = 'etc', faces: string[] = []): Promise<ImageInput> {
    if (clothing.length === 0) {
      throw new AppError('MISSING_REQUIRED_FIELD', '실물 생성에 사용할 이미지가 없습니다');
    }
    if (clothing.length > 5) {
      throw new AppError('MISSING_REQUIRED_FIELD', '실물 생성용 이미지는 최대 5장까지 첨부 가능합니다');
    }
    // 디자인 충실도 우선 — seed 고정 + 낮은 temperature(약간만 올려 자연스러운 질감 허용)
    return this.callOnce(buildProductPhotoPrompt(category, faces), clothing, ctx, {
      seed: parsePositiveInt(process.env.GEMINI_SEED, 12345),
      temperature: 0.35,
    });
  }

  // 업로드한 디자인(옷) 이미지(1~5장)를 모델에게 입힌 사진 생성. 모델타입/배경은 LOUN 디자인의 select 값.
  async generateTryOn(
    garments: ImageInput[],
    opts: { modelType: string; background: string; category?: string },
    ctx: BilledCallContext,
  ): Promise<ImageInput> {
    if (garments.length === 0) {
      throw new AppError('MISSING_REQUIRED_FIELD', '피팅에 사용할 이미지가 없습니다');
    }
    if (garments.length > 5) {
      throw new AppError('MISSING_REQUIRED_FIELD', '이미지는 최대 5장까지 첨부 가능합니다');
    }
    // 가상피팅은 생성할 때마다 사람·자세가 달라지도록 — 랜덤 seed + 높은 temperature
    return this.callOnce(buildTryOnPrompt(opts.modelType, opts.background, opts.category || 'top'), garments, ctx, {
      seed: randomSeed(),
      temperature: 1.0,
    });
  }

  // 단일 Gemini 호출. 재시도 없음. 안전장치 다섯 겹.
  private async callOnce(prompt: string, images: ImageInput[], ctx: BilledCallContext, gen: GenConfig): Promise<ImageInput> {
    // [1/5] 입력 크기 캡 — 8MB 초과 입력은 토큰 비용 폭발 방지
    for (const img of images) {
      if (approxBytes(img.base64) > MAX_INPUT_BYTES) {
        throw new AppError('MISSING_REQUIRED_FIELD', '입력 이미지가 너무 큽니다 (8MB 이하)');
      }
    }

    // [2/5] 60초 dedup — 더블 클릭이나 동일 입력 재시도 시 캐시 응답 (Gemini 호출 0)
    // seed 를 캐시키에 포함 — 고정 seed(도면)는 dedup 유지, 랜덤 seed(가상피팅)는 매 호출 새 결과.
    const cacheKey = `${ctx.route}:${hashImages(images)}:${gen.seed ?? 'auto'}`;
    const now = Date.now();
    for (const [k, v] of this.dedupCache) {
      if (now - v.ts > DEDUP_WINDOW_MS) this.dedupCache.delete(k);
    }
    const cached = this.dedupCache.get(cacheKey);
    if (cached) {
      logger.warn(
        { route: ctx.route, userId: ctx.userId, ageMs: now - cached.ts },
        '[GEMINI-DEDUP] 동일 입력 캐시 응답 (Gemini 호출 생략)',
      );
      return cached.output;
    }

    // [3/5] 일일 한도 — 자정 UTC 기준 리셋
    if (this.daily.date !== todayUtc()) {
      this.daily = { date: todayUtc(), count: 0 };
    }
    if (this.daily.count >= this.dailyLimit) {
      throw new AppError(
        'AI_UNAVAILABLE',
        `오늘 AI 호출 한도(${this.dailyLimit}회)에 도달했습니다. 자정 UTC 이후 다시 시도해주세요`,
      );
    }

    // [4/5] 과금 호출 로그 — 실패해도 청구되므로 호출 직전에 기록
    const inputBytes = images.reduce((acc, img) => acc + approxBytes(img.base64), 0);
    this.daily.count += 1;
    logger.warn(
      {
        route: ctx.route,
        userId: ctx.userId,
        inputBytes,
        model: this.model,
        todayCount: this.daily.count,
        dailyLimit: this.dailyLimit,
      },
      '[GEMINI-BILLED] Gemini API 호출 시작',
    );

    // [5/5] 실제 호출 — 재시도 없음. 실패 시 즉시 throw
    let response;
    try {
      response = await this.ai.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              ...images.map((img) => ({
                inlineData: { mimeType: img.mimeType, data: img.base64 },
              })),
            ],
          },
        ],
        // 이미지 출력 모델은 responseModalities 에 IMAGE 를 명시해야 실제 이미지를 반환한다.
        // 미지정 시 텍스트만 반환되어 'AI 응답에서 이미지를 찾지 못했습니다' 로 떨어진다.
        // seed/temperature 는 호출별(GenConfig)로 다름 — 도면=고정·일관, 가상피팅=랜덤·다양.
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          ...(gen.seed !== undefined ? { seed: gen.seed } : {}),
          temperature: gen.temperature,
        },
      });
    } catch (err) {
      // 업스트림(Gemini) 원본 에러 메시지는 로그에만 남기고, 클라엔 일반 메시지만 노출(정보 누출 방지).
      logger.error({ err, route: ctx.route, userId: ctx.userId }, '[GEMINI-FAILED] Gemini 호출 실패');
      throw new AppError('AI_UNAVAILABLE');
    }

    // 응답에서 이미지 1장만 추출 — 2장 이상 와도 첫 번째만 사용
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    let imageOut: ImageInput | null = null;
    let extraImages = 0;
    for (const part of parts) {
      const inline = part.inlineData;
      if (inline?.data && inline?.mimeType) {
        if (imageOut) {
          extraImages += 1;
          continue;
        }
        imageOut = { mimeType: inline.mimeType, base64: inline.data };
      }
    }
    if (extraImages > 0) {
      logger.warn({ route: ctx.route, userId: ctx.userId, extraImages }, '[GEMINI-MULTI] 응답에 이미지 2장 이상 — 첫 번째만 사용');
    }
    if (!imageOut) {
      // 이미지가 없으면 보통 모델이 텍스트로 거부 사유를 보냄 — 그걸 노출해 디버깅 가능하게.
      // 모델의 원본 텍스트(거부 사유 등)는 로그로만 — 클라이언트엔 일반 메시지.
      const reason = parts.map((p) => p.text).filter(Boolean).join(' ').slice(0, 300) || '(no text)';
      logger.warn({ route: ctx.route, userId: ctx.userId, reason }, '[GEMINI-NOIMAGE] 이미지 미반환');
      throw new AppError('AI_UNAVAILABLE', 'AI가 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
    }

    this.dedupCache.set(cacheKey, { ts: now, output: imageOut });
    logger.info(
      { route: ctx.route, userId: ctx.userId, outputBytes: approxBytes(imageOut.base64) },
      '[GEMINI-BILLED] 호출 완료',
    );
    return imageOut;
  }
}
