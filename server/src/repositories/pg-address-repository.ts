import type pg from 'pg';
import type { Address } from '../types/index.js';
import type { AddressRepository, DeleteResult } from './address-repository.js';

export class PgAddressRepository implements AddressRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(addr: Address): Promise<Address> {
    const result = await this.pool.query(
      `INSERT INTO addresses (id, user_id, label, recipient_name, recipient_phone, postal_code, road_address, jibun_address, detail_address, is_default, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        addr.id, addr.userId, addr.label, addr.recipientName, addr.recipientPhone,
        addr.postalCode, addr.roadAddress, addr.jibunAddress, addr.detailAddress,
        addr.isDefault, addr.createdAt, addr.updatedAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<Address | null> {
    const result = await this.pool.query('SELECT * FROM addresses WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async list(userId: string): Promise<Address[]> {
    const result = await this.pool.query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async findDefault(userId: string): Promise<Address | null> {
    const result = await this.pool.query(
      'SELECT * FROM addresses WHERE user_id = $1 AND is_default = TRUE',
      [userId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async update(id: string, patch: Partial<Address>): Promise<Address> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (patch.label !== undefined) { fields.push(`label = $${idx++}`); values.push(patch.label); }
    if (patch.recipientName !== undefined) { fields.push(`recipient_name = $${idx++}`); values.push(patch.recipientName); }
    if (patch.recipientPhone !== undefined) { fields.push(`recipient_phone = $${idx++}`); values.push(patch.recipientPhone); }
    if (patch.postalCode !== undefined) { fields.push(`postal_code = $${idx++}`); values.push(patch.postalCode); }
    if (patch.roadAddress !== undefined) { fields.push(`road_address = $${idx++}`); values.push(patch.roadAddress); }
    if (patch.jibunAddress !== undefined) { fields.push(`jibun_address = $${idx++}`); values.push(patch.jibunAddress); }
    if (patch.detailAddress !== undefined) { fields.push(`detail_address = $${idx++}`); values.push(patch.detailAddress); }
    if (patch.isDefault !== undefined) { fields.push(`is_default = $${idx++}`); values.push(patch.isDefault); }

    fields.push(`updated_at = $${idx++}`);
    values.push(new Date());
    values.push(id);

    const result = await this.pool.query(
      `UPDATE addresses SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (result.rows.length === 0) {
      throw new Error(`Address not found: ${id}`);
    }
    return this.mapRow(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM addresses WHERE id = $1', [id]);
  }

  async unsetAllDefaults(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE addresses SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_default = TRUE',
      [userId],
    );
  }

  async setDefaultAtomic(userId: string, id: string): Promise<Address | null> {
    // 단일 UPDATE — partial unique index 의 race 충돌 없이 atomic 전환.
    const result = await this.pool.query(
      `UPDATE addresses
       SET is_default = (id = $2), updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId, id],
    );
    const target = result.rows.find((r: Record<string, unknown>) => r.id === id);
    return target ? this.mapRow(target) : null;
  }

  async deleteWithGuard(userId: string, id: string): Promise<DeleteResult> {
    // 한 SQL — "user 의 주소 개수 > 1" 조건이 DELETE 의 WHERE 절 안에서 검증되어 race 없음.
    // 동시 두 삭제 요청이 들어와도 PG 가 row lock + WHERE 절 재평가로 직렬화.
    const result = await this.pool.query(
      `DELETE FROM addresses
       WHERE id = $1 AND user_id = $2
         AND (SELECT COUNT(*) FROM addresses WHERE user_id = $2) > 1
       RETURNING is_default`,
      [id, userId],
    );
    if (result.rowCount === 0) {
      // 삭제 안 됨 — 존재하지 않거나 마지막 1개. 원인 구분.
      const existsResult = await this.pool.query(
        'SELECT 1 FROM addresses WHERE id = $1 AND user_id = $2',
        [id, userId],
      );
      if (existsResult.rowCount === 0) return { deleted: false, reason: 'NOT_FOUND' };
      return { deleted: false, reason: 'LAST' };
    }
    return { deleted: true, wasDefault: result.rows[0].is_default as boolean };
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
      jibunAddress: (row.jibun_address as string) ?? null,
      detailAddress: (row.detail_address as string) ?? null,
      isDefault: row.is_default as boolean,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
