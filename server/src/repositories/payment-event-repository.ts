import type { PaymentEvent } from '../types/index.js';

export interface PaymentEventRepository {
  create(event: PaymentEvent): Promise<PaymentEvent>;
}

