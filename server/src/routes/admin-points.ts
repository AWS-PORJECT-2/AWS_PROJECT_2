import type { Request, Response, NextFunction } from 'express';
import type { PointService } from '../interfaces/point-service.js';
import { AppError } from '../errors/app-error.js';

// 관리자: 특정 사용자 포인트 조회(잔액 + 최근 거래). 관리자 게이트는 라우트 레벨 requireAdmin 이 담당.
export function createAdminGetUserPointsHandler(pointService: PointService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.params.userId;
      if (!userId) throw new AppError('MISSING_REQUIRED_FIELD', '사용자 ID가 필요합니다');
      const [points, transactions] = await Promise.all([
        pointService.getBalance(userId),
        pointService.getTransactions(userId, 50, 0),
      ]);
      res.json({ userId, points, transactions });
    } catch (err) {
      next(err);
    }
  };
}

// 관리자: 특정 사용자 포인트 조정. mode=delta(가감) | set(잔액 지정).
export function createAdminAdjustUserPointsHandler(pointService: PointService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.params.userId;
      if (!userId) throw new AppError('MISSING_REQUIRED_FIELD', '사용자 ID가 필요합니다');

      const body = req.body ?? {};
      const mode = body.mode;
      if (mode !== 'delta' && mode !== 'set') {
        throw new AppError('MISSING_REQUIRED_FIELD', "mode 는 'delta' 또는 'set' 이어야 합니다");
      }

      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!reason) throw new AppError('MISSING_REQUIRED_FIELD', '조정 사유를 입력해 주세요');

      let result;
      if (mode === 'delta') {
        const amount = body.amount;
        if (!Number.isInteger(amount) || amount === 0) {
          throw new AppError('MISSING_REQUIRED_FIELD', 'amount 는 0이 아닌 정수여야 합니다');
        }
        result = await pointService.adminAdjust(userId, amount, reason);
      } else {
        const balance = body.balance;
        if (!Number.isInteger(balance) || balance < 0) {
          throw new AppError('MISSING_REQUIRED_FIELD', 'balance 는 0 이상의 정수여야 합니다');
        }
        result = await pointService.adminSetBalance(userId, balance, reason);
      }

      if (result.ok === false) {
        res.status(409).json({
          error: 'ADJUSTMENT_REJECTED',
          message: '조정 결과 잔액이 음수가 되어 거부되었습니다',
          balanceAfter: result.balanceAfter,
        });
        return;
      }

      res.json({ userId, ok: true, balanceAfter: result.balanceAfter, transaction: result.transaction });
    } catch (err) {
      next(err);
    }
  };
}
