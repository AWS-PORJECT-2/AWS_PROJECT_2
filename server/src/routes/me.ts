import type { Request, Response } from 'express';
import type { TokenService } from '../interfaces/token-service.js';

export function createMeHandler(tokenService: TokenService) {
  return (req: Request, res: Response): void => {
    const token = req.cookies?.accessToken;
    if (!token) { res.status(401).json({ error: 'NOT_AUTHENTICATED', message: '로그인이 필요합니다' }); return; }
    const payload = tokenService.verifyAccessToken(token);
    if (!payload) { res.status(401).json({ error: 'TOKEN_EXPIRED', message: '인증이 만료되었습니다' }); return; }
    res.json({ userId: payload.userId, email: payload.email });
  };
}
