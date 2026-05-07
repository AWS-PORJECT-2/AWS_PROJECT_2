import type { Request, Response } from 'express';
import type { AuthService } from '../interfaces/auth-service.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function createRefreshHandler(authService: AuthService) {
  return async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD')));
      return;
    }
    try {
      const result = await authService.refreshToken(refreshToken);
      res.cookie('accessToken', result.accessToken, {
        httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/api/auth', maxAge: 15 * 60 * 1000,
      });
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true, secure: IS_PRODUCTION, sameSite: 'strict', path: '/api/auth', maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      logger.info({ ip: req.ip }, '토큰 갱신 성공');
      res.json({ success: true });
    } catch (error) {
      const errorCode = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      logger.warn({ errorCode, ip: req.ip }, '토큰 갱신 실패');
      if (error instanceof AppError) res.status(error.httpStatus).json(createErrorResponse(error));
      else res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
