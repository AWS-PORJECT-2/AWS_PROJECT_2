import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { PaymentProof } from '../types/payment.js';

export interface PaymentProofRepository {
  create(proof: Omit<PaymentProof, 'id' | 'uploadedAt'>, conn?: PoolConnection): Promise<PaymentProof>;
  findByOrderId(orderId: number): Promise<PaymentProof | null>;
  updateConfirmStatus(id: number, isConfirmed: boolean, conn?: PoolConnection): Promise<void>;
}

export class MySQLPaymentProofRepository implements PaymentProofRepository {
  constructor(private pool: Pool) {}

  async create(proof: Omit<PaymentProof, 'id' | 'uploadedAt'>, conn?: PoolConnection): Promise<PaymentProof> {
    const exec = conn ?? this.pool;
    const [result] = await exec.query<ResultSetHeader>(
      `INSERT INTO payment_proofs (order_id, depositor_name, is_confirmed)
       VALUES (?, ?, ?)`,
      [proof.orderId, proof.depositorName, proof.isConfirmed]
    );

    const [rows] = await exec.query<RowDataPacket[]>(
      'SELECT * FROM payment_proofs WHERE id = ?',
      [result.insertId]
    );

    return this.mapToPaymentProof(rows[0]);
  }

  async findByOrderId(orderId: number): Promise<PaymentProof | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM payment_proofs WHERE order_id = ? ORDER BY uploaded_at DESC LIMIT 1',
      [orderId]
    );

    if (rows.length === 0) return null;
    return this.mapToPaymentProof(rows[0]);
  }

  async updateConfirmStatus(id: number, isConfirmed: boolean, conn?: PoolConnection): Promise<void> {
    const exec = conn ?? this.pool;
    await exec.query(
      'UPDATE payment_proofs SET is_confirmed = ? WHERE id = ?',
      [isConfirmed, id]
    );
  }

  private mapToPaymentProof(row: RowDataPacket): PaymentProof {
    return {
      id: row.id,
      orderId: row.order_id,
      depositorName: row.depositor_name,
      isConfirmed: Boolean(row.is_confirmed),
      uploadedAt: new Date(row.uploaded_at),
    };
  }
}
