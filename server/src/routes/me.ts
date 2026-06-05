import type { Request, Response } from 'express';
import type { TokenService } from '../interfaces/token-service.js';
import type { UserRepository } from '../repositories/user-repository.js';
import type { User } from '../types/index.js';
import { logger } from '../logger.js';
import { serializeMe } from './profile-serializer.js';
import { accessBlock, isSuspensionExpired } from '../utils/account-status.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

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

    // 제재 게이트 — auth-required 와 동일 규칙. 정지/차단/탈퇴 계정은 /me 도 차단해야 프론트가
    // 세션 종료로 인식한다(미적용 시 유효 토큰 동안 로그인 상태로 계속 렌더됨). 쿠키도 정리해 세션을 끊는다.
    const block = accessBlock(user);
    if (block) {
      res.clearCookie('accessToken', { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/' });
      res.clearCookie('refreshToken', { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/api/auth' });
      const suffix = block.code === 'USER_SUSPENDED' && block.until ? ` (해제 예정: ${block.until.toISOString()})` : '';
      const messages: Record<typeof block.code, string> = {
        USER_SUSPENDED: '정지된 계정입니다. 관리자에게 문의해 주세요',
        USER_BANNED: '이용이 영구 제한된 계정입니다. 관리자에게 문의해 주세요',
        ACCOUNT_WITHDRAWN: '탈퇴 처리된 계정입니다',
      };
      res.status(403).json({ error: block.code, message: messages[block.code] + suffix });
      return;
    }
    // 만료된 기간정지 자동 복구(best-effort) — 실패해도 응답엔 영향 없게 .catch 로 흡수.
    if (isSuspensionExpired(user)) { userRepo.clearExpiredSuspension(user.id).catch((err) => logger.warn({ err, userId: user!.id }, '만료 정지 자동복구 실패')); }

    res.json(serializeMe(user));
  };
}
