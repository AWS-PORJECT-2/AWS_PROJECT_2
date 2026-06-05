import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

/**
 * 액세스 로그 — 모든 API 요청을 한 줄씩 기록(사용자 동작 추적 + 에러 가시화).
 *
 * 응답 완료(res 'finish') 시점에 찍으므로 status·소요시간은 물론, 라우트의 인증 미들웨어가
 * 채운 req.userId 까지 함께 남는다. 레벨은 응답 status 로 자동 분기:
 *   2xx/3xx → info,  4xx → warn,  5xx → error  (에러가 로그에서 바로 눈에 띄게).
 *
 * - OPTIONS(CORS preflight) 는 소음이라 제외.
 * - 요청 본문은 남기지 않는다(비밀번호·결제·base64 이미지 등 민감/대용량 — 의도적으로 제외).
 *   동작 식별은 method+path 로 충분(예: POST /api/funds = 펀드 개설, POST /api/funds/:id/like = 찜).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // API 요청만 기록(정적 파일 js/css/이미지는 동작이 아니라 소음). 운영 EC2 는 사실상 /api 만 받음.
  if (req.method === 'OPTIONS' || !req.path.startsWith('/api')) { next(); return; }
  const start = Date.now();
  res.on('finish', () => {
    const status = res.statusCode;
    const rec = {
      method: req.method,
      path: req.originalUrl || req.url,
      status,
      durationMs: Date.now() - start,
      userId: (req as Request & { userId?: string }).userId ?? null,
      ip: req.ip,
      ua: req.get('user-agent') || undefined,
      ref: req.get('referer') || undefined,
    };
    if (status >= 500) logger.error(rec, 'req');
    else if (status >= 400) logger.warn(rec, 'req');
    else logger.info(rec, 'req');
  });
  next();
}
