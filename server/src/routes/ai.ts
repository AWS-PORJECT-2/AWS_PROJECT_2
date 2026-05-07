import { Router } from 'express';
import type { AiDesignGenerator } from '../interfaces/ai-design-generator.js';
import type { AiVirtualTryOn } from '../interfaces/ai-virtual-try-on.js';
import { createAiGenerateDesignHandler } from './ai-generate-design.js';
import { createAiTryOnHandler } from './ai-try-on.js';
import { createAiGarmentsExtractHandler } from './ai-garments-extract.js';

/**
 * AI 라우터 — POST /api/ai/* 의 합본.
 *
 * createApp 에서 인증 미들웨어와 함께 마운트:
 *   app.use('/api/ai', authRequired, createAiRouter(designGen, tryOn));
 */
export function createAiRouter(
  designGenerator: AiDesignGenerator,
  virtualTryOn: AiVirtualTryOn,
): Router {
  const router = Router();
  router.post('/designs/generate', createAiGenerateDesignHandler(designGenerator));
  router.post('/try-on', createAiTryOnHandler(virtualTryOn));
  router.post('/garments/extract', createAiGarmentsExtractHandler());
  return router;
}
