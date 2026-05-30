import type pg from 'pg';
import type { RewardOrder, RewardOrderStatus } from '../types/index.js';

// 목록 표시용(펀드 제목/썸네일/입금자 등 조인)
export interface RewardOrderListItem extends RewardOrder {
  fundTitle: string;
  fundImageUrl: string | null;
  userName?: string | null;
}

function mapRow(row: Record<string, unknown>): RewardOrder {
  return {
    id: row.id as string,
    fundId: row.fund_id as string,
    rewardTierId: row.reward_tier_id as string,
    rewardTitle: row.reward_title as string,
    userId: row.user_id as string,
    addressId: (row.address_id as string | null) ?? null,
    depositorName: (row.depositor_name as string | null) ?? null,
    amount: Number(row.amount) || 0,
    status: row.status as RewardOrderStatus,
    createdAt: new Date(row.created_at as string),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : null,
  };
}

export class PgRewardOrderRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(o: RewardOrder): Promise<RewardOrder> {
    const res = await this.pool.query(
      `INSERT INTO reward_orders (id, fund_id, reward_tier_id, reward_title, user_id, address_id, depositor_name, amount, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [o.id, o.fundId, o.rewardTierId, o.rewardTitle, o.userId, o.addressId, o.depositorName, o.amount, o.status, o.createdAt],
    );
    return mapRow(res.rows[0]);
  }

  async findById(id: string): Promise<RewardOrder | null> {
    const res = await this.pool.query('SELECT * FROM reward_orders WHERE id = $1', [id]);
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  async listByUser(userId: string): Promise<RewardOrderListItem[]> {
    const res = await this.pool.query(
      `SELECT o.*, g.title AS fund_title,
              COALESCE(g.tryon_image_url, g.design_image_url) AS fund_image_url
         FROM reward_orders o
         JOIN groupbuys g ON g.id = o.fund_id
        WHERE o.user_id = $1
        ORDER BY o.created_at DESC`,
      [userId],
    );
    return res.rows.map((r) => ({ ...mapRow(r), fundTitle: r.fund_title, fundImageUrl: r.fund_image_url ?? null }));
  }

  async listByStatus(status: RewardOrderStatus): Promise<RewardOrderListItem[]> {
    const res = await this.pool.query(
      `SELECT o.*, g.title AS fund_title,
              COALESCE(g.tryon_image_url, g.design_image_url) AS fund_image_url,
              u.name AS user_name
         FROM reward_orders o
         JOIN groupbuys g ON g.id = o.fund_id
         LEFT JOIN "user" u ON u.id = o.user_id
        WHERE o.status = $1
        ORDER BY o.created_at DESC`,
      [status],
    );
    return res.rows.map((r) => ({
      ...mapRow(r), fundTitle: r.fund_title, fundImageUrl: r.fund_image_url ?? null, userName: r.user_name ?? null,
    }));
  }

  // 입금자명 보고 — 본인 주문, awaiting_deposit 상태에서만.
  async reportDepositor(id: string, userId: string, depositorName: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE reward_orders SET depositor_name = $1
        WHERE id = $2 AND user_id = $3 AND status = 'awaiting_deposit'`,
      [depositorName, id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * 관리자 입금확인 — 원자적 트랜잭션:
   *  1) reward_orders.status awaiting_deposit→confirmed
   *  2) groupbuys.current_quantity += 1
   *  3) 해당 reward tier 의 soldCount += 1 (reward_tiers JSON 갱신)
   * 이미 confirmed 거나 없으면 null 반환(멱등).
   */
  async confirm(id: string): Promise<RewardOrder | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE reward_orders SET status='confirmed', confirmed_at=NOW()
          WHERE id=$1 AND status='awaiting_deposit' RETURNING *`,
        [id],
      );
      if (upd.rows.length === 0) { await client.query('ROLLBACK'); return null; }
      const order = mapRow(upd.rows[0]);

      await client.query(
        `UPDATE groupbuys SET current_quantity = current_quantity + 1, updated_at = NOW() WHERE id = $1`,
        [order.fundId],
      );

      // reward_tiers JSON 에서 해당 티어 soldCount++ (TEXT 컬럼 → JS 로 안전 갱신)
      const gb = await client.query('SELECT reward_tiers FROM groupbuys WHERE id = $1 FOR UPDATE', [order.fundId]);
      const raw = gb.rows[0]?.reward_tiers;
      if (raw) {
        let tiers: Array<Record<string, unknown>> = [];
        try { tiers = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { tiers = []; }
        if (Array.isArray(tiers)) {
          const t = tiers.find((x) => String(x.id) === order.rewardTierId);
          if (t) t.soldCount = (Number(t.soldCount) || 0) + 1;
          await client.query('UPDATE groupbuys SET reward_tiers = $1 WHERE id = $2', [JSON.stringify(tiers), order.fundId]);
        }
      }

      await client.query('COMMIT');
      return order;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // 특정 티어의 확정 수량(재고 차감 계산용)
  async confirmedCountForTier(fundId: string, rewardTierId: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM reward_orders
        WHERE fund_id = $1 AND reward_tier_id = $2 AND status IN ('awaiting_deposit','confirmed')`,
      [fundId, rewardTierId],
    );
    return res.rows[0]?.cnt ?? 0;
  }
}
