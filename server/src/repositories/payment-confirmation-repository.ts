import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { PaymentConfirmation } from '../types/payment.js';

export interface PaymentConfirmationRepository {
  create(confirmation: Omit<PaymentConfirmation, 'id' | 'confirmedAt'>, conn?: PoolConnection): Promise<PaymentConfirmation>;
  findByOrderId(orderId: number): Promise<PaymentConfirmation | null>;
}

export class MySQLPaymentConfirmationRepository implements PaymentConfirmationRepository {
  constructor(private pool: Pool) {}

  async create(
    confirmation: Omit<PaymentConfirmation, 'id' | 'confirmedAt'>,
    conn?: PoolConnection
  ): Promise<PaymentConfirmation> {
    const exec = conn ?? this.pool;
    const [result] = await exec.query<ResultSetHeader>(
      `INSERT INTO payment_confirmations (order_id, confirmed_by, memo)
       VALUES (?, ?, ?)`,
      [confirmation.orderId, confirmation.confirmedBy, confirmation.memo]
    );

    const [rows] = await exec.query<RowDataPacket[]>(
      'SELECT * FROM payment_confirmations WHERE id = ?',
      [result.insertId]
    );

    return this.mapToPaymentConfirmation(rows[0]);
  }

  async findByOrderId(orderId: number): Promise<PaymentConfirmation | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM payment_confirmations WHERE order_id = ? ORDER BY confirmed_at DESC LIMIT 1',
      [orderId]
    );

    if (rows.length === 0) return null;
    return this.mapToPaymentConfirmation(rows[0]);
  }

  private mapToPaymentConfirmation(row: RowDataPacket): PaymentConfirmation {
    return {
      id: row.id,
      orderId: row.order_id,
      confirmedBy: row.confirmed_by,
      confirmedAt: new Date(row.confirmed_at),
      memo: row.memo,
    };
  }
}
