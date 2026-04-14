import type { Request, Response } from 'express';
import type { AuthService } from '../interfaces/auth-service';
import { AppError } from '../errors/app-error';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function createCallbackHandler(authService: AuthService) {
  return async (req: Request, res: Response): Promise<void> => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    if (!code || !state) { res.redirect(`${FRONTEND_URL}?error=missing_params`); return; }
    try {
      const result = await authService.handleCallback(code, state);
      res.cookie('accessToken', result.accessToken, {
        httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', maxAge: 15 * 60 * 1000,
      });
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      res.redirect(`${FRONTEND_URL}?login=success`);
    } catch (error) {
      res.redirect(`${FRONTEND_URL}?error=${error instanceof AppError ? error.code : 'INTERNAL_ERROR'}`);
    }
  };
}
