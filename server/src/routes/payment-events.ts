import type { Request, Response, NextFunction } from 'express';
import type { PaymentService } from '../interfaces/payment-service.js';
import { AppError } from '../errors/app-error.js';

export function createPaymentEventsHandler(paymentService: PaymentService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new AppError('NOT_AUTHENTICATED');
      }

      const paymentId = req.params.id;
      if (!paymentId) {
        throw new AppError('MISSING_REQUIRED_FIELD', 'paymentId가 필요합니다');
      }

      const events = await paymentService.getPaymentEvents(paymentId);
      res.status(200).json({ events });
    } catch (err) {
      next(err);
    }
  };
}
