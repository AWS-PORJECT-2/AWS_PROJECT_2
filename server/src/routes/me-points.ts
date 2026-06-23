import type { Request, Response, NextFunction } from 'express';
import type { PointService } from '../interfaces/point-service.js';
import { AppError } from '../errors/app-error.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

// 내 포인트 잔액 조회. req.userId 는 authRequired 미들웨어가 채워준다.
export function createMePointsHandler(pointService: PointService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');
      const points = await pointService.getBalance(userId);
      res.json({ points });
    } catch (err) {
      next(err);
    }
  };
}

// 내 포인트 거래 내역(최신순). limit 1..100(기본 50), offset >=0(기본 0).
export function createMePointsTransactionsHandler(pointService: PointService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const parsedLimit = Number(req.query.limit);
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(parsedLimit)))
        : DEFAULT_LIMIT;

      const parsedOffset = Number(req.query.offset);
      const offset = Number.isFinite(parsedOffset) ? Math.max(0, Math.trunc(parsedOffset)) : 0;

      const transactions = await pointService.getTransactions(userId, limit, offset);
      res.json({ transactions });
    } catch (err) {
      next(err);
    }
  };
}
