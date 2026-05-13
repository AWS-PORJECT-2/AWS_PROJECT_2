import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { MySQLUserRepository } from '../repositories/mysql-user-repository.js';

/**
 * 개발용 간이 인증.
 * - JWT/OAuth 우회. 쿠키에 userId만 저장.
 * - 프론트의 '테스트 유저 / 관리자 로그인' 버튼이 호출.
 *
 * 운영 환경에선 절대 사용 금지. NODE_ENV=production 이면 비활성화.
 */
export function createDevAuthRouter(userRepo: MySQLUserRepository): Router {
  const router = Router();

  // POST /api/dev-auth/login - username으로 즉시 로그인
  router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const username = String(req.body?.username || '').trim();
      if (!username) {
        res.status(400).json({ error: 'MISSING_USERNAME', message: 'username이 필요합니다' });
        return;
      }

      const user = await userRepo.findByUsername(username);
      if (!user) {
        res.status(404).json({ error: 'USER_NOT_FOUND', message: '존재하지 않는 사용자입니다' });
        return;
      }

      // dev 쿠키 발급 (httpOnly, sameSite=lax)
      res.cookie('devUserId', String(user.id), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000, // 24h
      });

      res.json({
        userId: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/dev-auth/me - 현재 로그인 사용자
  router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userIdStr = req.cookies?.devUserId;
      if (!userIdStr) {
        res.status(401).json({ error: 'NOT_AUTHENTICATED', message: '로그인이 필요합니다' });
        return;
      }
      const userId = parseInt(userIdStr, 10);
      if (!Number.isInteger(userId)) {
        res.status(401).json({ error: 'INVALID_SESSION', message: '세션이 유효하지 않습니다' });
        return;
      }

      const user = await userRepo.findById(userId);
      if (!user) {
        res.clearCookie('devUserId', { path: '/' });
        res.status(401).json({ error: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다' });
        return;
      }

      res.json({
        userId: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/dev-auth/logout
  router.post('/logout', (_req: Request, res: Response) => {
    res.clearCookie('devUserId', { path: '/' });
    res.json({ ok: true });
  });

  return router;
}

/**
 * 인증 미들웨어. devUserId 쿠키를 검증하고 req.userId / req.userRole 을 채운다.
 */
export function createDevAuthRequired(userRepo: MySQLUserRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userIdStr = req.cookies?.devUserId;
    if (!userIdStr) {
      res.status(401).json({ error: 'NOT_AUTHENTICATED', message: '로그인이 필요합니다' });
      return;
    }
    const userId = parseInt(userIdStr, 10);
    if (!Number.isInteger(userId)) {
      res.status(401).json({ error: 'INVALID_SESSION', message: '세션이 유효하지 않습니다' });
      return;
    }

    const user = await userRepo.findById(userId);
    if (!user) {
      res.status(401).json({ error: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다' });
      return;
    }

    req.userId = String(user.id);
    req.userEmail = user.username;
    (req as Request & { userRole?: 'USER' | 'ADMIN' }).userRole = user.role;
    next();
  };
}

/**
 * 관리자 전용 미들웨어.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = (req as Request & { userRole?: 'USER' | 'ADMIN' }).userRole;
  if (role !== 'ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: '관리자 권한이 필요합니다' });
    return;
  }
  next();
}
