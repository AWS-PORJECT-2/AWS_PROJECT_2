import type { Refund, RefundStatus } from '../types/index.js';

export interface RefundRepository {
  create(refund: Refund): Promise<Refund>;
  findByOrderId(orderId: string): Promise<Refund[]>;
  updateStatus(id: string, status: RefundStatus, pgRefundId?: string, completedAt?: Date): Promise<void>;
}

