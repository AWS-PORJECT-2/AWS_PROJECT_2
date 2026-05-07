import { Router } from 'express';
import type { AiDesignGenerator } from '../interfaces/ai-design-generator.js';
import type { AiVirtualTryOn } from '../interfaces/ai-virtual-try-on.js';
import { createAiGenerateDesignHandler } from './ai-generate-design.js';
import { createAiTryOnHandler } from './ai-try-on.js';

/**
 * AI 라우터 — POST /api/ai/* 의 합본.
 *
 * createApp 에서 인증 미들웨어와 함께 마운트:
 *   app.use('/api/ai', authRequired, createAiRouter(designGen, tryOn));
 *
 * 어댑터 구현체 자체는 환경변수에 따라 바꿔 끼울 수 있다 (NullAi*, ComfyUi*, FashnAi* 등).
 */
export function createAiRouter(
  designGenerator: AiDesignGenerator,
  virtualTryOn: AiVirtualTryOn,
): Router {
  const router = Router();
  router.post('/designs/generate', createAiGenerateDesignHandler(designGenerator));
  router.post('/try-on', createAiTryOnHandler(virtualTryOn));
  return router;
}
