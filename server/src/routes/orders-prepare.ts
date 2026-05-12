import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { AppError } from '../errors/app-error.js';
import type { OrderRepository } from '../repositories/order-repository.js';
import type { Order } from '../types/index.js';

/**
 * POST /api/orders/prepare
 *
 * Client sends: { productId, size, quantity }
 * Server returns: { orderId, amount, customerKey, orderName }
 *
 * 서버가 금액을 계산하고 PENDING 상태로 DB에 선제 저장.
 * 승인(confirm) 단계에서 이 레코드와 대조하여 금액 변조를 방지.
 */
export function createOrderPrepareHandler(orderRepo: OrderRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const body = req.body as Record<string, unknown>;
      const productId = Number(body.productId);
      const size = (body.size as string) || 'Free';
      const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));

      if (!Number.isInteger(productId) || productId <= 0) {
        throw new AppError('MISSING_REQUIRED_FIELD', '유효한 상품 ID(양의 정수)가 필요합니다');
      }

      // In production: query DB for product price
      const unitPrice = 1; // TODO: Replace with actual DB lookup when products table is ready

      const amount = unitPrice * quantity;
      const orderId = 'DOOTHING_' + Date.now() + '_' + randomUUID().slice(0, 8);
      const customerKey = 'user_' + userId;
      const now = new Date();

      // DB에 PENDING 상태로 주문 선제 저장
      const order: Order = {
        id: orderId,
        kind: 'one_off',
        participationId: null,
        userId,
        groupbuyId: null,
        productRef: String(productId),
        amount,
        status: 'pending',
        pgPaymentId: null,
        retryCount: 0,
        nextRetryAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await orderRepo.create(order);

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
