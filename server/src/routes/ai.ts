import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { ImageAiService } from '../services/ai/ai-interfaces.js';
import type { PointService } from '../interfaces/point-service.js';
import { createAiBlueprintHandler } from './ai-blueprint.js';
import { createAiTryOnHandler } from './ai-try-on.js';
import { getAiJob } from '../services/ai/ai-jobs.js';

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

export function createAiRouter(gemini: ImageAiService, timeoutMs: number, pointService: PointService): Router {
  const router = Router();
  const aiRateLimit = buildAiRateLimit();
  router.post('/blueprint', aiRateLimit, createAiBlueprintHandler(gemini, timeoutMs, pointService));
  router.post('/try-on', aiRateLimit, createAiTryOnHandler(gemini, timeoutMs, pointService));
  // 비동기 생성 작업 폴링 — 항상 200(상태는 body 의 status 로). 본인 작업만 조회 가능.
  router.get('/jobs/:jobId', (req: Request, res: Response) => {
    const userId = req.userId;
    if (!userId) { res.status(401).json({ status: 'error', message: '로그인이 필요합니다' }); return; }
    const job = getAiJob(req.params.jobId);
    if (!job || job.userId !== userId) {
      res.json({ status: 'error', message: '생성 작업을 찾을 수 없어요(만료됐을 수 있어요). 다시 시도해 주세요.' });
      return;
    }
    if (job.status === 'pending') { res.json({ status: 'pending' }); return; }
    if (job.status === 'error') { res.json({ status: 'error', message: job.errMessage || 'AI 생성에 실패했어요' }); return; }
    res.json(Object.assign({ status: 'done' }, job.result));
    return;
  });
  return router;
}
