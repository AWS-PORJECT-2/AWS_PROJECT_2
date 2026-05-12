import type { Request, Response } from 'express';
import type { TokenService } from '../interfaces/token-service.js';
import type { UserRepository } from '../repositories/user-repository.js';
import type { User } from '../types/index.js';
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

    // DB 조회만 try 로 좁힘. res.json 자체의 예외는 Express 기본 핸들러로 propagate.
    let user: User | null;
    try {
      user = await userRepo.findById(result.payload.userId);
    } catch (err) {
      logger.error({ err, userId: result.payload.userId, ip: req.ip }, '/me 사용자 조회 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
      return;
    }

    // 토큰은 유효하지만 사용자 row 가 사라진 케이스 (탈퇴/관리자 삭제 등).
    // NOT_AUTHENTICATED 와 구별하기 위해 410 GONE 으로 응답해 프론트가 다른 동작을 취하게 한다.
    if (!user) {
      logger.warn({ userId: result.payload.userId, ip: req.ip }, '토큰은 유효하나 사용자 row 없음');
      res.status(410).json({ error: 'USER_NOT_FOUND', message: '계정을 찾을 수 없습니다. 다시 로그인해주세요' });
      return;
    }

    res.json({
      userId: user.id,
      email: user.email,
      name: user.name,
      schoolDomain: user.schoolDomain,
      picture: user.picture ?? null,
    });
  };
}
