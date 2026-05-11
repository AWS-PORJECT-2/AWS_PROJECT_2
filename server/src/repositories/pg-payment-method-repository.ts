import type pg from 'pg';
import type { PaymentMethod } from '../types/index.js';
import type { PaymentMethodRepository } from './payment-method-repository.js';

export class PgPaymentMethodRepository implements PaymentMethodRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(pm: PaymentMethod): Promise<PaymentMethod> {
    const result = await this.pool.query(
      `INSERT INTO payment_methods (id, user_id, pg_provider, channel_type, billing_key_ref, card_name, card_last_four, is_default, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        pm.id, pm.userId, pm.pgProvider, pm.channelType, pm.billingKeyRef,
        pm.cardName, pm.cardLastFour, pm.isDefault, pm.status,
        pm.createdAt, pm.updatedAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<PaymentMethod | null> {
    const result = await this.pool.query('SELECT * FROM payment_methods WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async list(userId: string): Promise<PaymentMethod[]> {
    const result = await this.pool.query(
      `SELECT * FROM payment_methods WHERE user_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async findDefault(userId: string): Promise<PaymentMethod | null> {
    const result = await this.pool.query(
      `SELECT * FROM payment_methods WHERE user_id = $1 AND is_default = TRUE AND status = 'ACTIVE'`,
      [userId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async update(id: string, patch: Partial<PaymentMethod>): Promise<PaymentMethod> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (patch.isDefault !== undefined) { fields.push(`is_default = $${idx++}`); values.push(patch.isDefault); }
    if (patch.status !== undefined) { fields.push(`status = $${idx++}`); values.push(patch.status); }
    if (patch.cardName !== undefined) { fields.push(`card_name = $${idx++}`); values.push(patch.cardName); }
    if (patch.cardLastFour !== undefined) { fields.push(`card_last_four = $${idx++}`); values.push(patch.cardLastFour); }

    fields.push(`updated_at = $${idx++}`);
    values.push(new Date());
    values.push(id);

    const result = await this.pool.query(
      `UPDATE payment_methods SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return this.mapRow(result.rows[0]);
  }

  async unsetAllDefaults(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE payment_methods SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_default = TRUE AND status = 'ACTIVE'`,
      [userId],
    );
  }

  private mapRow(row: Record<string, unknown>): PaymentMethod {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      pgProvider: row.pg_provider as string,
      channelType: row.channel_type as PaymentMethod['channelType'],
      billingKeyRef: row.billing_key_ref as string,
      cardName: (row.card_name as string) ?? null,
      cardLastFour: (row.card_last_four as string) ?? null,
      isDefault: row.is_default as boolean,
      status: row.status as PaymentMethod['status'],
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
