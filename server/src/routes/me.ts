import type { Request, Response } from 'express';
import type { TokenService } from '../interfaces/token-service.js';
import type { UserRepository } from '../repositories/user-repository.js';
import { logger } from '../logger.js';

export function createMeHandler(tokenService: TokenService, userRepo: UserRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const token = req.cookies?.accessToken;
    if (!token) { res.status(401).json({ error: 'NOT_AUTHENTICATED', message: '로그인이 필요합니다' }); return; }
    const result = tokenService.verifyAccessTokenDetailed(token);
    if (!result.valid) {
      logger.warn({ reason: result.reason, ip: req.ip }, '무효 토큰 사용 시도');
      if (result.reason === 'expired') {
        res.status(401).json({ error: 'TOKEN_EXPIRED', message: '인증이 만료되었습니다' });
      } else {
        res.status(401).json({ error: 'INVALID_TOKEN', message: '유효하지 않은 인증입니다' });
      }
      return;
    }

    try {
      const user = await userRepo.findById(result.payload.userId);
      if (!user) {
        res.status(401).json({ error: 'NOT_AUTHENTICATED', message: '로그인이 필요합니다' });
        return;
      }

      res.json({
        userId: user.id,
        email: user.email,
        name: user.name,
        schoolDomain: user.schoolDomain,
        picture: user.picture ?? null,
      });
    } catch (err) {
      logger.error({ err, userId: result.payload.userId, ip: req.ip }, '/me 사용자 조회 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  };
}
