import { GoogleGenAI } from '@google/genai';
import { createHash } from 'node:crypto';
import { logger } from '../../logger.js';
import { AppError } from '../../errors/app-error.js';

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

function hashImages(images: ImageInput[]): string {
  const h = createHash('sha256');
  for (const img of images) h.update(img.base64);
  return h.digest('hex');
}

const BLUEPRINT_PROMPT =
  'Look at the attached reference photo(s) of a garment. Produce a single clean flat product illustration of THAT SAME garment showing two views side-by-side:\n' +
  '- LEFT half: Front view (collar, front opening, chest logo, pockets visible).\n' +
  '- RIGHT half: Back view (full back panel with any back logo, embroidery, or lettering visible).\n\n' +
  'Style: e-commerce flat product photo on a pure white background. Garment laid flat or shown as if on an invisible mannequin. No body, no model, no scene.\n\n' +
  'Both views are the EXACT SAME garment — preserve every detail from the reference photo(s): exact colors, sleeve color contrast, all logos, embroidery, patches, lettering, stripes, ribbing. Do not invent or omit anything.\n\n' +
  'Crop tight, minimal whitespace at top and bottom. Output exactly ONE image with the two views side-by-side. No labels, no text.';

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

// 업로드한 디자인 이미지를 모델에게 적용한 사진 프롬프트. 상품 종류(category)에 따라 착용 방식이 다르다.
function buildTryOnPrompt(modelType: string, background: string, category: string): string {
  const who = GENDER_DESC[modelType] || GENDER_DESC.female;
  const bg = BG_DESC[background] || BG_DESC.studio;

  // 에코백: 옷처럼 몸통에 "입히면" 안 됨 — 어깨에 메거나 손에 든 자연스러운 모습.
  if (category === 'ecobag') {
    return (
      'The attached image(s) are reference photos of ONE tote bag / eco bag design. If multiple photos are attached, treat them as different views of the SAME bag. Generate ONE photorealistic image of ' + who +
      ' carrying that exact tote bag in a natural everyday pose:\n' +
      '- The bag hangs from one shoulder (or is held by its handles in one hand), worn as a real tote bag — NOT stretched across the torso like a shirt.\n' +
      '- The printed side of the bag faces the camera and is fully visible and flat.\n\n' +
      'Background: ' + bg + '. Natural, relaxed pose. Show the person from head to hip with the bag clearly in frame.\n' +
      'The bag design MUST match the attached reference EXACTLY: same colors, logos, lettering, patterns — do not invent or omit any detail. Keep the bag fabric soft and naturally draped.\n' +
      'Output exactly ONE image.'
    );
  }

  // 키링: 사람이 입는 게 아니라 손에 들거나 가방에 단 소품 클로즈업.
  if (category === 'keyring') {
    return (
      'The attached image(s) are reference photos of ONE keyring / bag charm design. If multiple photos are attached, treat them as different views of the SAME charm. Generate ONE photorealistic lifestyle image of ' + who +
      ' holding that exact keyring in their hand (or with it clipped onto a handbag), as a small accessory:\n' +
      '- The keyring is the focus — shown close-up and clearly, at a realistic small size relative to the hand/bag.\n' +
      '- Do NOT enlarge it to clothing size or place it on the torso.\n\n' +
      'Background: ' + bg + '. Natural pose, hand/bag area in focus.\n' +
      'The keyring design MUST match the attached reference EXACTLY: same colors, shape, lettering, charm details — do not invent or omit any detail.\n' +
      'Output exactly ONE image.'
    );
  }

  // 기본: 상의 의류(과잠/반팔티 등) — 앞/뒤 착용 2분할.
  return (
    'The attached image(s) are reference photos of ONE garment design (clothing). If multiple photos are attached, treat them as different views/details of the SAME garment. Generate ONE photorealistic image of ' + who +
    ' wearing that exact garment, shown in two halves side-by-side:\n' +
    '- LEFT half: the student facing the camera (front of the garment visible).\n' +
    '- RIGHT half: the SAME student with their back to the camera (back of the garment visible).\n\n' +
    'Background: ' + bg + ' — identical in both halves. Same body, hair, lighting and framing in both halves; only the camera angle differs. Show from head to waist.\n' +
    'The garment MUST match the attached design EXACTLY: same colors, logos, lettering, patterns, sleeve color contrast — do not invent or omit any detail.\n' +
    'Crop tight, minimal whitespace at top and bottom. Output exactly ONE image.'
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

  async generateBlueprint(clothing: ImageInput[], ctx: BilledCallContext): Promise<ImageInput> {
    if (clothing.length === 0) {
      throw new AppError('MISSING_REQUIRED_FIELD', '도면 생성에 사용할 이미지가 없습니다');
    }
    if (clothing.length > 5) {
      throw new AppError('MISSING_REQUIRED_FIELD', '도면 생성용 이미지는 최대 5장까지 첨부 가능합니다');
    }
    return this.callOnce(BLUEPRINT_PROMPT, clothing, ctx);
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
    return this.callOnce(buildTryOnPrompt(opts.modelType, opts.background, opts.category || 'top'), garments, ctx);
  }

  // 단일 Gemini 호출. 재시도 없음. 안전장치 다섯 겹.
  private async callOnce(prompt: string, images: ImageInput[], ctx: BilledCallContext): Promise<ImageInput> {
    // [1/5] 입력 크기 캡 — 8MB 초과 입력은 토큰 비용 폭발 방지
    for (const img of images) {
      if (approxBytes(img.base64) > MAX_INPUT_BYTES) {
        throw new AppError('MISSING_REQUIRED_FIELD', '입력 이미지가 너무 큽니다 (8MB 이하)');
      }
    }

    // [2/5] 60초 dedup — 더블 클릭이나 동일 입력 재시도 시 캐시 응답 (Gemini 호출 0)
    const cacheKey = `${ctx.route}:${hashImages(images)}`;
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
        // seed 고정 + 낮은 temperature 로 생성 일관성을 최대한 확보 (실행마다 결과가 덜 달라짐).
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          seed: parsePositiveInt(process.env.GEMINI_SEED, 12345),
          temperature: 0.2,
        },
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error({ err, route: ctx.route, userId: ctx.userId }, '[GEMINI-FAILED] Gemini 호출 실패');
      throw new AppError('AI_UNAVAILABLE', `AI 생성 실패: ${detail}`);
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
      const textPart = parts.map((p) => p.text).filter(Boolean).join(' ').slice(0, 300);
      const reason = textPart || '응답에 이미지가 없습니다 (안전필터 또는 모델 설정 확인)';
      logger.warn({ route: ctx.route, userId: ctx.userId, reason }, '[GEMINI-NOIMAGE] 이미지 미반환');
      throw new AppError('AI_UNAVAILABLE', `AI가 이미지를 만들지 못했습니다: ${reason}`);
    }

    this.dedupCache.set(cacheKey, { ts: now, output: imageOut });
    logger.info(
      { route: ctx.route, userId: ctx.userId, outputBytes: approxBytes(imageOut.base64) },
      '[GEMINI-BILLED] 호출 완료',
    );
    return imageOut;
  }
}
