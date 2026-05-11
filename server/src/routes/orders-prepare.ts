import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { AppError } from '../errors/app-error.js';

/**
 * POST /api/orders/prepare
 *
 * Client sends: { productId, size, quantity }
 * Server returns: { orderId, amount, customerKey, orderName }
 *
 * The server calculates the amount from DB (or mock data in InMemory mode).
 * The client NEVER sends price — only product selection info.
 */
export function createOrderPrepareHandler() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const body = req.body as Record<string, unknown>;
      const productId = body.productId as number | undefined;
      const size = (body.size as string) || 'Free';
      const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));

      if (!productId) {
        throw new AppError('MISSING_REQUIRED_FIELD', 'productId가 필요합니다');
      }

      // In production: query DB for product price
      // In InMemory/test mode: use a fixed test price or mock lookup
      // For now, use 1원 (test mode) — in production this would be a DB query
      const unitPrice = 1; // TODO: Replace with actual DB lookup when products table is ready

      const amount = unitPrice * quantity;
      const orderId = 'DOOTHING_' + Date.now() + '_' + randomUUID().slice(0, 8);
      const customerKey = 'user_' + userId;

      // TODO: Save order to DB with status 'PENDING' for later verification

      res.status(200).json({
        orderId,
        amount,
        customerKey,
        orderName: `두띵 공구 상품 #${productId}` + (quantity > 1 ? ` x${quantity}` : ''),
      });
    } catch (err) {
      next(err);
    }
  };
}
