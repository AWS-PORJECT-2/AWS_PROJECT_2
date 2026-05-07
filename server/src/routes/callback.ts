import type { Request, Response } from 'express';
import type { AuthService } from '../interfaces/auth-service.js';
import { AppError } from '../errors/app-error.js';
import { logger } from '../logger.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function createCallbackHandler(authService: AuthService) {
  return async (req: Request, res: Response): Promise<void> => {
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    if (!code || !state) { res.redirect(`${FRONTEND_URL}?error=missing_params`); return; }
    try {
      const result = await authService.handleCallback(code, state);
      const refreshMaxAge = result.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      res.cookie('accessToken', result.accessToken, {
        httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/', maxAge: 15 * 60 * 1000,
      });
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true, secure: IS_PRODUCTION, sameSite: 'strict', path: '/api/auth', maxAge: refreshMaxAge,
      });
      logger.info({ email: result.user.email }, '인증 성공');
      res.redirect(`${FRONTEND_URL}?login=success`);
    } catch (error) {
      const errorCode = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      logger.warn({ errorCode, ip: req.ip }, '인증 실패');
      res.redirect(`${FRONTEND_URL}?error=login_failed`);
    }
  };
}
