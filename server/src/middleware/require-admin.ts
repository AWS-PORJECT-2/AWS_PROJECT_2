import type { Request, Response, NextFunction } from 'express';
import type { UserRepository } from '../repositories/user-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

/**
 * requireAdmin 미들웨어.
 * authRequired 뒤에 체이닝해서 사용한다.
 * req.userId 가 ADMIN role 인지 DB 에서 확인.
 */
export function createRequireAdmin(userRepo: UserRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      const err = new AppError('NOT_AUTHENTICATED');
      res.status(err.httpStatus).json(createErrorResponse(err));
      return;
    }

    try {
      const user = await userRepo.findById(userId);
      if (!user) {
        res.status(410).json({ error: 'USER_NOT_FOUND', message: '계정을 찾을 수 없습니다' });
        return;
      }
      if (user.role !== 'ADMIN') {
        logger.warn({ userId, ip: req.ip }, '관리자 권한 없는 사용자의 접근 시도');
        res.status(403).json({ error: 'FORBIDDEN', message: '관리자 권한이 필요합니다' });
        return;
      }
      next();
    } catch (err) {
      logger.error({ err, userId }, 'requireAdmin DB 조회 실패');
      const appErr = new AppError('INTERNAL_ERROR');
      res.status(appErr.httpStatus).json(createErrorResponse(appErr));
    }
  };
}
