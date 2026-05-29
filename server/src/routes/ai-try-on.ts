import type { Request, Response } from 'express';
import type { GeminiImageService } from '../services/ai/gemini-image-service.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { withTimeout } from '../utils/fetch-with-timeout.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_MODELS = new Set(['female', 'male', 'female_athletic', 'male_athletic']);
const ALLOWED_BG = new Set(['studio', 'campus', 'classroom', 'outdoor']);
// 상품 종류 — 착용 방식(프롬프트)을 결정. 미지정/미지원 시 'top'(의류) 기본.
const ALLOWED_CATEGORY = new Set(['top', 'ecobag', 'keyring']);

function parseDataUrl(dataUrl: unknown): { mimeType: string; base64: string } | null {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

/**
 * POST /api/ai/try-on
 * body: {
 *   imageDataUrls: ['data:image/...;base64,...', ...],  // 디자인(옷) 이미지 1~5장
 *   imageDataUrl?: 'data:image/...;base64,...',          // (구버전 단수 호환)
 *   modelType?: 'female' | 'male' | ...,                  // 모델 타입 (기본 female)
 *   background?: 'studio' | 'campus' | ...                 // 배경 (기본 studio)
 * }
 * response: { tryOnDataUrl: 'data:image/png;base64,...' }
 *
 * 디자인 이미지(1~5장) → 모델 앞·뒤 착용 사진 (한 장 좌우 50:50). Gemini 호출 1회.
 */
const MAX_IMAGES = 5;

export function createAiTryOnHandler(gemini: GeminiImageService, timeoutMs: number) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED')));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    // imageDataUrls(배열) 우선, 없으면 단수 imageDataUrl/blueprintDataUrl 호환
    const rawList = Array.isArray(body.imageDataUrls)
      ? body.imageDataUrls
      : [body.imageDataUrl ?? body.blueprintDataUrl];

    if (rawList.length === 0) {
      res.status(400).json(createErrorResponse(
        new AppError('MISSING_REQUIRED_FIELD', '이미지가 없습니다 (1~5장 필요)'),
      ));
      return;
    }
    if (rawList.length > MAX_IMAGES) {
      res.status(400).json(createErrorResponse(
        new AppError('MISSING_REQUIRED_FIELD', `이미지는 최대 ${MAX_IMAGES}장까지 첨부 가능합니다`),
      ));
      return;
    }

    const garments: { mimeType: string; base64: string }[] = [];
    for (const item of rawList) {
      const parsed = parseDataUrl(item);
      if (!parsed) {
        res.status(400).json(createErrorResponse(
          new AppError('MISSING_REQUIRED_FIELD', '유효하지 않은 dataURL 이 포함돼 있습니다'),
        ));
        return;
      }
      if (!ALLOWED_MIME.has(parsed.mimeType.toLowerCase())) {
        res.status(400).json(createErrorResponse(
          new AppError('MISSING_REQUIRED_FIELD', '지원 이미지 형식: jpeg / png / webp'),
        ));
        return;
      }
      garments.push(parsed);
    }

    const modelType = ALLOWED_MODELS.has(String(body.modelType)) ? String(body.modelType) : 'female';
    const background = ALLOWED_BG.has(String(body.background)) ? String(body.background) : 'studio';
    const category = ALLOWED_CATEGORY.has(String(body.category)) ? String(body.category) : 'top';

    try {
      const result = await withTimeout(
        gemini.generateTryOn(garments, { modelType, background, category }, { route: 'try-on', userId }),
        timeoutMs,
      );
      res.json({ tryOnDataUrl: `data:${result.mimeType};base64,${result.base64}` });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.httpStatus).json(createErrorResponse(err));
        return;
      }
      res.status(503).json(createErrorResponse(new AppError('AI_UNAVAILABLE')));
    }
  };
}
