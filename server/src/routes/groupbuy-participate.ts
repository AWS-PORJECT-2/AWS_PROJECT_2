import type { Request, Response, NextFunction } from 'express';
import type { PaymentService } from '../interfaces/payment-service.js';
import { AppError } from '../errors/app-error.js';

export function createGroupBuyParticipateHandler(paymentService: PaymentService) {
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

      const body = req.body as Record<string, unknown>;
      const cardInfo = body.cardInfo as Record<string, unknown> | undefined;
      const selectedOptions = body.selectedOptions as Record<string, string> | undefined;
      const quantity = body.quantity as number | undefined;

      if (!cardInfo || !selectedOptions || !quantity || quantity < 1) {
        throw new AppError('MISSING_REQUIRED_FIELD', 'cardInfo, selectedOptions, quantity가 필요합니다');
      }

      const result = await paymentService.participate(userId, groupbuyId, {
        cardInfo: cardInfo as any,
        selectedOptions,
        quantity,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };
}
