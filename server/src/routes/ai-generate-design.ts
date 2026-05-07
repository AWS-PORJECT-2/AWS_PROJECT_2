import type { Request, Response } from 'express';
import type { AiDesignGenerator } from '../interfaces/ai-design-generator.js';
import type { AiProductCategory } from '../types/ai.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';

const ALLOWED_CATEGORIES: AiProductCategory[] = ['varsity', 'tshirt', 'hoodie', 'ecobag', 'keyring', 'sticker'];
const MAX_PROMPT_LENGTH = 300;
const DEFAULT_COUNT = 3;
const MAX_COUNT = 4;

/**
 * POST /api/ai/designs/generate
 * body: { prompt, productCategory, count? }
 *
 * 인증 필요. 결과 design 레코드는 자동 INSERT(추후 design Repository 연결).
 */
export function createAiGenerateDesignHandler(generator: AiDesignGenerator) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('AUTH_FAILED')));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const productCategory = body.productCategory as AiProductCategory | undefined;
    const count = clampInt(body.count, 1, MAX_COUNT, DEFAULT_COUNT);

    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', 'prompt 누락 또는 길이 초과')));
      return;
    }
    if (!productCategory || !ALLOWED_CATEGORIES.includes(productCategory)) {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', 'productCategory 가 유효하지 않습니다')));
      return;
    }

    try {
      const designs = await generator.generate({ prompt, productCategory, count, userId });
      res.json({ designs });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.httpStatus).json(createErrorResponse(err));
        return;
      }
      res.status(503).json(createErrorResponse(new AppError('AI_UNAVAILABLE')));
    }
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? Math.floor(v) : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
