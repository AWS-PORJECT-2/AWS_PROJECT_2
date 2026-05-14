import type pg from 'pg';
import type { Address } from '../types/index.js';
import type { AddressRepository } from './address-repository.js';

export class PgAddressRepository implements AddressRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(address: Omit<Address, 'id' | 'createdAt' | 'updatedAt'>): Promise<Address> {
    if (address.isDefault) {
      await this.pool.query(
        'UPDATE addresses SET is_default = FALSE WHERE user_id = $1',
        [address.userId],
      );
    }

    const result = await this.pool.query(
      `INSERT INTO addresses (user_id, label, recipient_name, recipient_phone, postal_code, road_address, jibun_address, detail_address, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        address.userId,
        address.label,
        address.recipientName,
        address.recipientPhone,
        address.postalCode,
        address.roadAddress,
        address.jibunAddress ?? null,
        address.detailAddress ?? null,
        address.isDefault,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findByUserId(userId: string): Promise<Address[]> {
    const result = await this.pool.query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
      [userId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findById(id: string, userId: string): Promise<Address | null> {
    const result = await this.pool.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async update(
    id: string,
    userId: string,
    data: Partial<Omit<Address, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Address | null> {
    const existing = await this.findById(id, userId);
    if (!existing) return null;

    if (data.isDefault) {
      await this.pool.query(
        'UPDATE addresses SET is_default = FALSE WHERE user_id = $1',
        [userId],
      );
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      label: 'label',
      recipientName: 'recipient_name',
      recipientPhone: 'recipient_phone',
      postalCode: 'postal_code',
      roadAddress: 'road_address',
      jibunAddress: 'jibun_address',
      detailAddress: 'detail_address',
      isDefault: 'is_default',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (key in data) {
        fields.push(`${column} = $${paramIndex}`);
        values.push((data as Record<string, unknown>)[key] ?? null);
        paramIndex++;
      }
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = NOW()');
    values.push(id, userId);

    const query = `UPDATE addresses SET ${fields.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`;
    const result = await this.pool.query(query, values);

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM addresses WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async setDefault(id: string, userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE addresses SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1',
      [userId],
    );
    await this.pool.query(
      'UPDATE addresses SET is_default = TRUE, updated_at = NOW() WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
  }

  private mapRow(row: Record<string, unknown>): Address {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      label: row.label as string,
      recipientName: row.recipient_name as string,
      recipientPhone: row.recipient_phone as string,
      postalCode: row.postal_code as string,
      roadAddress: row.road_address as string,
      jibunAddress: (row.jibun_address as string) || undefined,
      detailAddress: (row.detail_address as string) || undefined,
      isDefault: row.is_default as boolean,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
