import type { Request, Response } from 'express';
import type { AuthService } from '../interfaces/auth-service.js';
import type { TokenService } from '../interfaces/token-service.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function createLogoutHandler(authService: AuthService, tokenService: TokenService) {
  return (req: Request, res: Response): void => {
    const accessToken = req.cookies?.accessToken;
    if (accessToken) {
      const payload = tokenService.verifyAccessToken(accessToken);
      if (payload) {
        authService.logout(payload.userId);
      }
    }
    res.clearCookie('accessToken', { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/api/auth' });
    res.clearCookie('refreshToken', { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'strict', path: '/api/auth' });
    res.json({ success: true });
  };
}
