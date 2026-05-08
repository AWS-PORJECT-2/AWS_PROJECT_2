import type {
  Participation, Order, PaymentEvent,
  ParticipateRequest, ParticipateResult, RefundRequest, RefundResult,
} from '../types/index.js';

export interface PaymentService {
  // 공동구매 참여
  participate(userId: string, groupbuyId: string, request: ParticipateRequest): Promise<ParticipateResult>;
  cancelParticipation(userId: string, groupbuyId: string): Promise<void>;
  getParticipation(userId: string, groupbuyId: string): Promise<Participation | null>;

  // 일괄 결제 실행
  executeBatchPayments(groupbuyId: string): Promise<void>;
  markGroupBuyFailed(groupbuyId: string): Promise<void>;

  // 환불
  requestRefund(userId: string, orderId: string, request: RefundRequest): Promise<RefundResult>;

  // Webhook 처리
  handleWebhookEvent(eventType: string, pgTransactionId: string, payload: Record<string, unknown>): Promise<void>;

  // 재시도
  retryFailedPayment(orderId: string): Promise<void>;

  // 조회
  getUserOrders(userId: string): Promise<Order[]>;
  getPaymentEvents(paymentId: string): Promise<PaymentEvent[]>;
}
