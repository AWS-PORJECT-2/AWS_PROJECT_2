import type { Request, Response, NextFunction } from 'express';
import type { PointService } from '../interfaces/point-service.js';
import { AppError } from '../errors/app-error.js';

/**
 * GET /api/me/points — 현재 사용자의 포인트 잔액 조회. (요구사항 7.3)
 * authRequired 미들웨어가 세팅한 req.userId 를 사용한다.
 */
export function createMePointsHandler(pointService: PointService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new AppError('NOT_AUTHENTICATED');
      }

      const { points } = await pointService.getBalance(userId);
      res.status(200).json({ points });
    } catch (err) {
      next(err);
    }
  };
}
