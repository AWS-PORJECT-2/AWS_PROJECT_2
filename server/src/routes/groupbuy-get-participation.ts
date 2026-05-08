import type { Request, Response, NextFunction } from 'express';
import type { PaymentService } from '../interfaces/payment-service.js';
import { AppError } from '../errors/app-error.js';

export function createGroupBuyGetParticipationHandler(paymentService: PaymentService) {
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

      const participation = await paymentService.getParticipation(userId, groupbuyId);
      if (!participation) {
        throw new AppError('PARTICIPATION_NOT_FOUND');
      }

      // Don't expose raw billing key in response
      const { billingKey: _bk, ...safeParticipation } = participation;
      res.status(200).json(safeParticipation);
    } catch (err) {
      next(err);
    }
  };
}
