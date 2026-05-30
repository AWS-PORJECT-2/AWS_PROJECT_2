import type { Request, Response, NextFunction } from 'express';
import type { OrderRepository } from '../repositories/order-repository.js';
import type { OrderStatus } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

const VALID_SHIPPING_TRANSITIONS: Record<string, OrderStatus[]> = {
  paid: ['shipping_ready'],
  shipping_ready: ['shipping'],
  shipping: ['delivered'],
};

/**
 * PATCH /api/orders/:id/shipping
 * body: { status: 'shipping_ready' | 'shipping' | 'delivered' }
 */
export function createOrderShippingHandler(orderRepo: OrderRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED')));
        return;
      }

      const { id } = req.params;
      const { status } = req.body as { status?: string };

      if (!status || !['shipping_ready', 'shipping', 'delivered'].includes(status)) {
        res.status(400).json({ error: 'INVALID_STATUS', message: 'status는 shipping_ready, shipping, delivered 중 하나여야 합니다' });
        return;
      }

      const order = await orderRepo.findById(id);
      if (!order) {
        res.status(404).json(createErrorResponse(new AppError('ORDER_NOT_FOUND')));
        return;
      }

      // 권한 검증: 주문 소유자만 상태 변경 가능
      // 단, 'delivered'는 구매자가 직접 마킹할 수 없음 (관리자/판매자 전용)
      if (order.userId !== userId) {
        res.status(403).json({ error: 'FORBIDDEN', message: '해당 주문에 대한 권한이 없습니다' });
        return;
      }

      if (status === 'delivered') {
        res.status(403).json({ error: 'FORBIDDEN', message: '배송 완료는 관리자만 처리할 수 있습니다' });
        return;
      }

      const allowed = VALID_SHIPPING_TRANSITIONS[order.status];
      if (!allowed || !allowed.includes(status as OrderStatus)) {
        res.status(400).json({ error: 'INVALID_TRANSITION', message: `현재 상태(${order.status})에서 ${status}로 변경할 수 없습니다` });
        return;
      }

      await orderRepo.updateStatus(id, status as OrderStatus);
      logger.info({ orderId: id, from: order.status, to: status }, '배송 상태 변경');
      res.json({ success: true, orderId: id, status });
    } catch (err) {
      next(err); // 처리 안 된 async 거부 → errorHandler 로 위임(무한로딩 방지)
    }
  };
}

/**
 * GET /api/orders/status-counts
 * 현재 유저의 주문 상태별 카운트 반환
 */
export function createOrderStatusCountsHandler(orderRepo: OrderRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED')));
        return;
      }

      const orders = await orderRepo.findByUserId(userId);
      const counts = {
        paymentPending: 0,
        paidReady: 0,
        shipping: 0,
        delivered: 0,
      };

      for (const order of orders) {
        if (order.status === 'pending') counts.paymentPending++;
        else if (order.status === 'paid' || order.status === 'shipping_ready') counts.paidReady++;
        else if (order.status === 'shipping') counts.shipping++;
        else if (order.status === 'delivered') counts.delivered++;
      }

      res.json(counts);
    } catch (err) {
      next(err);
    }
  };
}
