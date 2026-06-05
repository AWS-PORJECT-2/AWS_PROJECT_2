import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { pool } from '../db.js';
import { logAudit } from '../services/audit-log.js';
import { logger } from '../logger.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    // 4xx(클라이언트 오류)는 소음이므로 5xx 만 감사로그에 남긴다.
    if (err.httpStatus >= 500) {
      logger.error({ err, method: req.method, path: req.originalUrl || req.path, status: err.httpStatus, code: err.code, userId: req.userId ?? null }, 'AppError 5xx');
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

  // body-parser(express.json/raw) 오류 — 전부 클라이언트 입력 문제다. 5xx(=감사로그 소음)로 새지 않게 정리.
  //  entity.too.large → 413(본문이 라우트 한도 초과), entity.parse.failed/charset → 400(깨진 JSON).
  const bodyErr = err as { type?: string; status?: number; statusCode?: number };
  if (bodyErr?.type === 'entity.too.large' || bodyErr?.status === 413 || bodyErr?.statusCode === 413) {
    const tooLarge = new AppError('PAYLOAD_TOO_LARGE');
    res.status(tooLarge.httpStatus).json(createErrorResponse(tooLarge));
    return;
  }
  if (bodyErr?.type === 'entity.parse.failed' || bodyErr?.type === 'charset.unsupported' || bodyErr?.type === 'encoding.unsupported') {
    const bad = new AppError('INVALID_INPUT');
    res.status(bad.httpStatus).json(createErrorResponse(bad));
    return;
  }

  // Postgres 형변환/길이 오류 — 잘못된 :id(비-UUID)·과대 입력 등 클라이언트 입력. 500 누출 대신 400 으로 정리.
  //  22P02 invalid_text_representation, 22003 numeric_value_out_of_range, 22001 string_data_right_truncation(컬럼 길이 초과).
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === '22P02' || pgCode === '22003' || pgCode === '22001') {
    const badReq = new AppError('INVALID_INPUT');
    res.status(badReq.httpStatus).json(createErrorResponse(badReq));
    return;
  }

  const appErr = new AppError('INTERNAL_ERROR');
  // 예상 못 한 오류 — 스택까지 stdout(pm2 로그)에 남긴다(감사로그 DB 와 별개).
  logger.error({ err, method: req.method, path: req.originalUrl || req.path, status: 500, userId: req.userId ?? null }, '처리되지 않은 요청 오류');
  void logAudit(pool, {
    level: 'error',
    source: 'http',
    message: err instanceof Error ? err.message : 'Unknown error',
    meta: { path: req.path, status: appErr.httpStatus, code: appErr.code },
    userId: req.userId ?? null,
  });
  res.status(500).json(createErrorResponse(appErr));
}
