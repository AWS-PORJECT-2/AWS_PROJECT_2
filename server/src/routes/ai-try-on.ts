import type { Request, Response } from 'express';
import type { AiVirtualTryOn } from '../interfaces/ai-virtual-try-on.js';
import type { AiTryOnRequest } from '../types/ai.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { withTimeout } from '../utils/fetch-with-timeout.js';

const ALLOWED_MODEL_TYPES: AiTryOnRequest['modelType'][] =
  ['female', 'male', 'female_athletic', 'male_athletic'];
const ALLOWED_BACKGROUNDS: AiTryOnRequest['background'][] =
  ['campus', 'studio', 'classroom', 'outdoor'];

/**
 * POST /api/ai/try-on
 * body: { designId, modelType, background }
 *
 * 인증 필요. 결과 이미지는 영구 저장된 URL 배열.
 * timeoutMs 안에 응답이 안 오면 AI_TIMEOUT(504) 로 떨어진다.
 */
export function createAiTryOnHandler(provider: AiVirtualTryOn, timeoutMs: number) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('AUTH_FAILED')));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const designId = typeof body.designId === 'string' ? body.designId : '';
    const modelType = body.modelType as AiTryOnRequest['modelType'];
    const background = body.background as AiTryOnRequest['background'];

    if (!designId) {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', 'designId 누락')));
      return;
    }
    if (!ALLOWED_MODEL_TYPES.includes(modelType)) {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', 'modelType 가 유효하지 않습니다')));
      return;
    }
    if (!ALLOWED_BACKGROUNDS.includes(background)) {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', 'background 가 유효하지 않습니다')));
      return;
    }

    try {
      const result = await withTimeout(
        provider.generate({ designId, modelType, background, userId }),
        timeoutMs,
      );
      res.json(result);
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.httpStatus).json(createErrorResponse(err));
        return;
      }
      res.status(503).json(createErrorResponse(new AppError('AI_UNAVAILABLE')));
    }
  };
}
