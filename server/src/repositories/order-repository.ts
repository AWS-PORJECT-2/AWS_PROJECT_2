import type { Order, OrderStatus } from '../types/index.js';

export interface OrderRepository {
  create(order: Order): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  findByUserId(userId: string): Promise<Order[]>;
  findByPgPaymentId(pgPaymentId: string): Promise<Order | null>;
  updateStatus(id: string, status: OrderStatus, pgPaymentId?: string): Promise<void>;
  findFailedForRetry(maxAttempts: number): Promise<Order[]>;
}

export class InMemoryOrderRepository implements OrderRepository {
  private readonly store = new Map<string, Order>();

  async create(order: Order): Promise<Order> {
    this.store.set(order.id, { ...order });
    return { ...order };
  }

  async findById(id: string): Promise<Order | null> {
    const item = this.store.get(id);
    return item ? { ...item } : null;
  }

  async findByUserId(userId: string): Promise<Order[]> {
    const results: Order[] = [];
    for (const o of this.store.values()) {
      if (o.userId === userId) {
        results.push({ ...o });
      }
    }
    return results;
  }

  async findByPgPaymentId(pgPaymentId: string): Promise<Order | null> {
    for (const o of this.store.values()) {
      if (o.pgPaymentId === pgPaymentId) {
        return { ...o };
      }
    }
    return null;
  }

  async updateStatus(id: string, status: OrderStatus, pgPaymentId?: string): Promise<void> {
    const item = this.store.get(id);
    if (item) {
      item.status = status;
      if (pgPaymentId !== undefined) {
        item.pgPaymentId = pgPaymentId;
      }
      item.updatedAt = new Date();
    }
  }

  async findFailedForRetry(maxAttempts: number): Promise<Order[]> {
    const now = new Date();
    const results: Order[] = [];
    for (const o of this.store.values()) {
      if (
        o.status === 'failed' &&
        o.retryCount < maxAttempts &&
        o.nextRetryAt !== null &&
        o.nextRetryAt <= now
      ) {
        results.push({ ...o });
      }
    }
    return results;
  }
}
