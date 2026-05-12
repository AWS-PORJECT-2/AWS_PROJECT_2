import type { Order, OrderStatus } from '../types/index.js';

export interface OrderRepository {
  create(order: Order): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  findByUserId(userId: string): Promise<Order[]>;
  findByPgPaymentId(pgPaymentId: string): Promise<Order | null>;
  updateStatus(id: string, status: OrderStatus, pgPaymentId?: string): Promise<void>;
  updateRetryMetadata(id: string, retryCount: number, nextRetryAt: Date | null): Promise<void>;
  findFailedForRetry(maxAttempts: number): Promise<Order[]>;
}
