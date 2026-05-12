import type { PaymentEvent } from '../types/index.js';

export interface PaymentEventRepository {
  create(event: PaymentEvent): Promise<PaymentEvent>;
  findByPaymentId(paymentId: string): Promise<PaymentEvent[]>;
}

