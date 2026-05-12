import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { PaymentService } from '../interfaces/payment-service.js';
import type { PgClient } from '../interfaces/pg-client.js';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { ParticipationRepository } from '../repositories/participation-repository.js';
import type { OrderRepository } from '../repositories/order-repository.js';
import type { PaymentRepository } from '../repositories/payment-repository.js';
import type { PaymentEventRepository } from '../repositories/payment-event-repository.js';
import type { RefundRepository } from '../repositories/refund-repository.js';
import type {
  Participation, Order, Payment, PaymentEvent,
  ParticipateRequest, ParticipateResult, RefundRequest, RefundResult,
} from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { logger } from '../logger.js';

export interface PaymentServiceDeps {
  pgClient: PgClient;
  pool: Pool | null;
  groupBuyRepository: GroupBuyRepository;
  participationRepository: ParticipationRepository;
  orderRepository: OrderRepository;
  paymentRepository: PaymentRepository;
  paymentEventRepository: PaymentEventRepository;
  refundRepository: RefundRepository;
}

const MAX_DEADLOCK_RETRIES = 3;
const RETRY_INTERVALS_MS = [1 * 60 * 60 * 1000, 4 * 60 * 60 * 1000, 24 * 60 * 60 * 1000]; // 1h, 4h, 24h
const MAX_RETRY_COUNT = 3;

export class PaymentServiceImpl implements PaymentService {
  private readonly pgClient: PgClient;
  private readonly pool: Pool | null;
  private readonly groupBuyRepo: GroupBuyRepository;
  private readonly participationRepo: ParticipationRepository;
  private readonly orderRepo: OrderRepository;
  private readonly paymentRepo: PaymentRepository;
  private readonly paymentEventRepo: PaymentEventRepository;
  private readonly refundRepo: RefundRepository;

  constructor(deps: PaymentServiceDeps) {
    this.pgClient = deps.pgClient;
    this.pool = deps.pool;
    this.groupBuyRepo = deps.groupBuyRepository;
    this.participationRepo = deps.participationRepository;
    this.orderRepo = deps.orderRepository;
    this.paymentRepo = deps.paymentRepository;
    this.paymentEventRepo = deps.paymentEventRepository;
    this.refundRepo = deps.refundRepository;
  }

  async participate(userId: string, groupbuyId: string, request: ParticipateRequest): Promise<ParticipateResult> {
    const groupbuy = await this.groupBuyRepo.findById(groupbuyId);
    if (!groupbuy) throw new AppError('GROUPBUY_NOT_FOUND');
    if (groupbuy.status !== 'open') throw new AppError('GROUPBUY_NOT_AVAILABLE');
    if (groupbuy.deadline <= new Date()) throw new AppError('GROUPBUY_EXPIRED');

    // Validate selected options
    this.validateOptions(groupbuy.productOptions, request.selectedOptions);

    // Check duplicate participation
    const existing = await this.participationRepo.findByUserAndGroupBuy(userId, groupbuyId);
    if (existing && existing.status !== 'cancelled') throw new AppError('ALREADY_PARTICIPATING');

    // Issue billing key
    const billingKeyResult = await this.pgClient.issueBillingKey(userId, request.cardInfo);
    if (!billingKeyResult.success || !billingKeyResult.billingKey) {
      throw new AppError('BILLING_KEY_FAILED');
    }

    const participationId = randomUUID();
    const participation: Participation = {
      id: participationId,
      groupbuyId,
      userId,
      billingKey: billingKeyResult.billingKey,
      selectedOptions: request.selectedOptions,
      quantity: request.quantity,
      status: 'confirmed',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Create participation + increment quantity in transaction with deadlock retry
    await this.withRetry(async () => {
      await this.withTransaction(async (client) => {
        await this.participationRepo.create(participation, client);
        await this.groupBuyRepo.incrementQuantity(groupbuyId, request.quantity, client);
      });
    });

    return {
      participationId,
      billingKeyInfo: billingKeyResult.cardInfo!,
      status: 'confirmed',
    };
  }

  async cancelParticipation(userId: string, groupbuyId: string): Promise<void> {
    const participation = await this.participationRepo.findByUserAndGroupBuy(userId, groupbuyId);
    if (!participation || participation.status === 'cancelled') {
      throw new AppError('PARTICIPATION_NOT_FOUND');
    }

    const groupbuy = await this.groupBuyRepo.findById(groupbuyId);
    if (!groupbuy) throw new AppError('GROUPBUY_NOT_FOUND');
    if (groupbuy.status !== 'open') throw new AppError('GROUPBUY_NOT_AVAILABLE');

    await this.withRetry(async () => {
      await this.withTransaction(async (client) => {
        await this.participationRepo.updateStatus(participation.id, 'cancelled', client);
        await this.groupBuyRepo.decrementQuantity(groupbuyId, participation.quantity, client);
      });
    });
  }

  async getParticipation(userId: string, groupbuyId: string): Promise<Participation | null> {
    return this.participationRepo.findByUserAndGroupBuy(userId, groupbuyId);
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

  async requestRefund(userId: string, orderId: string, request: RefundRequest): Promise<RefundResult> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new AppError('ORDER_NOT_FOUND');
    if (order.userId !== userId) throw new AppError('ORDER_NOT_FOUND');
    if (order.status !== 'paid') throw new AppError('ORDER_NOT_REFUNDABLE');

    const refundAmount = request.amount ?? order.amount;
    if (refundAmount <= 0 || refundAmount > order.amount) {
      throw new AppError('INVALID_REFUND_AMOUNT');
    }

    // Find the payment for this order
    const payments = await this.paymentRepo.findByOrderId(orderId);
    const paidPayment = payments.find(p => p.status === 'paid');
    if (!paidPayment || !paidPayment.pgTransactionId) {
      throw new AppError('ORDER_NOT_REFUNDABLE');
    }

    const cancelResult = await this.pgClient.cancelPayment(
      paidPayment.pgTransactionId,
      request.reason,
      refundAmount,
    );

    const refundId = randomUUID();
    const now = new Date();

    if (cancelResult.success) {
      await this.refundRepo.create({
        id: refundId,
        paymentId: paidPayment.id,
        orderId,
        amount: refundAmount,
        reason: request.reason,
        status: 'completed',
        pgRefundId: cancelResult.pgRefundId ?? null,
        createdAt: now,
        completedAt: now,
      });
      await this.orderRepo.updateStatus(orderId, 'refunded');
      await this.recordEvent(paidPayment.id, 'refund.completed', {
        refundId,
        amount: refundAmount,
        reason: request.reason,
      });
      return { refundId, status: 'completed', amount: refundAmount };
    } else {
      await this.refundRepo.create({
        id: refundId,
        paymentId: paidPayment.id,
        orderId,
        amount: refundAmount,
        reason: request.reason,
        status: 'failed',
        pgRefundId: null,
        createdAt: now,
        completedAt: null,
      });
      await this.recordEvent(paidPayment.id, 'refund.failed', {
        refundId,
        error: cancelResult.error,
      });
      throw new AppError('PAYMENT_FAILED', cancelResult.error?.message ?? '환불 처리에 실패했습니다');
    }
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

  async getUserOrders(userId: string): Promise<Order[]> {
    return this.orderRepo.findByUserId(userId);
  }

  async getPaymentEvents(paymentId: string): Promise<PaymentEvent[]> {
    return this.paymentEventRepo.findByPaymentId(paymentId);
  }

  // --- Private helpers ---

  private validateOptions(productOptions: Array<{ size: string; color: string; stock?: number }>, selectedOptions: Record<string, string>): void {
    if (!selectedOptions.size || !selectedOptions.color) {
      throw new AppError('INVALID_OPTIONS');
    }
    const match = productOptions.some(
      opt => opt.size === selectedOptions.size && opt.color === selectedOptions.color,
    );
    if (!match) {
      throw new AppError('INVALID_OPTIONS');
    }
  }

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
      participationId: participation.id,
      userId: participation.userId,
      groupbuyId: groupbuy.id,
      amount,
      status: 'pending',
      pgPaymentId: null,
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

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_DEADLOCK_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;
        const isDeadlock = err instanceof Error && (
          err.message.includes('deadlock') || err.message.includes('40P01')
        );
        if (!isDeadlock || attempt === MAX_DEADLOCK_RETRIES) throw err;
        const delay = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  private async withTransaction<T>(fn: (client: PoolClient | null) => Promise<T>): Promise<T> {
    if (!this.pool) {
      // InMemory mode - just execute without real transaction, client = null
      return fn(null);
    }
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
