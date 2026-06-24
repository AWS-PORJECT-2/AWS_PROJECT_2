import type pg from 'pg';
import type { Coupon, CouponCode } from '../types/index.js';
import type { CouponRepository, CouponCreate, CouponCodeCreate, RegisterResult } from './coupon-repository.js';

/** 수수료 할인 쿠폰 저장소 (045_coupons + 046_coupon_codes). */
export class PgCouponRepository implements CouponRepository {
  constructor(private readonly pool: pg.Pool) {}

  private static map(row: Record<string, unknown>): Coupon {
    return {
      id: row.id as string,
      code: (row.code as string | null) ?? null,
      ownerUserId: row.owner_user_id as string,
      discountType: row.discount_type as Coupon['discountType'],
      discountValue: Number(row.discount_value),
      label: row.label as string,
      status: row.status as Coupon['status'],
      usedGroupbuyId: (row.used_groupbuy_id as string | null) ?? null,
      sourceCodeId: (row.source_code_id as string | null) ?? null,
      issuedBy: (row.issued_by as string | null) ?? null,
      note: (row.note as string | null) ?? null,
      expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
      createdAt: new Date(row.created_at as string),
      usedAt: row.used_at ? new Date(row.used_at as string) : null,
    };
  }

  private static mapCode(row: Record<string, unknown>): CouponCode {
    return {
      id: row.id as string,
      code: row.code as string,
      label: row.label as string,
      discountType: row.discount_type as CouponCode['discountType'],
      discountValue: Number(row.discount_value),
      maxRegistrations: row.max_registrations != null ? Number(row.max_registrations) : null,
      registeredCount: Number(row.registered_count),
      codeExpiresAt: row.code_expires_at ? new Date(row.code_expires_at as string) : null,
      couponValidDays: row.coupon_valid_days != null ? Number(row.coupon_valid_days) : null,
      active: row.active as boolean,
      createdBy: (row.created_by as string | null) ?? null,
      createdAt: new Date(row.created_at as string),
    };
  }

  async create(input: CouponCreate): Promise<Coupon> {
    const r = await this.pool.query(
      `INSERT INTO coupons (owner_user_id, discount_type, discount_value, label, issued_by, note, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [input.ownerUserId, input.discountType, input.discountValue, input.label, input.issuedBy ?? null, input.note ?? null, input.expiresAt ?? null],
    );
    return PgCouponRepository.map(r.rows[0]);
  }

  async findById(id: string): Promise<Coupon | null> {
    const r = await this.pool.query('SELECT * FROM coupons WHERE id = $1', [id]);
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

  async markUsedById(id: string, ownerId: string, groupbuyId: string): Promise<Coupon | null> {
    const r = await this.pool.query(
      `UPDATE coupons SET status = 'used', used_groupbuy_id = $3, used_at = now()
        WHERE id = $1 AND owner_user_id = $2 AND status = 'unused'
          AND (expires_at IS NULL OR expires_at > now())
        RETURNING *`,
      [id, ownerId, groupbuyId],
    );
    return r.rows.length ? PgCouponRepository.map(r.rows[0]) : null;
  }

  async reactivateByGroupbuy(groupbuyId: string): Promise<number> {
    const r = await this.pool.query(
      `UPDATE coupons SET status = 'unused', used_groupbuy_id = NULL, used_at = NULL
        WHERE used_groupbuy_id = $1 AND status = 'used'`,
      [groupbuyId],
    );
    return r.rowCount ?? 0;
  }

  // ── 공유 쿠폰 코드 ──
  async createCode(input: CouponCodeCreate): Promise<CouponCode> {
    const r = await this.pool.query(
      `INSERT INTO coupon_codes (code, label, discount_type, discount_value, max_registrations, code_expires_at, coupon_valid_days, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [input.code, input.label, input.discountType, input.discountValue,
       input.maxRegistrations ?? null, input.codeExpiresAt ?? null, input.couponValidDays ?? null, input.createdBy ?? null],
    );
    return PgCouponRepository.mapCode(r.rows[0]);
  }

  async findCodeByCode(code: string): Promise<CouponCode | null> {
    const r = await this.pool.query('SELECT * FROM coupon_codes WHERE code = $1', [code]);
    return r.rows.length ? PgCouponRepository.mapCode(r.rows[0]) : null;
  }

  async listCodes(limit: number): Promise<CouponCode[]> {
    const r = await this.pool.query(
      'SELECT * FROM coupon_codes ORDER BY created_at DESC LIMIT $1',
      [Math.max(1, Math.min(200, limit))],
    );
    return r.rows.map(PgCouponRepository.mapCode);
  }

  async registerCode(code: string, ownerId: string): Promise<RegisterResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const cr = await client.query('SELECT * FROM coupon_codes WHERE code = $1 FOR UPDATE', [code]);
      if (!cr.rows.length) { await client.query('ROLLBACK'); return { ok: false, reason: 'NOT_FOUND' }; }
      const cc = PgCouponRepository.mapCode(cr.rows[0]);
      if (!cc.active) { await client.query('ROLLBACK'); return { ok: false, reason: 'INACTIVE' }; }
      if (cc.codeExpiresAt && cc.codeExpiresAt.getTime() <= Date.now()) { await client.query('ROLLBACK'); return { ok: false, reason: 'EXPIRED' }; }
      if (cc.maxRegistrations != null && cc.registeredCount >= cc.maxRegistrations) { await client.query('ROLLBACK'); return { ok: false, reason: 'FULL' }; }
      const dup = await client.query('SELECT 1 FROM coupons WHERE owner_user_id = $1 AND source_code_id = $2', [ownerId, cc.id]);
      if (dup.rows.length) { await client.query('ROLLBACK'); return { ok: false, reason: 'ALREADY' }; }

      const expiresAt = cc.couponValidDays != null ? new Date(Date.now() + cc.couponValidDays * 86400000) : null;
      const ins = await client.query(
        `INSERT INTO coupons (code, owner_user_id, discount_type, discount_value, label, source_code_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [cc.code, ownerId, cc.discountType, cc.discountValue, cc.label, cc.id, expiresAt],
      );
      const newCount = cc.registeredCount + 1;
      const nowFull = cc.maxRegistrations != null && newCount >= cc.maxRegistrations;
      await client.query('UPDATE coupon_codes SET registered_count = $1, active = $2 WHERE id = $3',
        [newCount, nowFull ? false : cc.active, cc.id]);
      await client.query('COMMIT');
      return { ok: true, coupon: PgCouponRepository.map(ins.rows[0]) };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
