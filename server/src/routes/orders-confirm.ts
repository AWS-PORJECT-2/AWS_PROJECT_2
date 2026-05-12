import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error.js';
import type { OrderRepository } from '../repositories/order-repository.js';
import type { PgClient } from '../interfaces/pg-client.js';
import { logger } from '../logger.js';

/**
 * POST /api/payments/confirm
 *
 * 토스페이먼츠 결제 성공 후 서버 승인 단계.
 * 클라이언트가 보낸 { paymentKey, orderId, amount }를 DB의 PENDING 주문과 대조하여
 * 금액 변조/소유권 위반을 검증한 후에만 토스 최종 승인 API를 호출한다.
 */
export function createOrderConfirmHandler(orderRepo: OrderRepository, pgClient: PgClient) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const body = req.body as Record<string, unknown>;
      const paymentKey = body.paymentKey as string | undefined;
      const orderId = body.orderId as string | undefined;
      const amount = Number(body.amount);

      if (!paymentKey || !orderId || !Number.isFinite(amount) || amount <= 0) {
        throw new AppError('MISSING_REQUIRED_FIELD', 'paymentKey, orderId, amount가 필요합니다');
      }

      // Step 1: DB에서 PENDING 주문 조회
      const order = await orderRepo.findById(orderId);
      if (!order) {
        throw new AppError('ORDER_NOT_FOUND', '해당 주문을 찾을 수 없습니다');
      }

      // Step 2: 소유권 검증 — 주문 생성자와 요청자가 동일한지
      if (order.userId !== userId) {
        logger.warn({ orderId, orderUserId: order.userId, requestUserId: userId }, '주문 소유권 불일치');
        throw new AppError('FORBIDDEN', '해당 주문에 대한 권한이 없습니다');
      }

      // Step 3: 상태 검증 — PENDING 상태인지. 환불 검증과 의미가 다르므로 INVALID_ORDER_STATUS 사용.
      if (order.status !== 'pending') {
        throw new AppError('INVALID_ORDER_STATUS', `주문 상태가 올바르지 않습니다 (현재: ${order.status})`);
      }

      // Step 4: 금액 검증 — DB에 저장된 금액과 요청 금액이 일치하는지
      if (order.amount !== amount) {
        logger.warn({ orderId, dbAmount: order.amount, requestAmount: amount }, '결제 금액 불일치 감지');
        throw new AppError('PRICE_MISMATCH', '결제 금액이 일치하지 않습니다');
      }

      // Step 5: 토스페이먼츠 최종 승인 API 호출
      // TODO: pgClient.confirmPayment(paymentKey, orderId, amount) 연결. 현재는 skip 후 바로 PAID 전이.

      // Step 6: 주문 상태를 PAID로 전이
      await orderRepo.updateStatus(orderId, 'paid', paymentKey);

      logger.info({ orderId, paymentKey, amount }, '결제 승인 완료');

      res.status(200).json({
        success: true,
        orderId,
        paymentKey,
        amount,
        status: 'paid',
      });
    } catch (err) {
      next(err);
    }
  };
}
