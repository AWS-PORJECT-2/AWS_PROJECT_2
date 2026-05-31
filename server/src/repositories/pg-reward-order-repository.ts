import type pg from 'pg';
import type { RewardOrder, RewardOrderStatus } from '../types/index.js';

// 목록 표시용(펀드 제목/썸네일/입금자 등 조인)
export interface RewardOrderListItem extends RewardOrder {
  fundTitle: string;
  fundImageUrl: string | null;
  userName?: string | null;
  userNickname?: string | null;
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
    cancelReason: (row.cancel_reason as string | null) ?? null,
    cancelRequestedAt: row.cancel_requested_at ? new Date(row.cancel_requested_at as string) : null,
    refundedAt: row.refunded_at ? new Date(row.refunded_at as string) : null,
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

  /**
   * 한정수량 리워드의 "재고 확인 + 후원 INSERT" 를 한 트랜잭션으로 원자 처리(TOCTOU 초과판매 방지).
   * groupbuys 행을 FOR UPDATE 로 잠가 같은 펀드의 동시 후원 신청을 직렬화한다.
   * stockLimit == null 이면 무제한 → 단순 INSERT. 재고가 한도에 도달했으면 null 반환(SOLD_OUT).
   */
  async createWithStockGuard(o: RewardOrder, stockLimit: number | null): Promise<RewardOrder | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // 펀드 행 잠금 — reward_tier 별 재고가 groupbuys JSON 컬럼에 있어 펀드 단위 직렬화로 충분.
      await client.query('SELECT 1 FROM groupbuys WHERE id = $1 FOR UPDATE', [o.fundId]);
      if (stockLimit != null) {
        const cnt = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM reward_orders
            WHERE fund_id = $1 AND reward_tier_id = $2 AND status IN ('awaiting_deposit','confirmed')`,
          [o.fundId, o.rewardTierId],
        );
        const taken = Number(cnt.rows[0]?.cnt) || 0;
        if (taken >= stockLimit) { await client.query('ROLLBACK'); return null; }
      }
      const res = await client.query(
        `INSERT INTO reward_orders (id, fund_id, reward_tier_id, reward_title, user_id, address_id, depositor_name, amount, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [o.id, o.fundId, o.rewardTierId, o.rewardTitle, o.userId, o.addressId, o.depositorName, o.amount, o.status, o.createdAt],
      );
      await client.query('COMMIT');
      return mapRow(res.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
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

  /**
   * 펀드 삭제 시 해당 펀드의 모든 후원 주문을 취소.
   * confirmed 였던 주문은 groupbuys.current_quantity 를 되돌린다(환불 대상).
   * 반환: 취소된 주문들(환불 안내용) — 특히 confirmed 였던 건은 실제 송금 환불 필요.
   */
  async cancelAllForFund(fundId: string): Promise<{ refundable: RewardOrder[]; cancelledCount: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // cancel_requested(취소요청 대기) 도 활성 주문이므로 함께 정리. confirmed 였던 건(confirmed_at)은 수량 복구 대상.
      const active = await client.query(
        `SELECT * FROM reward_orders WHERE fund_id = $1 AND status IN ('awaiting_deposit','confirmed','cancel_requested') FOR UPDATE`,
        [fundId],
      );
      const rows = active.rows.map(mapRow);
      // 실제 입금완료(confirmed_at 있음) 건 수만큼 current_quantity 복구 — status 가 cancel_requested 로 바뀐 건도 포함.
      const confirmedCount = rows.filter((r) => r.confirmedAt != null).length;
      if (confirmedCount > 0) {
        await client.query(
          `UPDATE groupbuys SET current_quantity = GREATEST(0, current_quantity - $1), updated_at = NOW() WHERE id = $2`,
          [confirmedCount, fundId],
        );
      }
      await client.query(
        `UPDATE reward_orders SET status = 'cancelled' WHERE fund_id = $1 AND status IN ('awaiting_deposit','confirmed','cancel_requested')`,
        [fundId],
      );
      await client.query('COMMIT');
      // 실입금(confirmed_at 있음) 건만 환불 대상으로 안내
      return { refundable: rows.filter((r) => r.confirmedAt != null), cancelledCount: rows.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 해당 펀드의 후원자(고유 user_id) 목록 — 알림 발송 대상.
   * 취소(cancelled) 제외, 입금대기/확정 후원자만. created_at 최신 우선.
   */
  async backerUserIds(fundId: string): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT DISTINCT user_id FROM reward_orders
        WHERE fund_id = $1 AND status IN ('awaiting_deposit','confirmed')`,
      [fundId],
    );
    return res.rows.map((r) => r.user_id as string);
  }

  // ─── 회원 탈퇴 가드(#3) — 사용자의 "활성" 주문 수(입금대기/확정/취소요청). ───
  async countActiveByUser(userId: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM reward_orders
        WHERE user_id = $1 AND status IN ('awaiting_deposit','confirmed','cancel_requested')`,
      [userId],
    );
    return Number(res.rows[0]?.cnt) || 0;
  }

  // ─── 펀드 삭제 가드(#6) — 환불되지 않은 confirmed 주문 수. ───
  // refunded_at 이 NULL 인 confirmed/cancel_requested 주문 = 아직 환불 안 된 실입금 건.
  async countUnrefundedConfirmedForFund(fundId: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM reward_orders
        WHERE fund_id = $1 AND status IN ('confirmed','cancel_requested')
          AND confirmed_at IS NOT NULL AND refunded_at IS NULL`,
      [fundId],
    );
    return Number(res.rows[0]?.cnt) || 0;
  }

  /**
   * 사용자 취소 신청(#4) — 본인 주문이고 awaiting_deposit/confirmed 일 때만 cancel_requested 로 전이.
   * 이미 취소요청/취소/환불 상태면 0행(409). 본인 소유가 아니면 0행(IDOR 방지).
   * 반환: 전이된 주문(상태 포함) 또는 null.
   */
  async requestCancel(id: string, userId: string, reason: string | null): Promise<RewardOrder | null> {
    const res = await this.pool.query(
      `UPDATE reward_orders
          SET status = 'cancel_requested', cancel_requested_at = NOW(), cancel_reason = $3
        WHERE id = $1 AND user_id = $2 AND status IN ('awaiting_deposit','confirmed')
        RETURNING *`,
      [id, userId, reason],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  /** 관리자: 취소 신청 목록(status='cancel_requested') — 펀드 제목/닉네임 조인. */
  async listCancelRequests(): Promise<RewardOrderListItem[]> {
    const res = await this.pool.query(
      `SELECT o.*, g.title AS fund_title,
              COALESCE(g.tryon_image_url, g.design_image_url) AS fund_image_url,
              u.name AS user_name, u.nickname AS user_nickname
         FROM reward_orders o
         JOIN groupbuys g ON g.id = o.fund_id
         LEFT JOIN "user" u ON u.id = o.user_id
        WHERE o.status = 'cancel_requested'
        ORDER BY o.cancel_requested_at DESC NULLS LAST, o.created_at DESC`,
    );
    return res.rows.map((r) => ({
      ...mapRow(r),
      fundTitle: r.fund_title,
      fundImageUrl: r.fund_image_url ?? null,
      userName: r.user_name ?? null,
      userNickname: r.user_nickname ?? null,
    }));
  }

  /**
   * 관리자 환불 표시(#4) — confirmed 였던(confirmed_at 있음) 주문에 refunded_at 기록.
   * 실제 송금은 외부. 미입금(confirmed_at NULL)이면 환불 대상 아님 → null.
   * cancel_requested 또는 confirmed 상태에서 표시 가능. 이미 refunded_at 있으면 멱등(그대로 반환).
   * 반환: 해당 주문 / 대상 아님이면 null.
   */
  async markRefunded(id: string): Promise<RewardOrder | null> {
    const res = await this.pool.query(
      `UPDATE reward_orders
          SET refunded_at = COALESCE(refunded_at, NOW())
        WHERE id = $1 AND confirmed_at IS NOT NULL
          AND status IN ('confirmed','cancel_requested')
        RETURNING *`,
      [id],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  /**
   * 관리자 최종 취소(#4) — 원자 트랜잭션:
   *  - confirmed 였던(confirmed_at 있음) 주문: 아직 환불표시 안 됐으면 'REFUND_REQUIRED' 반환(취소 거부).
   *    환불표시 됐으면 status='refunded' + groupbuys.current_quantity 1 감소 + 티어 soldCount 감소.
   *  - 미입금(awaiting_deposit/cancel_requested 인데 confirmed_at NULL): 환불 없이 status='cancelled'.
   *  - 이미 cancelled/refunded: 'INVALID_STATE'.
   * 반환: { ok:true, order } | { ok:false, code:'REFUND_REQUIRED'|'INVALID_STATE'|'NOT_FOUND' }
   */
  async adminCancel(id: string): Promise<
    | { ok: true; order: RewardOrder; wasConfirmed: boolean }
    | { ok: false; code: 'REFUND_REQUIRED' | 'INVALID_STATE' | 'NOT_FOUND' }
  > {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sel = await client.query('SELECT * FROM reward_orders WHERE id = $1 FOR UPDATE', [id]);
      if (sel.rows.length === 0) { await client.query('ROLLBACK'); return { ok: false, code: 'NOT_FOUND' }; }
      const current = mapRow(sel.rows[0]);

      if (current.status === 'cancelled' || current.status === 'refunded') {
        await client.query('ROLLBACK');
        return { ok: false, code: 'INVALID_STATE' };
      }
      // 취소 가능 상태: awaiting_deposit / confirmed / cancel_requested.
      if (!['awaiting_deposit', 'confirmed', 'cancel_requested'].includes(current.status)) {
        await client.query('ROLLBACK');
        return { ok: false, code: 'INVALID_STATE' };
      }

      const wasConfirmed = current.confirmedAt != null;
      if (wasConfirmed) {
        // 실입금 건은 환불표시(refunded_at) 선행 필수.
        if (current.refundedAt == null) { await client.query('ROLLBACK'); return { ok: false, code: 'REFUND_REQUIRED' }; }
        // 재고/수량 되돌리기 — confirm 의 역연산.
        await client.query(
          `UPDATE groupbuys SET current_quantity = GREATEST(0, current_quantity - 1), updated_at = NOW() WHERE id = $1`,
          [current.fundId],
        );
        const gb = await client.query('SELECT reward_tiers FROM groupbuys WHERE id = $1 FOR UPDATE', [current.fundId]);
        const raw = gb.rows[0]?.reward_tiers;
        if (raw) {
          let tiers: Array<Record<string, unknown>> = [];
          try { tiers = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { tiers = []; }
          if (Array.isArray(tiers)) {
            const t = tiers.find((x) => String(x.id) === current.rewardTierId);
            if (t) t.soldCount = Math.max(0, (Number(t.soldCount) || 0) - 1);
            await client.query('UPDATE groupbuys SET reward_tiers = $1 WHERE id = $2', [JSON.stringify(tiers), current.fundId]);
          }
        }
      }

      const finalStatus = wasConfirmed ? 'refunded' : 'cancelled';
      const upd = await client.query(
        `UPDATE reward_orders SET status = $2 WHERE id = $1 RETURNING *`,
        [id, finalStatus],
      );
      await client.query('COMMIT');
      return { ok: true, order: mapRow(upd.rows[0]), wasConfirmed };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

}
