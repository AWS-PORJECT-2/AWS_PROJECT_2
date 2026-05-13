import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export interface ShippingAddressRow {
  id: number;
  userId: number;
  label: string;
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  roadAddress: string;
  jibunAddress: string | null;
  detailAddress: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAddressInput {
  userId: number;
  label: string;
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  roadAddress: string;
  jibunAddress?: string | null;
  detailAddress?: string | null;
  isDefault?: boolean;
}

export interface UpdateAddressInput {
  label?: string;
  recipientName?: string;
  recipientPhone?: string;
  postalCode?: string;
  roadAddress?: string;
  jibunAddress?: string | null;
  detailAddress?: string | null;
}

export interface ShippingAddressRepository {
  findById(id: number): Promise<ShippingAddressRow | null>;
  findByUser(userId: number): Promise<ShippingAddressRow[]>;
  countByUser(userId: number): Promise<number>;
  create(input: CreateAddressInput): Promise<ShippingAddressRow>;
  update(id: number, input: UpdateAddressInput): Promise<void>;
  delete(id: number): Promise<void>;
  setDefault(userId: number, id: number, conn?: PoolConnection): Promise<void>;
  clearDefault(userId: number, conn?: PoolConnection): Promise<void>;
  findDefaultByUser(userId: number): Promise<ShippingAddressRow | null>;
}

export class MySQLShippingAddressRepository implements ShippingAddressRepository {
  constructor(private pool: Pool) {}

  async findById(id: number): Promise<ShippingAddressRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM shipping_addresses WHERE id = ?',
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async findByUser(userId: number): Promise<ShippingAddressRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM shipping_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
      [userId]
    );
    return rows.map(this.mapRow);
  }

  async countByUser(userId: number): Promise<number> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM shipping_addresses WHERE user_id = ?',
      [userId]
    );
    return Number(rows[0].cnt);
  }

  async create(input: CreateAddressInput): Promise<ShippingAddressRow> {
    const [result] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO shipping_addresses
        (user_id, label, recipient_name, recipient_phone, postal_code, road_address, jibun_address, detail_address, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.label,
        input.recipientName,
        input.recipientPhone,
        input.postalCode,
        input.roadAddress,
        input.jibunAddress ?? null,
        input.detailAddress ?? null,
        input.isDefault ?? false,
      ]
    );
    const created = await this.findById(result.insertId);
    if (!created) throw new Error('주소 생성 직후 조회에 실패했습니다');
    return created;
  }

  async update(id: number, input: UpdateAddressInput): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.label !== undefined) { fields.push('label = ?'); values.push(input.label); }
    if (input.recipientName !== undefined) { fields.push('recipient_name = ?'); values.push(input.recipientName); }
    if (input.recipientPhone !== undefined) { fields.push('recipient_phone = ?'); values.push(input.recipientPhone); }
    if (input.postalCode !== undefined) { fields.push('postal_code = ?'); values.push(input.postalCode); }
    if (input.roadAddress !== undefined) { fields.push('road_address = ?'); values.push(input.roadAddress); }
    if (input.jibunAddress !== undefined) { fields.push('jibun_address = ?'); values.push(input.jibunAddress); }
    if (input.detailAddress !== undefined) { fields.push('detail_address = ?'); values.push(input.detailAddress); }

    if (fields.length === 0) return;

    values.push(id);
    await this.pool.query(
      `UPDATE shipping_addresses SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  async delete(id: number): Promise<void> {
    await this.pool.query('DELETE FROM shipping_addresses WHERE id = ?', [id]);
  }

  async setDefault(userId: number, id: number, conn?: PoolConnection): Promise<void> {
    const exec = conn ?? this.pool;
    await exec.query(
      'UPDATE shipping_addresses SET is_default = (id = ?) WHERE user_id = ?',
      [id, userId]
    );
  }

  async clearDefault(userId: number, conn?: PoolConnection): Promise<void> {
    const exec = conn ?? this.pool;
    await exec.query(
      'UPDATE shipping_addresses SET is_default = FALSE WHERE user_id = ?',
      [userId]
    );
  }

  async findDefaultByUser(userId: number): Promise<ShippingAddressRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM shipping_addresses WHERE user_id = ? AND is_default = TRUE LIMIT 1',
      [userId]
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  private mapRow = (row: RowDataPacket): ShippingAddressRow => ({
    id: row.id,
    userId: row.user_id,
    label: row.label,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    postalCode: row.postal_code,
    roadAddress: row.road_address,
    jibunAddress: row.jibun_address,
    detailAddress: row.detail_address,
    isDefault: Boolean(row.is_default),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}
