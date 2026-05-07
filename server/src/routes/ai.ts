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
 *   app.use('/api/ai', authRequired, createAiRouter(designGen, tryOn, AI_TIMEOUT_MS));
 *
 * timeoutMs 는 어댑터 호출 무한 대기 방지용. 라우트 레이어에서 한 번 더 보장한다
 * (어댑터 자체에도 fetchWithTimeout 가 있지만 조건부 폴링·재시도가 들어가면
 * 그쪽 타임아웃만으론 부족할 수 있음).
 */
export function createAiRouter(
  designGenerator: AiDesignGenerator,
  virtualTryOn: AiVirtualTryOn,
  timeoutMs: number,
): Router {
  const router = Router();
  router.post('/designs/generate', createAiGenerateDesignHandler(designGenerator, timeoutMs));
  router.post('/try-on', createAiTryOnHandler(virtualTryOn, timeoutMs));
  router.post('/garments/extract', createAiGarmentsExtractHandler());
  return router;
}
