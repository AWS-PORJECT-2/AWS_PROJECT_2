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

const TRYON_PROMPT =
  'The attached images show ONE garment. The first image is a flat product illustration of it. The remaining images (if any) are the original reference photos — use them as the source of truth for exact colors, logos, embroidery, patches, and design details.\n\n' +
  'Generate a single photorealistic image of a young Korean university student (twenties) wearing that garment, with two halves side-by-side:\n' +
  '- LEFT half: student facing the camera (front of garment visible).\n' +
  '- RIGHT half: same student facing away from the camera (back of garment visible, with all back-side design elements clearly shown).\n\n' +
  'Same studio background, lighting, body, hair, and framing in both halves — only the angle changes. Show head to waist. The garment MUST exactly match the references (no invented or omitted details).\n\n' +
  'Crop tight, minimal whitespace at top and bottom. Output ONE image.';

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

  // 첫 번째 인자가 도면(SOT), 나머지는 옷 원본 reference 사진들. 합쳐서 한 번에 전송.
  async generateTryOn(
    blueprint: ImageInput,
    references: ImageInput[],
    ctx: BilledCallContext,
  ): Promise<ImageInput> {
    const inputs = [blueprint, ...references.slice(0, 5)]; // 최대 1(도면) + 5(원본) = 6장
    return this.callOnce(TRYON_PROMPT, inputs, ctx);
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
      });
    } catch (err) {
      logger.error({ err, route: ctx.route, userId: ctx.userId }, '[GEMINI-FAILED] Gemini 호출 실패');
      throw new AppError('AI_UNAVAILABLE', 'AI 생성에 실패했습니다');
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
      throw new AppError('AI_UNAVAILABLE', 'AI 응답에서 이미지를 찾지 못했습니다');
    }

    this.dedupCache.set(cacheKey, { ts: now, output: imageOut });
    logger.info(
      { route: ctx.route, userId: ctx.userId, outputBytes: approxBytes(imageOut.base64) },
      '[GEMINI-BILLED] 호출 완료',
    );
    return imageOut;
  }
}
