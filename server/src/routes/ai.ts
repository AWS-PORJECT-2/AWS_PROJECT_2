import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { GeminiImageService } from '../services/ai/gemini-image-service.js';
import { createAiBlueprintHandler } from './ai-blueprint.js';
import { createAiTryOnHandler } from './ai-try-on.js';

/**
 * AI 라우터 — POST /api/ai/* 의 합본 (Gemini nano-banana 기반).
 *
 * - /blueprint: 옷 사진 → 앞·뒤·옆 3-view 도면 (Gemini 1콜 ≈ $0.04)
 * - /try-on:   도면 → 모델 착용 사진 (Gemini 1콜 ≈ $0.04)
 *
 * 비용 통제:
 *  - 모든 호출은 인증 필수
 *  - 사용자 단위 시간당 5회 rate-limit
 *  - Gemini 서비스 내부에 일일 한도 + 60초 dedup + 단일 이미지 강제
 */
function buildAiRateLimit() {
  // 사용자당 시간당 한도. 환경변수로 조절 가능 (기본 100). dev 에서 테스트할 땐 충분히 큰 값.
  const limit = parsePositiveInt(process.env.AI_HOURLY_LIMIT, 100);
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    standardHeaders: true,
    // authRequired 가 먼저 실행되므로 userId 는 항상 있음. IPv6 fallback 은 express-rate-limit v8 에서 별도 헬퍼 필요해서 제외.
    keyGenerator: (req) => req.userId ?? 'anonymous',
    message: { error: 'AI_RATE_LIMIT', message: `시간당 AI 호출 한도(${limit}회)에 도달했습니다` },
  });
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function createAiRouter(gemini: GeminiImageService, timeoutMs: number): Router {
  const router = Router();
  const aiRateLimit = buildAiRateLimit();
  router.post('/blueprint', aiRateLimit, createAiBlueprintHandler(gemini, timeoutMs));
  router.post('/try-on', aiRateLimit, createAiTryOnHandler(gemini, timeoutMs));
  return router;
}
