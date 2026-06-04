export interface PaymentResult {
  success: boolean;
  pgPaymentId?: string;
  pgTransactionId?: string;
  paidAt?: string;
  error?: { code: string; message: string };
}

export interface PgClient {
  payWithBillingKey(billingKey: string, orderId: string, amount: number, orderName: string): Promise<PaymentResult>;
  verifyWebhookSignature(payload: string, signature: string, secret: string, transmissionTime?: string): boolean;
}
