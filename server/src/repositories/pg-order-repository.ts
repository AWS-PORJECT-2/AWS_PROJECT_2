import type pg from 'pg';
import type { Order, OrderStatus } from '../types/index.js';
import type { OrderRepository } from './order-repository.js';

export class PgOrderRepository implements OrderRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(order: Order): Promise<Order> {
    const result = await this.pool.query(
      `INSERT INTO orders (id, participation_id, user_id, groupbuy_id, amount, status, pg_payment_id, retry_count, next_retry_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        order.id, order.participationId, order.userId, order.groupbuyId,
        order.amount, order.status, order.pgPaymentId, order.retryCount,
        order.nextRetryAt, order.createdAt, order.updatedAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<Order | null> {
    const result = await this.pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findByUserId(userId: string): Promise<Order[]> {
    const result = await this.pool.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async findByPgPaymentId(pgPaymentId: string): Promise<Order | null> {
    const result = await this.pool.query(
      'SELECT * FROM orders WHERE pg_payment_id = $1',
      [pgPaymentId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async updateStatus(id: string, status: OrderStatus, pgPaymentId?: string): Promise<void> {
    if (pgPaymentId !== undefined) {
      await this.pool.query(
        'UPDATE orders SET status = $1, pg_payment_id = $2, updated_at = NOW() WHERE id = $3',
        [status, pgPaymentId, id],
      );
    } else {
      await this.pool.query(
        'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
        [status, id],
      );
    }
  }

  async findFailedForRetry(maxAttempts: number): Promise<Order[]> {
    const result = await this.pool.query(
      `SELECT * FROM orders WHERE status = 'failed' AND retry_count < $1 AND next_retry_at IS NOT NULL AND next_retry_at <= NOW()`,
      [maxAttempts],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async updateRetryMetadata(id: string, retryCount: number, nextRetryAt: Date | null): Promise<void> {
    await this.pool.query(
      'UPDATE orders SET retry_count = $1, next_retry_at = $2, updated_at = NOW() WHERE id = $3',
      [retryCount, nextRetryAt, id],
    );
  }

  private mapRow(row: Record<string, unknown>): Order {
    return {
      id: row.id as string,
      participationId: row.participation_id as string,
      userId: row.user_id as string,
      groupbuyId: row.groupbuy_id as string,
      amount: row.amount as number,
      status: row.status as OrderStatus,
      pgPaymentId: (row.pg_payment_id as string) ?? null,
      retryCount: row.retry_count as number,
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at as string) : null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
