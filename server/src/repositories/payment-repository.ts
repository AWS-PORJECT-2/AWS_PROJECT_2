import type { Payment, PaymentStatus } from '../types/index.js';

export interface PaymentRepository {
  create(payment: Payment): Promise<Payment>;
  findByOrderId(orderId: string): Promise<Payment[]>;
  findByPgTransactionId(pgTransactionId: string): Promise<Payment | null>;
  updateStatus(id: string, status: PaymentStatus, completedAt?: Date): Promise<void>;
}

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly store = new Map<string, Payment>();

  async create(payment: Payment): Promise<Payment> {
    this.store.set(payment.id, { ...payment });
    return { ...payment };
  }

  async findByOrderId(orderId: string): Promise<Payment[]> {
    const results: Payment[] = [];
    for (const p of this.store.values()) {
      if (p.orderId === orderId) {
        results.push({ ...p });
      }
    }
    return results;
  }

  async findByPgTransactionId(pgTransactionId: string): Promise<Payment | null> {
    for (const p of this.store.values()) {
      if (p.pgTransactionId === pgTransactionId) {
        return { ...p };
      }
    }
    return null;
  }

  async updateStatus(id: string, status: PaymentStatus, completedAt?: Date): Promise<void> {
    const item = this.store.get(id);
    if (item) {
      item.status = status;
      if (completedAt !== undefined) {
        item.completedAt = completedAt;
      }
    }
  }
}
