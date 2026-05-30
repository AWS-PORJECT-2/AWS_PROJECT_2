import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { pool } from '../db.js';
import { logAudit } from '../services/audit-log.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    // 4xx(클라이언트 오류)는 소음이므로 5xx 만 감사로그에 남긴다.
    if (err.httpStatus >= 500) {
      void logAudit(pool, {
        level: 'error',
        source: 'http',
        message: err.message,
        meta: { path: req.path, status: err.httpStatus, code: err.code },
        userId: req.userId ?? null,
      });
    }
    res.status(err.httpStatus).json(createErrorResponse(err));
    return;
  }

  const appErr = new AppError('INTERNAL_ERROR');
  void logAudit(pool, {
    level: 'error',
    source: 'http',
    message: err instanceof Error ? err.message : 'Unknown error',
    meta: { path: req.path, status: appErr.httpStatus, code: appErr.code },
    userId: req.userId ?? null,
  });
  res.status(500).json(createErrorResponse(appErr));
}
