/**
 * 심사·시연용 테스트 로그인 — 코드 게이트.
 *
 * TEST_LOGIN_CODE 환경변수가 설정된 경우에만 동작한다(미설정 시 404, fail-closed).
 * 시연이 끝나면 .env 에서 TEST_LOGIN_CODE 를 제거하는 것만으로 완전히 비활성화된다.
 *
 * 보안 장치:
 *  - 코드 비교는 timingSafeEqual (타이밍 부채널 방지)
 *  - app.ts 에서 loginRateLimit 적용 (무차별 대입 방지)
 *  - 전용 테스트 계정(judge@kookmin.ac.kr) 고정 — 임의 이메일 사칭 불가
 *  - ADMIN 세션 발급 불가 (테스트 계정이 승격돼 있어도 거부)
 *  - 토큰 발급·저장은 실제 OAuth 콜백과 동일 정책 (refresh 회전·재사용 탐지 포함)
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { UserRepository } from '../repositories/user-repository.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token-repository.js';
import type { TokenService } from '../interfaces/token-service.js';
import { TokenServiceImpl } from '../services/token-service.js';
import { setAuthCookies } from '../utils/auth-cookies.js';
import { logger } from '../logger.js';

const TEST_USER_EMAIL = 'judge@kookmin.ac.kr';
const TEST_USER_NAME = '심사위원';

function codeMatches(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createTestLoginRouter(
  userRepo: UserRepository,
  refreshTokenRepo: RefreshTokenRepository,
  tokenService: TokenService,
) {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const expected = process.env.TEST_LOGIN_CODE;
      if (!expected) {
        // 기능 자체가 꺼져 있음 — 존재를 드러내지 않는다.
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }

      const code = typeof (req.body as Record<string, unknown>)?.code === 'string'
        ? ((req.body as Record<string, string>).code).trim()
        : '';
      if (!code || !codeMatches(code, expected)) {
        logger.warn({ ip: req.ip }, '[TEST-LOGIN] 잘못된 코드 시도');
        res.status(403).json({ error: 'INVALID_CODE', message: '코드가 올바르지 않습니다' });
        return;
      }

      let user = await userRepo.findByEmail(TEST_USER_EMAIL);
      if (!user) {
        user = await userRepo.create({
          id: randomUUID(),
          email: TEST_USER_EMAIL,
          name: TEST_USER_NAME,
          schoolDomain: 'kookmin.ac.kr',
          role: 'USER',
          createdAt: new Date(),
          lastLoginAt: new Date(),
        });
        // 시연 동선에 동의/온보딩 모달이 끼어들지 않도록 미리 처리
        await userRepo.setConsent(user.id, { marketingOptIn: false });
        await userRepo.updateProfile(user.id, { onboarded: true, nickname: TEST_USER_NAME });
      }
      // 테스트 계정이 어떤 경위로든 ADMIN 이 되어 있으면 발급 거부 (권한 상승 차단)
      if (user.role === 'ADMIN') {
        res.status(403).json({ error: 'FORBIDDEN', message: '테스트 로그인으로 관리자 계정에 접근할 수 없습니다' });
        return;
      }
      await userRepo.updateLastLogin(user.id);

      // 실제 OAuth 콜백(auth-service.handleCallback)과 동일한 토큰 발급·저장 정책.
      // rememberMe=true(30일) — 시연 중 refresh 만료로 끊기지 않게.
      const rememberMe = true;
      const accessToken = tokenService.generateAccessToken(user);
      const refreshToken = tokenService.generateRefreshToken(user, rememberMe);
      const now = new Date();
      await refreshTokenRepo.save({
        id: randomUUID(),
        userId: user.id,
        token: TokenServiceImpl.hashToken(refreshToken),
        rememberMe,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        createdAt: now,
      });

      setAuthCookies(res, { accessToken, refreshToken, rememberMe });
      logger.info({ userId: user.id }, '[TEST-LOGIN] 테스트 유저 로그인 성공');
      res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (err) {
      logger.error({ err }, '[TEST-LOGIN] 처리 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류' });
    }
  });

  return router;
}
