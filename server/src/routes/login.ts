import type { Request, Response } from 'express';
import type { AuthService } from '../interfaces/auth-service.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function createLoginHandler(authService: AuthService) {
  return async (req: Request, res: Response): Promise<void> => {
    const { rememberMe, mobile } = req.body;
    try {
      const result = await authService.initiateLogin(rememberMe === true, mobile === true);
      // 웹: state 를 httpOnly 쿠키에도 심어 콜백에서 대조(로그인 CSRF/세션 픽세이션 방지).
      // 모바일('m_')은 시스템 브라우저에서 콜백이 돌아 WebView 쿠키를 못 보므로 면제(일회용 코드 흐름으로 보호).
      if (mobile !== true) {
        res.cookie('oauth_state', result.state, {
          httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/api/auth', maxAge: 5 * 60 * 1000,
        });
      }
      res.json(result);
    } catch (error) {
      if (error instanceof AppError) res.status(error.httpStatus).json(createErrorResponse(error));
      else res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
