import type { Request, Response } from 'express';
import type { AuthService } from '../interfaces/auth-service';
import { AppError } from '../errors/app-error';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

export function createCallbackHandler(authService: AuthService) {
  return async (req: Request, res: Response): Promise<void> => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    if (!code || !state) { res.redirect(`${FRONTEND_URL}?error=missing_params`); return; }
    try {
      const result = await authService.handleCallback(code, state);
      const params = new URLSearchParams({ accessToken: result.accessToken, refreshToken: result.refreshToken, userId: result.user.id, email: result.user.email, name: result.user.name });
      res.redirect(`${FRONTEND_URL}?${params.toString()}`);
    } catch (error) {
      res.redirect(`${FRONTEND_URL}?error=${error instanceof AppError ? error.code : 'INTERNAL_ERROR'}`);
    }
  };
}
