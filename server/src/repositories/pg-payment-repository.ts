import type pg from 'pg';
import type { Payment, PaymentStatus } from '../types/index.js';
import type { PaymentRepository } from './payment-repository.js';

export class PgPaymentRepository implements PaymentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(payment: Payment): Promise<Payment> {
    const result = await this.pool.query(
      `INSERT INTO payments (id, order_id, billing_key, amount, status, pg_transaction_id, pg_response, attempted_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        payment.id, payment.orderId, payment.billingKey, payment.amount,
        payment.status, payment.pgTransactionId, payment.pgResponse ? JSON.stringify(payment.pgResponse) : null,
        payment.attemptedAt, payment.completedAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findByOrderId(orderId: string): Promise<Payment[]> {
    const result = await this.pool.query(
      'SELECT * FROM payments WHERE order_id = $1 ORDER BY attempted_at DESC',
      [orderId],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async findByPgTransactionId(pgTransactionId: string): Promise<Payment | null> {
    const result = await this.pool.query(
      'SELECT * FROM payments WHERE pg_transaction_id = $1',
      [pgTransactionId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async updateStatus(id: string, status: PaymentStatus, completedAt?: Date): Promise<void> {
    if (completedAt !== undefined) {
      await this.pool.query(
        'UPDATE payments SET status = $1, completed_at = $2 WHERE id = $3',
        [status, completedAt, id],
      );
    } else {
      await this.pool.query(
        'UPDATE payments SET status = $1 WHERE id = $2',
        [status, id],
      );
    }
  }

  private mapRow(row: Record<string, unknown>): Payment {
    return {
      id: row.id as string,
      orderId: row.order_id as string,
      billingKey: row.billing_key as string,
      amount: row.amount as number,
      status: row.status as PaymentStatus,
      pgTransactionId: (row.pg_transaction_id as string) ?? null,
      pgResponse: (typeof row.pg_response === 'string'
        ? JSON.parse(row.pg_response)
        : row.pg_response) as Record<string, unknown> | null,
      attemptedAt: new Date(row.attempted_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    };
  }
}
