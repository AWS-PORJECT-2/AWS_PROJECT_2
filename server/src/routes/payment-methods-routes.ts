import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PaymentMethodService } from '../services/payment-method-service-impl.js';
import type { PaymentMethod } from '../types/index.js';
import { AppError } from '../errors/app-error.js';

const VALID_CHANNEL_TYPES: PaymentMethod['channelType'][] = ['TOSSPAY', 'KAKAOPAY', 'NAVERPAY', 'CARD_DIRECT'];

export function createPaymentMethodsHandlers(service: PaymentMethodService): Router {
  const router = Router();

  // POST /api/payment-methods — register
  router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const body = req.body as Record<string, unknown>;
      const channelType = body.channelType as string | undefined;
      const billingKeyRef = body.billingKeyRef as string | undefined;

      if (!channelType || !billingKeyRef) {
        throw new AppError('MISSING_REQUIRED_FIELD', 'channelType, billingKeyRef가 필요합니다');
      }

      if (!VALID_CHANNEL_TYPES.includes(channelType as PaymentMethod['channelType'])) {
        throw new AppError('MISSING_REQUIRED_FIELD', `유효하지 않은 channelType: ${channelType}`);
      }

      const result = await service.register(userId, {
        pgProvider: (body.pgProvider as string) ?? undefined,
        channelType: channelType as PaymentMethod['channelType'],
        billingKeyRef,
        cardName: (body.cardName as string) ?? undefined,
        cardLastFour: (body.cardLastFour as string) ?? undefined,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/payment-methods — list
  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const result = await service.list(userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/payment-methods/:id/default — setDefault
  router.patch('/:id/default', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const { id } = req.params;
      const result = await service.setDefault(userId, id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/payment-methods/:id — delete
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const { id } = req.params;
      await service.delete(userId, id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
