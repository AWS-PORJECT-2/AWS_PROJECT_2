import type { Request, Response } from 'express';
import type { GeminiImageService } from '../services/ai/gemini-image-service.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { withTimeout } from '../utils/fetch-with-timeout.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_REFERENCES = 5;

function parseDataUrl(dataUrl: unknown): { mimeType: string; base64: string } | null {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

/**
 * POST /api/ai/try-on
 * body: {
 *   blueprintDataUrl: 'data:image/png;base64,...',     // 필수 (1단계 도면)
 *   referenceDataUrls?: ['data:image/jpeg;base64,...']  // 선택 — 원본 옷 사진 최대 5장.
 *                                                       //        도면만으론 디테일 부족하므로 같이 보내면 색·로고·패치 보존 향상.
 * }
 * response: { tryOnDataUrl: 'data:image/png;base64,...' }
 *
 * 도면(+선택 원본) → 모델 앞·뒤 착용 사진 (한 장 좌우 50:50). Gemini 호출 1회.
 */
export function createAiTryOnHandler(gemini: GeminiImageService, timeoutMs: number) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED')));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    const blueprint = parseDataUrl(body.blueprintDataUrl);
    if (!blueprint) {
      res.status(400).json(createErrorResponse(
        new AppError('MISSING_REQUIRED_FIELD', 'blueprintDataUrl 가 유효한 dataURL 이 아닙니다'),
      ));
      return;
    }
    if (!ALLOWED_MIME.has(blueprint.mimeType.toLowerCase())) {
      res.status(400).json(createErrorResponse(
        new AppError('MISSING_REQUIRED_FIELD', '지원 이미지 형식: jpeg / png / webp'),
      ));
      return;
    }

    const rawRefs = Array.isArray(body.referenceDataUrls) ? body.referenceDataUrls : [];
    if (rawRefs.length > MAX_REFERENCES) {
      res.status(400).json(createErrorResponse(
        new AppError('MISSING_REQUIRED_FIELD', `referenceDataUrls 는 최대 ${MAX_REFERENCES}장`),
      ));
      return;
    }
    const references: { mimeType: string; base64: string }[] = [];
    for (const item of rawRefs) {
      const parsed = parseDataUrl(item);
      if (!parsed || !ALLOWED_MIME.has(parsed.mimeType.toLowerCase())) {
        // reference 는 옵션이므로 잘못된 항목은 조용히 스킵 (블루프린트만 있어도 동작)
        continue;
      }
      references.push(parsed);
    }

    try {
      const result = await withTimeout(
        gemini.generateTryOn(blueprint, references, { route: 'try-on', userId }),
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
