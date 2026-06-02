import type { Request, Response } from 'express';
import type { GeminiImageService } from '../services/ai/gemini-image-service.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { withTimeout } from '../utils/fetch-with-timeout.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_IMAGES = 5;

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

/**
 * POST /api/ai/blueprint
 * body: { imageDataUrls: ['data:image/jpeg;base64,...', ...] }   (1~5장)
 *   (단일 imageDataUrl 도 호환 — 자동으로 길이 1 배열로 변환)
 * response: { blueprintDataUrl: 'data:image/png;base64,...' }
 *
 * 옷 사진 1~5장 → 앞·뒤·옆 도면 1장. Gemini 호출 1회.
 */
export function createAiBlueprintHandler(gemini: GeminiImageService, timeoutMs: number) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED')));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    // 호환: 구버전 client 가 imageDataUrl(단수) 로 보내도 받음
    const rawList = Array.isArray(body.imageDataUrls)
      ? body.imageDataUrls
      : typeof body.imageDataUrl === 'string' ? [body.imageDataUrl] : [];

    if (rawList.length === 0) {
      res.status(400).json(createErrorResponse(
        new AppError('MISSING_REQUIRED_FIELD', 'imageDataUrls 가 비어 있습니다 (1~5장 필요)'),
      ));
      return;
    }
    if (rawList.length > MAX_IMAGES) {
      res.status(400).json(createErrorResponse(
        new AppError('MISSING_REQUIRED_FIELD', `이미지는 최대 ${MAX_IMAGES} 장까지 첨부 가능합니다`),
      ));
      return;
    }

    const parsedList: { mimeType: string; base64: string }[] = [];
    for (const item of rawList) {
      if (typeof item !== 'string') {
        res.status(400).json(createErrorResponse(
          new AppError('MISSING_REQUIRED_FIELD', 'imageDataUrls 항목은 문자열이어야 합니다'),
        ));
        return;
      }
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
      parsedList.push(parsed);
    }

    try {
      const category = typeof body.category === 'string' ? body.category : 'etc';
      const result = await withTimeout(
        gemini.generateBlueprint(parsedList, { route: 'blueprint', userId }, category),
        timeoutMs,
      );
      res.json({ blueprintDataUrl: `data:${result.mimeType};base64,${result.base64}` });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.httpStatus).json(createErrorResponse(err));
        return;
      }
      res.status(503).json(createErrorResponse(new AppError('AI_UNAVAILABLE')));
    }
  };
}
