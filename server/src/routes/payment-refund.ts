import type { Request, Response, NextFunction } from 'express';
import type { PaymentService } from '../interfaces/payment-service.js';
import { AppError } from '../errors/app-error.js';

export function createPaymentRefundHandler(paymentService: PaymentService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new AppError('NOT_AUTHENTICATED');
      }

      const orderId = req.params.orderId;
      if (!orderId) {
        throw new AppError('MISSING_REQUIRED_FIELD', 'orderId가 필요합니다');
      }

      const body = req.body as Record<string, unknown>;
      const reason = body.reason as string | undefined;
      const amount = body.amount as number | undefined;

      if (!reason) {
        throw new AppError('MISSING_REQUIRED_FIELD', 'reason이 필요합니다');
      }

      const result = await paymentService.requestRefund(userId, orderId, { reason, amount });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}
