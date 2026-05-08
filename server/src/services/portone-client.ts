import crypto from 'node:crypto';
import type { PgClient, CardAuthInfo, BillingKeyResult, PaymentResult, CancelResult, BillingKeyInfo } from '../interfaces/pg-client.js';
import { fetchWithTimeout } from '../utils/fetch-with-timeout.js';

const PORTONE_API_BASE = 'https://api.portone.io';

export class PortOneClient implements PgClient {
  constructor(
    private readonly apiSecret: string,
    private readonly storeId: string,
    private readonly timeoutMs: number = 10000,
  ) {}

  async issueBillingKey(customerId: string, cardInfo: CardAuthInfo): Promise<BillingKeyResult> {
    const res = await this.request('POST', '/billing-keys', {
      storeId: this.storeId,
      method: {
        card: {
          credential: {
            number: cardInfo.number,
            expiryYear: cardInfo.expiryYear,
            expiryMonth: cardInfo.expiryMonth,
            birthOrBusinessRegistrationNumber: cardInfo.birthOrBusinessNo,
            passwordTwoDigits: cardInfo.passwordTwoDigits,
          },
        },
      },
      customerId,
    });

    if (res.billingKeyInfo) {
      return {
        success: true,
        billingKey: res.billingKeyInfo.billingKey,
        cardInfo: {
          cardName: res.billingKeyInfo.card?.name ?? '',
          cardNumber: res.billingKeyInfo.card?.number ?? '',
          cardType: res.billingKeyInfo.card?.type ?? '',
        },
      };
    }

    return { success: false, error: { code: res.code ?? 'UNKNOWN', message: res.message ?? '' } };
  }

  async payWithBillingKey(billingKey: string, orderId: string, amount: number, orderName: string): Promise<PaymentResult> {
    const paymentId = orderId;
    const res = await this.request('POST', `/payments/${paymentId}/billing-key`, {
      storeId: this.storeId,
      billingKey,
      orderName,
      amount: { total: amount },
      currency: 'KRW',
    });

    if (res.payment?.status === 'PAID') {
      return {
        success: true,
        pgPaymentId: res.payment.id,
        pgTransactionId: res.payment.pgTxId,
        paidAt: res.payment.paidAt,
      };
    }

    return { success: false, error: { code: res.code ?? 'PAYMENT_FAILED', message: res.message ?? '' } };
  }

  async cancelPayment(pgPaymentId: string, reason: string, amount?: number): Promise<CancelResult> {
    const body: Record<string, unknown> = { reason };
    if (amount !== undefined) body.amount = amount;

    const res = await this.request('POST', `/payments/${pgPaymentId}/cancel`, body);

    if (res.cancellation) {
      return {
        success: true,
        pgRefundId: res.cancellation.id,
        cancelledAmount: res.cancellation.totalAmount,
      };
    }

    return { success: false, error: { code: res.code ?? 'CANCEL_FAILED', message: res.message ?? '' } };
  }

  async getBillingKeyInfo(billingKey: string): Promise<BillingKeyInfo> {
    const res = await this.request('GET', `/billing-keys/${billingKey}`);
    return {
      billingKey,
      cardName: res.card?.name ?? '',
      cardNumber: res.card?.number ?? '',
      cardType: res.card?.type ?? '',
    };
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      // If buffers have different lengths, timingSafeEqual throws
      return false;
    }
  }

  private async request(method: string, path: string, body?: unknown): Promise<Record<string, any>> {
    const url = `${PORTONE_API_BASE}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `PortOne ${this.apiSecret}`,
        'Content-Type': 'application/json',
      },
    };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }
    const res = await fetchWithTimeout(url, options, this.timeoutMs);
    return res.json() as Promise<Record<string, any>>;
  }
}
