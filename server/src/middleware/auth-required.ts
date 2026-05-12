import type { Request, Response, NextFunction } from 'express';
import type { TokenService } from '../interfaces/token-service.js';
import type { UserRepository } from '../repositories/user-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
    userEmail?: string;
  }
}

/**
 * httpOnly 쿠키의 accessToken 을 검증하고 사용자 존재까지 확인한 뒤 req.userId/userEmail 을 채운다.
 *
 * 단순 JWT 검증만으로 통과시키면, 탈퇴/관리자 삭제된 사용자가 유효 토큰만으로 결제·펀드 개설 등을
 * 계속 호출할 수 있어 위험. 그래서 모든 인증 라우트에서 DB 조회 한 번을 추가했다. 비용은 들지만
 * 보안·일관성이 우선.
 *
 * 응답 포맷은 다른 라우트와 동일하게 AppError + createErrorResponse 로 통일.
 * (인라인 JSON 으로 응답하면 글로벌 에러 핸들러가 추가하는 공통 필드가 빠짐)
 */
export function createAuthRequired(tokenService: TokenService, userRepo: UserRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    let user;
    try {
      user = await userRepo.findById(payload.userId);
    } catch (dbErr) {
      logger.error({ err: dbErr, userId: payload.userId, ip: req.ip }, 'auth-required DB 조회 실패');
      const err = new AppError('INTERNAL_ERROR');
      res.status(err.httpStatus).json(createErrorResponse(err));
      return;
    }
    if (!user) {
      // 토큰은 유효한데 사용자가 사라짐 — me.ts 와 동일하게 410 GONE 으로 구분.
      logger.warn({ userId: payload.userId, ip: req.ip }, '삭제된 사용자의 토큰 사용 시도');
      res.status(410).json({ error: 'USER_NOT_FOUND', message: '계정을 찾을 수 없습니다. 다시 로그인해주세요' });
      return;
    }

    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  };
}
