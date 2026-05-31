import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Express 경로 파라미터(UUID 컬럼을 가리키는 :id/:orderId/:roomId 등) 가드.
 * 값이 UUID 형식이 아니면 SQL(Postgres 22P02)까지 가기 전에 400 INVALID_INPUT 으로 응답한다.
 * - app.param(name, uuidParamGuard) 으로 메인 앱에, router.param(name, uuidParamGuard) 으로 서브라우터에 적용.
 * - 슬러그 허용 파라미터(:idOrSlug)에는 적용하지 말 것.
 */
export function uuidParamGuard(_req: Request, res: Response, next: NextFunction, val: string): void {
  if (!UUID_RE.test(val)) {
    const e = new AppError('INVALID_INPUT');
    res.status(e.httpStatus).json(createErrorResponse(e));
    return;
  }
  next();
}
