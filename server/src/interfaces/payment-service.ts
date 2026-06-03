// 레거시 단건결제 서비스 — 스케줄러/웹훅 전용(사용자 직접호출 경로는 제거됨).
export interface PaymentService {
  // 일괄 결제 실행(마감 성공 시 스케줄러)
  executeBatchPayments(groupbuyId: string): Promise<void>;
  markGroupBuyFailed(groupbuyId: string): Promise<void>;

  // Webhook 처리
  handleWebhookEvent(eventType: string, pgTransactionId: string, payload: Record<string, unknown>): Promise<void>;

  // 실패 결제 재시도(스케줄러)
  retryFailedPayment(orderId: string): Promise<void>;
}
