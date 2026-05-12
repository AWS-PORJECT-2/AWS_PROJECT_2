import type { Request, Response, NextFunction } from 'express';
import type { PaymentService } from '../interfaces/payment-service.js';
import { AppError } from '../errors/app-error.js';

export function createGroupBuyCancelParticipationHandler(paymentService: PaymentService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new AppError('NOT_AUTHENTICATED');
      }

      const groupbuyId = req.params.id;
      if (!groupbuyId) {
        throw new AppError('MISSING_REQUIRED_FIELD', 'groupbuyId가 필요합니다');
      }

      await paymentService.cancelParticipation(userId, groupbuyId);

      res.status(200).json({ status: 'cancelled' });
    } catch (err) {
      next(err);
    }
  };
}
