import type { Payment, PaymentStatus } from '../types/index.js';

export interface PaymentRepository {
  create(payment: Payment): Promise<Payment>;
  findByPgTransactionId(pgTransactionId: string): Promise<Payment | null>;
  updateStatus(id: string, status: PaymentStatus, completedAt?: Date): Promise<void>;
}

