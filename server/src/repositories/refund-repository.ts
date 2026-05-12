import type { Refund, RefundStatus } from '../types/index.js';

export interface RefundRepository {
  create(refund: Refund): Promise<Refund>;
  findByOrderId(orderId: string): Promise<Refund[]>;
  updateStatus(id: string, status: RefundStatus, pgRefundId?: string, completedAt?: Date): Promise<void>;
}

export class InMemoryRefundRepository implements RefundRepository {
  private readonly store = new Map<string, Refund>();

  async create(refund: Refund): Promise<Refund> {
    this.store.set(refund.id, { ...refund });
    return { ...refund };
  }

  async findByOrderId(orderId: string): Promise<Refund[]> {
    const results: Refund[] = [];
    for (const r of this.store.values()) {
      if (r.orderId === orderId) {
        results.push({ ...r });
      }
    }
    return results;
  }

  async updateStatus(id: string, status: RefundStatus, pgRefundId?: string, completedAt?: Date): Promise<void> {
    const item = this.store.get(id);
    if (item) {
      item.status = status;
      if (pgRefundId !== undefined) {
        item.pgRefundId = pgRefundId;
      }
      if (completedAt !== undefined) {
        item.completedAt = completedAt;
      }
    }
  }
}
