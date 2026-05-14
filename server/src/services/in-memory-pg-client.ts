import { randomUUID } from 'node:crypto';
import type { PgClient, CardAuthInfo, BillingKeyResult, PaymentResult, CancelResult, BillingKeyInfo } from '../interfaces/pg-client.js';

export class InMemoryPgClient implements PgClient {
  private billingKeys = new Map<string, { customerId: string; cardInfo: CardAuthInfo }>();
  private payments = new Map<string, { amount: number; status: string }>();

  async issueBillingKey(customerId: string, cardInfo: CardAuthInfo): Promise<BillingKeyResult> {
    const billingKey = `bk_${randomUUID()}`;
    this.billingKeys.set(billingKey, { customerId, cardInfo });
    return {
      success: true,
      billingKey,
      cardInfo: {
        cardName: 'Test Card',
        cardNumber: `${cardInfo.number.slice(0, 4)}-****-****-${cardInfo.number.slice(-4)}`,
        cardType: '신용',
      },
    };
  }

  async payWithBillingKey(billingKey: string, orderId: string, amount: number, _orderName: string): Promise<PaymentResult> {
    // 결제 금액 검증 (서버 측 방어): 0원·음수·NaN·Infinity 차단
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        success: false,
        error: { code: 'INVALID_AMOUNT', message: '결제 금액이 유효하지 않습니다 (0보다 큰 유한 숫자여야 합니다)' },
      };
    }

    if (!this.billingKeys.has(billingKey)) {
      return { success: false, error: { code: 'INVALID_BILLING_KEY', message: 'Billing key not found' } };
    }
    const pgPaymentId = `pay_${randomUUID()}`;
    const pgTransactionId = `tx_${randomUUID()}`;
    this.payments.set(pgPaymentId, { amount, status: 'PAID' });
    return { success: true, pgPaymentId, pgTransactionId, paidAt: new Date().toISOString() };
  }

  async cancelPayment(pgPaymentId: string, _reason: string, amount?: number): Promise<CancelResult> {
    const payment = this.payments.get(pgPaymentId);
    if (!payment) return { success: false, error: { code: 'NOT_FOUND', message: 'Payment not found' } };
    const cancelAmount = amount ?? payment.amount;
    return { success: true, pgRefundId: `ref_${randomUUID()}`, cancelledAmount: cancelAmount };
  }

  async getBillingKeyInfo(billingKey: string): Promise<BillingKeyInfo> {
    return { billingKey, cardName: 'Test Card', cardNumber: '1234-****-****-5678', cardType: '신용' };
  }

  verifyWebhookSignature(_payload: string, _signature: string, _secret: string, _transmissionTime?: string): boolean {
    return true;
  }
}
