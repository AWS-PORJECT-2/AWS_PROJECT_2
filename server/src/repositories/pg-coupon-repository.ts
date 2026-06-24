import type pg from 'pg';
import type { Coupon } from '../types/index.js';
import type { CouponRepository, CouponCreate } from './coupon-repository.js';

/** 수수료 할인 쿠폰 저장소 (045_coupons). */
export class PgCouponRepository implements CouponRepository {
  constructor(private readonly pool: pg.Pool) {}

  private static map(row: Record<string, unknown>): Coupon {
    return {
      id: row.id as string,
      code: row.code as string,
      ownerUserId: row.owner_user_id as string,
      discountType: row.discount_type as Coupon['discountType'],
      discountValue: Number(row.discount_value),
      label: row.label as string,
      status: row.status as Coupon['status'],
      usedGroupbuyId: (row.used_groupbuy_id as string | null) ?? null,
      issuedBy: (row.issued_by as string | null) ?? null,
      note: (row.note as string | null) ?? null,
      expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
      createdAt: new Date(row.created_at as string),
      usedAt: row.used_at ? new Date(row.used_at as string) : null,
    };
  }

  async create(input: CouponCreate): Promise<Coupon> {
    const r = await this.pool.query(
      `INSERT INTO coupons (code, owner_user_id, discount_type, discount_value, label, issued_by, note, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.code,
        input.ownerUserId,
        input.discountType,
        input.discountValue,
        input.label,
        input.issuedBy ?? null,
        input.note ?? null,
        input.expiresAt ?? null,
      ],
    );
    return PgCouponRepository.map(r.rows[0]);
  }

  async findByCode(code: string): Promise<Coupon | null> {
    const r = await this.pool.query('SELECT * FROM coupons WHERE code = $1', [code]);
    return r.rows.length ? PgCouponRepository.map(r.rows[0]) : null;
  }

  async listByOwner(ownerId: string): Promise<Coupon[]> {
    const r = await this.pool.query(
      `SELECT * FROM coupons WHERE owner_user_id = $1
       ORDER BY (status = 'unused') DESC, created_at DESC`,
      [ownerId],
    );
    return r.rows.map(PgCouponRepository.map);
  }

  async listRecent(limit: number): Promise<Coupon[]> {
    const r = await this.pool.query(
      'SELECT * FROM coupons ORDER BY created_at DESC LIMIT $1',
      [Math.max(1, Math.min(200, limit))],
    );
    return r.rows.map(PgCouponRepository.map);
  }

  async markUsed(code: string, ownerId: string, groupbuyId: string): Promise<Coupon | null> {
    // 원자적 전이 — 소유자 본인 + 미사용 + 미만료 조건을 WHERE 에 모두 담아 이중 사용/만료 사용을 DB 가 거부.
    const r = await this.pool.query(
      `UPDATE coupons
          SET status = 'used', used_groupbuy_id = $3, used_at = now()
        WHERE code = $1 AND owner_user_id = $2 AND status = 'unused'
          AND (expires_at IS NULL OR expires_at > now())
        RETURNING *`,
      [code, ownerId, groupbuyId],
    );
    return r.rows.length ? PgCouponRepository.map(r.rows[0]) : null;
  }
}
