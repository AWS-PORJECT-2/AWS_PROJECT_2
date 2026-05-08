import type { Request, Response, NextFunction } from 'express';
import type { PaymentService } from '../interfaces/payment-service.js';
import { AppError } from '../errors/app-error.js';

export function createMeOrdersHandler(paymentService: PaymentService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new AppError('NOT_AUTHENTICATED');
      }

      const orders = await paymentService.getUserOrders(userId);
      res.status(200).json({ orders });
    } catch (err) {
      next(err);
    }
  };
}
