import type { PaymentEvent } from '../types/index.js';

export interface PaymentEventRepository {
  create(event: PaymentEvent): Promise<PaymentEvent>;
  findByPaymentId(paymentId: string): Promise<PaymentEvent[]>;
}

export class InMemoryPaymentEventRepository implements PaymentEventRepository {
  private readonly store = new Map<string, PaymentEvent>();

  async create(event: PaymentEvent): Promise<PaymentEvent> {
    this.store.set(event.id, { ...event });
    return { ...event };
  }

  async findByPaymentId(paymentId: string): Promise<PaymentEvent[]> {
    const results: PaymentEvent[] = [];
    for (const e of this.store.values()) {
      if (e.paymentId === paymentId) {
        results.push({ ...e });
      }
    }
    return results;
  }
}
