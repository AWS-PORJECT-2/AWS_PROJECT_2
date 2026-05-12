export interface CardAuthInfo {
  number: string;
  expiryYear: string;
  expiryMonth: string;
  birthOrBusinessNo: string;
  passwordTwoDigits?: string;
}

export interface BillingKeyResult {
  success: boolean;
  billingKey?: string;
  cardInfo?: {
    cardName: string;
    cardNumber: string;
    cardType: string;
  };
  error?: { code: string; message: string };
}

export interface PaymentResult {
  success: boolean;
  pgPaymentId?: string;
  pgTransactionId?: string;
  paidAt?: string;
  error?: { code: string; message: string };
}

export interface CancelResult {
  success: boolean;
  pgRefundId?: string;
  cancelledAmount?: number;
  error?: { code: string; message: string };
}

export interface BillingKeyInfo {
  billingKey: string;
  cardName: string;
  cardNumber: string;
  cardType: string;
}

export interface PgClient {
  issueBillingKey(customerId: string, cardInfo: CardAuthInfo): Promise<BillingKeyResult>;
  payWithBillingKey(billingKey: string, orderId: string, amount: number, orderName: string): Promise<PaymentResult>;
  cancelPayment(pgPaymentId: string, reason: string, amount?: number): Promise<CancelResult>;
  getBillingKeyInfo(billingKey: string): Promise<BillingKeyInfo>;
  verifyWebhookSignature(payload: string, signature: string, secret: string, transmissionTime?: string): boolean;
}
