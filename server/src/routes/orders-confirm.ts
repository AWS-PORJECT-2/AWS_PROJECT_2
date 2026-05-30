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

      // Step 5: 토스페이먼츠 최종 승인 — PG(confirmPayment)가 구현/연동되지 않았다.
      // ⚠️ 보안(A04 결제 우회): PG 승인 검증 없이 주문을 PAID 로 전이하면, 임의 paymentKey 와
      //   서버 계산 amount 만 echo 해서 실제 결제 없이 결제완료가 된다(인증 사용자가 자기 pending 주문으로).
      //   따라서 fail-closed: 주문을 PAID 로 바꾸지 않고 차단한다. 실제 후원은 무통장입금
      //   (/api/funds/:id/back + 관리자 입금확인) 경로를 사용한다.
      //   토스 단건결제를 도입하려면 pgClient 에 confirmPayment 를 구현해, 토스 /v2/payments/confirm
      //   응답 status==='DONE' 이고 totalAmount===order.amount 일 때만 updateStatus(...,'paid',...) 할 것.
      void pgClient; // (PG 연동 시 사용) — 현재는 미사용
      logger.warn({ orderId, userId }, '미연동 PG 단건결제 confirm 차단(fail-closed)');
      res.status(501).json({ error: 'PAYMENT_NOT_CONFIGURED', message: '카드 결제는 현재 지원하지 않습니다. 무통장입금으로 후원해 주세요.' });
    } catch (err) {
      next(err);
    }
  };
}
