import type { Request, Response, NextFunction } from 'express';
import type { TokenService } from '../interfaces/token-service.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
    userEmail?: string;
  }
}

/**
 * httpOnly 쿠키의 accessToken 을 검증하고 req.userId, req.userEmail 을 채운다.
 * 미인증·만료 토큰은 401 응답.
 */
export function createAuthRequired(tokenService: TokenService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.cookies?.accessToken;
    if (!token) {
      res.status(401).json({ error: 'NOT_AUTHENTICATED', message: '로그인이 필요합니다' });
      return;
    }
    const payload = tokenService.verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({ error: 'INVALID_TOKEN', message: '유효하지 않은 인증입니다' });
      return;
    }
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  };
}
