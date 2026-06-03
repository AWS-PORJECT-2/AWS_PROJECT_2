import { randomUUID } from 'node:crypto';
import type { PaymentService } from '../interfaces/payment-service.js';
import type { PgClient } from '../interfaces/pg-client.js';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { ParticipationRepository } from '../repositories/participation-repository.js';
import type { OrderRepository } from '../repositories/order-repository.js';
import type { PaymentRepository } from '../repositories/payment-repository.js';
import type { PaymentEventRepository } from '../repositories/payment-event-repository.js';
import type { Participation, Order, Payment } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { logger } from '../logger.js';

// 레거시 단건결제(orders/payments/participations) — 현재 라이브 머니플로우는 reward_orders + 무통장.
// 이 서비스는 스케줄러(executeBatchPayments/markGroupBuyFailed/retryFailedPayment)와
// 웹훅(handleWebhookEvent)에서만 쓰인다. 사용자 직접호출(참여/환불/조회) 경로는 제거됨.

export interface PaymentServiceDeps {
  pgClient: PgClient;
  groupBuyRepository: GroupBuyRepository;
  participationRepository: ParticipationRepository;
  orderRepository: OrderRepository;
  paymentRepository: PaymentRepository;
  paymentEventRepository: PaymentEventRepository;
}

const RETRY_INTERVALS_MS = [1 * 60 * 60 * 1000, 4 * 60 * 60 * 1000, 24 * 60 * 60 * 1000]; // 1h, 4h, 24h
const MAX_RETRY_COUNT = 3;

export class PaymentServiceImpl implements PaymentService {
  private readonly pgClient: PgClient;
  private readonly groupBuyRepo: GroupBuyRepository;
  private readonly participationRepo: ParticipationRepository;
  private readonly orderRepo: OrderRepository;
  private readonly paymentRepo: PaymentRepository;
  private readonly paymentEventRepo: PaymentEventRepository;

  constructor(deps: PaymentServiceDeps) {
    this.pgClient = deps.pgClient;
    this.groupBuyRepo = deps.groupBuyRepository;
    this.participationRepo = deps.participationRepository;
    this.orderRepo = deps.orderRepository;
    this.paymentRepo = deps.paymentRepository;
    this.paymentEventRepo = deps.paymentEventRepository;
  }

  async executeBatchPayments(groupbuyId: string): Promise<void> {
    const groupbuy = await this.groupBuyRepo.findById(groupbuyId);
    if (!groupbuy) throw new AppError('GROUPBUY_NOT_FOUND');

    // Transition to 'executing'
    await this.groupBuyRepo.updateStatus(groupbuyId, 'executing');

    const participations = await this.participationRepo.findConfirmedByGroupBuy(groupbuyId);

    for (const participation of participations) {
      try {
        await this.processParticipationPayment(groupbuy, participation);
      } catch (err) {
        logger.error({ err, participationId: participation.id }, '개별 결제 처리 실패');
      }
    }

    // Transition to 'completed'
    await this.groupBuyRepo.updateStatus(groupbuyId, 'completed');
  }

  async markGroupBuyFailed(groupbuyId: string): Promise<void> {
    await this.groupBuyRepo.updateStatus(groupbuyId, 'failed');
    await this.participationRepo.cancelAllByGroupBuy(groupbuyId);
  }

  async handleWebhookEvent(eventType: string, pgTransactionId: string, payload: Record<string, unknown>): Promise<void> {
    const payment = await this.paymentRepo.findByPgTransactionId(pgTransactionId);
    if (!payment) {
      logger.warn({ pgTransactionId, eventType }, 'Webhook: 결제 정보를 찾을 수 없음');
      return;
    }

    // Record raw webhook payload
    await this.recordEvent(payment.id, `webhook.${eventType}`, payload);

    switch (eventType) {
      case 'Transaction.Paid': {
        if (payment.status === 'paid') return; // idempotent
        await this.paymentRepo.updateStatus(payment.id, 'paid', new Date());
        await this.orderRepo.updateStatus(payment.orderId, 'paid');
        await this.recordEvent(payment.id, 'status.paid', { source: 'webhook' });
        break;
      }
      case 'Transaction.Failed': {
        if (payment.status === 'failed') return; // idempotent
        await this.paymentRepo.updateStatus(payment.id, 'failed');
        await this.orderRepo.updateStatus(payment.orderId, 'failed');

        // 재시도 스케줄링 — DB에 물리적으로 저장
        const order = await this.orderRepo.findById(payment.orderId);
        if (order && order.retryCount < MAX_RETRY_COUNT) {
          const newRetryCount = order.retryCount + 1;
          const nextRetryAt = new Date(Date.now() + RETRY_INTERVALS_MS[order.retryCount]!);
          await this.orderRepo.updateRetryMetadata(payment.orderId, newRetryCount, nextRetryAt);
        }

        await this.recordEvent(payment.id, 'status.failed', { source: 'webhook' });
        break;
      }
      case 'Transaction.Cancelled': {
        if (payment.status === 'cancelled') return; // idempotent
        await this.paymentRepo.updateStatus(payment.id, 'cancelled');
        await this.orderRepo.updateStatus(payment.orderId, 'cancelled');
        await this.recordEvent(payment.id, 'status.cancelled', { source: 'webhook' });
        break;
      }
      default:
        logger.warn({ eventType }, 'Webhook: 알 수 없는 이벤트 타입');
    }
  }

  async retryFailedPayment(orderId: string): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order || order.status !== 'failed') return;

    // 단건결제(one_off) 는 자동 재시도 흐름이 정의돼 있지 않다. 명시적으로 skip + 로그.
    if (order.kind !== 'groupbuy' || !order.groupbuyId || !order.participationId) {
      logger.warn({ orderId, kind: order.kind }, 'retryFailedPayment: groupbuy 가 아닌 order 는 재시도 대상 아님');
      return;
    }

    const participation = await this.participationRepo.findByUserAndGroupBuy(order.userId, order.groupbuyId);
    if (!participation) return;

    const groupbuy = await this.groupBuyRepo.findById(order.groupbuyId);
    if (!groupbuy) return;

    const amount = this.calculateAmount(groupbuy.basePrice, groupbuy.designFee, groupbuy.platformFee, participation.quantity);

    const paymentResult = await this.pgClient.payWithBillingKey(
      participation.billingKey,
      order.id,
      amount,
      groupbuy.title,
    );

    const paymentId = randomUUID();
    const now = new Date();

    const payment: Payment = {
      id: paymentId,
      orderId: order.id,
      billingKey: participation.billingKey,
      amount,
      status: paymentResult.success ? 'paid' : 'failed',
      pgTransactionId: paymentResult.pgTransactionId ?? null,
      pgResponse: paymentResult as unknown as Record<string, unknown>,
      attemptedAt: now,
      completedAt: paymentResult.success ? now : null,
    };
    await this.paymentRepo.create(payment);

    if (paymentResult.success) {
      // 성공: 재시도 메타데이터 정리 (nextRetryAt = null)
      await this.orderRepo.updateRetryMetadata(order.id, order.retryCount + 1, null);
      await this.orderRepo.updateStatus(order.id, 'paid', paymentResult.pgPaymentId);
      await this.recordEvent(paymentId, 'payment.success', { retryCount: order.retryCount + 1 });
    } else {
      const newRetryCount = order.retryCount + 1;
      if (newRetryCount >= MAX_RETRY_COUNT) {
        // 영구 실패: 재시도 횟수 기록, 다음 일정 비움
        await this.orderRepo.updateRetryMetadata(order.id, newRetryCount, null);
        await this.orderRepo.updateStatus(order.id, 'failed');
        await this.recordEvent(paymentId, 'payment.permanently_failed', { retryCount: newRetryCount });
      } else {
        // 재시도 예약: 다음 일정 DB에 저장
        const nextRetryAt = new Date(Date.now() + RETRY_INTERVALS_MS[newRetryCount]!);
        await this.orderRepo.updateRetryMetadata(order.id, newRetryCount, nextRetryAt);
        await this.orderRepo.updateStatus(order.id, 'failed');
        await this.recordEvent(paymentId, 'payment.retry_scheduled', {
          retryCount: newRetryCount,
          nextRetryAt: nextRetryAt.toISOString(),
        });
      }
    }
  }

  // --- Private helpers ---

  private calculateAmount(basePrice: number, designFee: number, platformFee: number, quantity: number): number {
    return (basePrice + designFee + platformFee) * quantity;
  }

  private async processParticipationPayment(
    groupbuy: { id: string; title: string; basePrice: number; designFee: number; platformFee: number; finalPrice: number },
    participation: Participation,
  ): Promise<void> {
    const amount = this.calculateAmount(groupbuy.basePrice, groupbuy.designFee, groupbuy.platformFee, participation.quantity);

    // Verify price integrity
    const expectedUnitPrice = groupbuy.basePrice + groupbuy.designFee + groupbuy.platformFee;
    if (groupbuy.finalPrice !== expectedUnitPrice) {
      logger.error({ groupbuyId: groupbuy.id, finalPrice: groupbuy.finalPrice, expectedUnitPrice }, '가격 불일치 감지');
      throw new AppError('PRICE_MISMATCH');
    }

    const orderId = randomUUID();
    const now = new Date();

    const order: Order = {
      id: orderId,
      kind: 'groupbuy',
      participationId: participation.id,
      userId: participation.userId,
      groupbuyId: groupbuy.id,
      productRef: null,
      amount,
      status: 'pending',
      pgPaymentId: null,
      carrierId: null,
      trackingNumber: null,
      retryCount: 0,
      nextRetryAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.orderRepo.create(order);

    const paymentResult = await this.pgClient.payWithBillingKey(
      participation.billingKey,
      orderId,
      amount,
      groupbuy.title,
    );

    const paymentId = randomUUID();
    const payment: Payment = {
      id: paymentId,
      orderId,
      billingKey: participation.billingKey,
      amount,
      status: paymentResult.success ? 'paid' : 'failed',
      pgTransactionId: paymentResult.pgTransactionId ?? null,
      pgResponse: paymentResult as unknown as Record<string, unknown>,
      attemptedAt: now,
      completedAt: paymentResult.success ? now : null,
    };
    await this.paymentRepo.create(payment);

    if (paymentResult.success) {
      await this.orderRepo.updateStatus(orderId, 'paid', paymentResult.pgPaymentId);
      await this.recordEvent(paymentId, 'payment.success', { orderId });
    } else {
      const nextRetryAt = new Date(Date.now() + RETRY_INTERVALS_MS[0]!);
      await this.orderRepo.updateStatus(orderId, 'failed');
      await this.recordEvent(paymentId, 'payment.failed', {
        orderId,
        error: paymentResult.error,
        nextRetryAt: nextRetryAt.toISOString(),
      });
    }
  }

  private async recordEvent(paymentId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.paymentEventRepo.create({
      id: randomUUID(),
      paymentId,
      eventType,
      payload,
      createdAt: new Date(),
    });
  }
}
