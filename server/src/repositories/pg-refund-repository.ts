import type pg from 'pg';
import type { Refund, RefundStatus } from '../types/index.js';
import type { RefundRepository } from './refund-repository.js';

export class PgRefundRepository implements RefundRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(refund: Refund): Promise<Refund> {
    const result = await this.pool.query(
      `INSERT INTO refunds (id, payment_id, order_id, amount, reason, status, pg_refund_id, created_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        refund.id, refund.paymentId, refund.orderId, refund.amount,
        refund.reason, refund.status, refund.pgRefundId, refund.createdAt, refund.completedAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findByOrderId(orderId: string): Promise<Refund[]> {
    const result = await this.pool.query(
      'SELECT * FROM refunds WHERE order_id = $1 ORDER BY created_at DESC',
      [orderId],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async updateStatus(id: string, status: RefundStatus, pgRefundId?: string, completedAt?: Date): Promise<void> {
    const setClauses: string[] = ['status = $1'];
    const params: unknown[] = [status];
    let paramIdx = 2;

    if (pgRefundId !== undefined) {
      setClauses.push(`pg_refund_id = $${paramIdx}`);
      params.push(pgRefundId);
      paramIdx++;
    }
    if (completedAt !== undefined) {
      setClauses.push(`completed_at = $${paramIdx}`);
      params.push(completedAt);
      paramIdx++;
    }

    params.push(id);
    await this.pool.query(
      `UPDATE refunds SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      params,
    );
  }

  private mapRow(row: Record<string, unknown>): Refund {
    return {
      id: row.id as string,
      paymentId: row.payment_id as string,
      orderId: row.order_id as string,
      amount: row.amount as number,
      reason: row.reason as string,
      status: row.status as RefundStatus,
      pgRefundId: (row.pg_refund_id as string) ?? null,
      createdAt: new Date(row.created_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    };
  }
}
