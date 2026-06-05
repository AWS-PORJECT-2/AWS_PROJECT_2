import type { Request, Response } from 'express';
import type { ImageAiService } from '../services/ai/ai-interfaces.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { startAiJob } from '../services/ai/ai-jobs.js';
import { isValidCategory } from '../constants/categories.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_MODELS = new Set(['female', 'male', 'female_athletic', 'male_athletic']);
const ALLOWED_BG = new Set(['studio', 'campus', 'classroom', 'outdoor']);

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

export function createAiTryOnHandler(gemini: ImageAiService, timeoutMs: number) {
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
    // category 는 카테고리 slug(jacket/ecobag/...). 서비스가 의류=착용 / 굿즈=전시 모드로 매핑.
    const category = isValidCategory(String(body.category)) ? String(body.category) : 'etc';

    // 생성은 1분+ 걸릴 수 있어 비동기 작업으로 — jobId 즉시 반환, 프론트가 폴링으로 회수.
    const jobId = startAiJob(userId, 'try-on', async () => {
      const result = await gemini.generateTryOn(garments, { modelType, background, category }, { route: 'try-on', userId });
      return { tryOnDataUrl: `data:${result.mimeType};base64,${result.base64}` };
    });
    res.status(202).json({ jobId });
  };
}
