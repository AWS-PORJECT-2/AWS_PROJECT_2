/**
 * 개발 전용 인증 라우트.
 * 운영 환경(NODE_ENV=production)에서는 절대 등록되지 않는다.
 * app.ts 에서 if (process.env.NODE_ENV !== 'production') 가드 안에서만 마운트.
 *
 * 개발 환경에서 OAuth 없이 토큰을 발급받기 위한 엔드포인트(운영에선 마운트 안 됨). 별도 프론트 페이지 없음.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { UserRepository } from '../repositories/user-repository.js';
import type { TokenService } from '../interfaces/token-service.js';
import type { EmailValidator } from '../interfaces/email-validator.js';
import { logger } from '../logger.js';

export function createDevAuthRouter(userRepo: UserRepository, tokenService: TokenService, emailValidator?: EmailValidator) {
  const router = Router();

  // 개발용 로그인 — 이메일만으로 즉시 토큰 발급
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { email } = req.body as { email?: string };
      if (!email) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'email 필수' });
        return;
      }
      // 도메인 허용목록 강제(실제 OAuth 경로와 동일 기준) — 임의 외부 이메일 사칭 차단.
      // isAllowedDomain 은 형식 불량 이메일에 throw 하므로 try/catch 로 403 매핑(500 누출 방지).
      if (emailValidator) {
        let domainOk = false;
        try { domainOk = emailValidator.isAllowedDomain(email); } catch { domainOk = false; }
        if (!domainOk) {
          res.status(403).json({ error: 'INVALID_EMAIL_DOMAIN', message: '허용되지 않은 이메일 도메인' });
          return;
        }
      }

      let user = await userRepo.findByEmail(email);
      // 관리자 계정 사칭 차단 — dev 로그인으로는 ADMIN 세션을 발급하지 않는다(권한 상승 방지).
      if (user && user.role === 'ADMIN') {
        res.status(403).json({ error: 'FORBIDDEN', message: 'dev 로그인으로 관리자 계정에 접근할 수 없습니다' });
        return;
      }
      if (!user) {
        // 개발 환경에서는 자동 생성
        const { randomUUID } = await import('node:crypto');
        const domain = email.split('@')[1] ?? 'kookmin.ac.kr';
        user = await userRepo.create({
          id: randomUUID(),
          email: email.toLowerCase(),
          name: email.split('@')[0],
          schoolDomain: domain,
          role: 'USER',
          createdAt: new Date(),
          lastLoginAt: new Date(),
        });
      }

      const accessToken = tokenService.generateAccessToken(user);
      const refreshToken = tokenService.generateRefreshToken(user, false);

      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: false, // dev 전용
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
      });
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (err) {
      logger.error({ err }, 'dev-auth login 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류' });
    }
  });

  // 현재 사용자 조회
  router.get('/me', async (req: Request, res: Response) => {
    try {
      const token = req.cookies?.accessToken;
      if (!token) {
        res.status(401).json({ error: 'NOT_AUTHENTICATED', message: '로그인 필요' });
        return;
      }
      const payload = tokenService.verifyAccessToken(token);
      if (!payload) {
        res.status(401).json({ error: 'INVALID_TOKEN', message: '토큰 만료 또는 무효' });
        return;
      }
      const user = await userRepo.findById(payload.userId);
      if (!user) {
        res.status(401).json({ error: 'USER_NOT_FOUND', message: '사용자 없음' });
        return;
      }
      res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (err) {
      logger.error({ err }, 'dev-auth me 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류' });
    }
  });

  // 로그아웃
  router.post('/logout', (_req: Request, res: Response) => {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.json({ success: true });
  });

  return router;
}
