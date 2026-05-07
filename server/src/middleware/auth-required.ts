import type { Request, Response, NextFunction } from 'express';
import type { TokenService } from '../interfaces/token-service.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
    userEmail?: string;
  }
}

/**
 * httpOnly 쿠키의 accessToken 을 검증하고 req.userId, req.userEmail 을 채운다.
 * 미인증·만료 토큰은 401 응답.
 *
 * 응답 포맷은 다른 라우트와 동일하게 AppError + createErrorResponse 로 통일한다.
 * (인라인 JSON 으로 응답하면 글로벌 에러 핸들러가 추가하는 공통 필드가 빠짐)
 */
export function createAuthRequired(tokenService: TokenService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.cookies?.accessToken;
    if (!token) {
      const err = new AppError('NOT_AUTHENTICATED');
      res.status(err.httpStatus).json(createErrorResponse(err));
      return;
    }
    const payload = tokenService.verifyAccessToken(token);
    if (!payload) {
      const err = new AppError('INVALID_TOKEN');
      res.status(err.httpStatus).json(createErrorResponse(err));
      return;
    }
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  };
}
