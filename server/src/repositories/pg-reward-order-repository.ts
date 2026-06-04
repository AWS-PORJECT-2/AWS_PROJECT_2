import type pg from 'pg';
import type { RewardOrder, RewardOrderStatus } from '../types/index.js';

// 목록 표시용(펀드 제목/썸네일/입금자 등 조인)
export interface RewardOrderListItem extends RewardOrder {
  fundTitle: string;
  fundImageUrl: string | null;
  fundStatus?: string | null;
  fundAchievementRate?: number;
  creatorName?: string | null;
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
    // 모의결제/재시도(030). 읽기는 row.charge_attempts 가 없으면 0 으로 폴백하지만,
    // 쓰기 경로(charge_attempts = charge_attempts + 1)는 이 컬럼이 존재한다고 가정한다(마이그레이션 적용 필수).
    chargeAttempts: row.charge_attempts != null ? Number(row.charge_attempts) : 0,
    nextChargeAt: row.next_charge_at ? new Date(row.next_charge_at as string) : null,
    failReason: (row.fail_reason as string | null) ?? null,
    paidAt: row.paid_at ? new Date(row.paid_at as string) : null,
  };
}

// 텀블벅식 흐름에서 "활성(수량/카운트에 반영되는)" 후원으로 간주하는 상태.
//  - pledged: 예약(즉시 수량 반영)
//  - paid: 결제 완료
//  - payment_failed: 결제 실패했지만 재시도 중(아직 취소 아님 → 수량 유지)
//  - 구 무통장 호환: awaiting_deposit/confirmed 도 활성으로 카운트.
const ACTIVE_STATUSES = ['pledged', 'paid', 'payment_failed', 'awaiting_deposit', 'confirmed'] as const;
const ACTIVE_STATUS_SQL = ACTIVE_STATUSES.map((s) => `'${s}'`).join(',');

/**
 * groupbuys.reward_tiers(JSON TEXT) 에서 해당 티어의 soldCount 를 delta 만큼 증감.
 * 같은 트랜잭션의 client 로 호출(펀드 행은 호출 측에서 이미 FOR UPDATE 로 잠금). 음수로 내려가지 않음.
 */
async function bumpTierSoldCount(client: pg.PoolClient, fundId: string, rewardTierId: string, delta: number): Promise<void> {
  const gb = await client.query('SELECT reward_tiers FROM groupbuys WHERE id = $1 FOR UPDATE', [fundId]);
  const raw = gb.rows[0]?.reward_tiers;
  if (!raw) return;
  let tiers: Array<Record<string, unknown>> = [];
  try { tiers = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { tiers = []; }
  if (!Array.isArray(tiers)) return;
  const t = tiers.find((x) => String(x.id) === rewardTierId);
  if (!t) return;
  t.soldCount = Math.max(0, (Number(t.soldCount) || 0) + delta);
  await client.query('UPDATE groupbuys SET reward_tiers = $1 WHERE id = $2', [JSON.stringify(tiers), fundId]);
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
   * 텀블벅식 예약 후원: "재고 확인 + 후원 INSERT(pledged) + 수량/카운트 반영" 을 한 트랜잭션으로 원자 처리.
   *  - groupbuys 행을 FOR UPDATE 로 잠가 같은 펀드의 동시 후원 신청을 직렬화(TOCTOU 초과판매 방지).
   *  - 예약(pledged)은 즉시 목표 수량에 반영 → groupbuys.current_quantity +1, 해당 티어 soldCount +1.
   *  - 재고(stockLimit) 카운트는 활성 후원(pledged/paid/payment_failed + 구 awaiting_deposit/confirmed) 기준.
   * stockLimit == null 이면 무제한. 재고가 한도에 도달했으면 null 반환(SOLD_OUT).
   */
  async createWithStockGuard(
    o: RewardOrder,
    stockLimit: number | null,
  ): Promise<RewardOrder | { error: 'SOLD_OUT' | 'ALREADY_BACKED' | 'NOT_OPEN' }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // 펀드 행 잠금 — reward_tier 별 재고가 groupbuys JSON 컬럼에 있어 펀드 단위 직렬화로 충분.
      // 같은 펀드의 동시 후원이 직렬화되므로, 잠금 이후의 1인1펀딩 재검사도 경합 안전(유니크성 보장).
      const lock = await client.query(`SELECT status, deadline FROM groupbuys WHERE id = $1 FOR UPDATE`, [o.fundId]);
      // 잠금 후 상태 재검증(TOCTOU) — 라우트 사전검사와 INSERT 사이에 스케줄러가 마감(open→executing/failed)
      //  시키면 마감된 펀드에 고아 pledged 주문이 생긴다. 잠금 상태에서 status='open' AND 마감일 미경과를 재확인.
      //  (스케줄러는 60초 간격이라 status 가 아직 open 이어도 deadline 이 지났을 수 있어 별도 차단.)
      const lockRow = lock.rows[0] as { status?: string; deadline?: string } | undefined;
      const expired = !!lockRow?.deadline && new Date(lockRow.deadline).getTime() <= Date.now();
      if (!lockRow || lockRow.status !== 'open' || expired) { await client.query('ROLLBACK'); return { error: 'NOT_OPEN' }; }
      // 1인 1펀딩 가드(트랜잭션 내 재검사) — 펀드 잠금 후 활성 주문 존재 시 차단.
      const dup = await client.query(
        `SELECT 1 FROM reward_orders
          WHERE user_id = $1 AND fund_id = $2 AND status IN (${ACTIVE_STATUS_SQL}, 'cancel_requested')
          LIMIT 1`,
        [o.userId, o.fundId],
      );
      if ((dup.rowCount ?? 0) > 0) { await client.query('ROLLBACK'); return { error: 'ALREADY_BACKED' }; }
      if (stockLimit != null) {
        const cnt = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM reward_orders
            WHERE fund_id = $1 AND reward_tier_id = $2 AND status IN (${ACTIVE_STATUS_SQL})`,
          [o.fundId, o.rewardTierId],
        );
        const taken = Number(cnt.rows[0]?.cnt) || 0;
        if (taken >= stockLimit) { await client.query('ROLLBACK'); return { error: 'SOLD_OUT' }; }
      }
      const res = await client.query(
        `INSERT INTO reward_orders (id, fund_id, reward_tier_id, reward_title, user_id, address_id, depositor_name, amount, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [o.id, o.fundId, o.rewardTierId, o.rewardTitle, o.userId, o.addressId, o.depositorName, o.amount, o.status, o.createdAt],
      );
      // 예약 즉시 반영 — 펀드 current_quantity +1(참여 인원), current_amount += amount(달성 금액 캐시, 031).
      await client.query(
        `UPDATE groupbuys SET current_quantity = current_quantity + 1, current_amount = current_amount + $2, updated_at = NOW() WHERE id = $1`,
        [o.fundId, o.amount],
      );
      await bumpTierSoldCount(client, o.fundId, o.rewardTierId, +1);
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

  /**
   * 1인 1펀딩 가드 — 같은 사용자가 같은 펀드에 이미 "활성" 주문을 가졌는지.
   * 활성 = pledged/paid/payment_failed + 구 무통장(awaiting_deposit/confirmed) + cancel_requested(아직 살아있는 취소요청).
   * 후원 신청 전 사전 검사(빠른 차단)용. 경합 안전성은 createWithStockGuard 의 트랜잭션 내 재검사로 보장.
   */
  async findActiveByUserFund(userId: string, fundId: string): Promise<RewardOrder | null> {
    const res = await this.pool.query(
      `SELECT * FROM reward_orders
        WHERE user_id = $1 AND fund_id = $2 AND status IN (${ACTIVE_STATUS_SQL}, 'cancel_requested')
        ORDER BY created_at DESC LIMIT 1`,
      [userId, fundId],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  async listByUser(userId: string): Promise<RewardOrderListItem[]> {
    const res = await this.pool.query(
      `SELECT o.*, g.title AS fund_title,
              COALESCE(g.cover_image_url, g.tryon_image_url, g.design_image_url) AS fund_image_url,
              g.status AS fund_status, g.current_amount, g.target_amount,
              g.current_quantity, g.target_quantity, g.final_price,
              COALESCE(u.nickname, u.name) AS creator_name
         FROM reward_orders o
         JOIN groupbuys g ON g.id = o.fund_id
         LEFT JOIN "user" u ON u.id = g.creator_id
        WHERE o.user_id = $1
        ORDER BY o.created_at DESC`,
      [userId],
    );
    return res.rows.map((r) => {
      // 펀드 달성률(금액 기준, 폴백 수량) — 후원 카드를 관심 프로젝트처럼 리치하게 표시하기 위함.
      const cur = Number(r.current_amount) || 0;
      const tgtA = Number(r.target_amount) || 0;
      const cq = Number(r.current_quantity) || 0;
      const tq = Number(r.target_quantity) || 0;
      const fp = Number(r.final_price) || 0;
      const target = tgtA > 0 ? tgtA : tq * fp;
      const rate = target > 0 ? Math.round((cur / target) * 100) : (tq > 0 ? Math.round((cq / tq) * 100) : 0);
      return {
        ...mapRow(r), fundTitle: r.fund_title, fundImageUrl: r.fund_image_url ?? null,
        fundStatus: (r.fund_status as string | null) ?? null, fundAchievementRate: rate,
        creatorName: (r.creator_name as string | null) ?? null,
      };
    });
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

      // 입금확인 시 수량 +1 + 달성 금액 캐시 += amount(031).
      await client.query(
        `UPDATE groupbuys SET current_quantity = current_quantity + 1, current_amount = current_amount + $2, updated_at = NOW() WHERE id = $1`,
        [order.fundId, order.amount],
      );
      await bumpTierSoldCount(client, order.fundId, order.rewardTierId, +1);

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
      await client.query('SELECT 1 FROM groupbuys WHERE id = $1 FOR UPDATE', [fundId]);
      // 활성 주문(예약/결제완료/재시도중/구 무통장) + 취소요청 대기 모두 정리.
      const active = await client.query(
        `SELECT * FROM reward_orders WHERE fund_id = $1 AND status IN (${ACTIVE_STATUS_SQL},'cancel_requested') FOR UPDATE`,
        [fundId],
      );
      const rows = active.rows.map(mapRow);
      // 수량(current_quantity)에 반영돼 있던 주문은 모두 복구 대상:
      //  - pledged/paid/payment_failed: 예약 시점에 +1 했으므로 -1.
      //  - cancel_requested: 원래 pledged/paid 였던 건(예약 시 +1) — 수량 보유 중이므로 복구.
      //  - 구 무통장 confirmed(confirmed_at 있음): 입금확인 시 +1 했으므로 복구. awaiting_deposit 은 미반영(스킵).
      const restore = rows.filter((r) =>
        r.status === 'pledged' || r.status === 'paid' || r.status === 'payment_failed' ||
        r.confirmedAt != null,
      );
      for (const r of restore) {
        // 펀드 삭제: 반영돼 있던 주문 복구 — 수량 -1, 달성 금액 캐시 -= amount(031, GREATEST 로 음수 방지).
        await client.query(
          `UPDATE groupbuys SET current_quantity = GREATEST(0, current_quantity - 1), current_amount = GREATEST(0, current_amount - $2), updated_at = NOW() WHERE id = $1`,
          [fundId, r.amount],
        );
        await bumpTierSoldCount(client, fundId, r.rewardTierId, -1);
      }
      await client.query(
        `UPDATE reward_orders SET status = 'cancelled' WHERE fund_id = $1 AND status IN (${ACTIVE_STATUS_SQL},'cancel_requested')`,
        [fundId],
      );
      await client.query('COMMIT');
      // 실제 결제·입금이 일어난 건(paid_at 또는 confirmed_at 있음)만 환불 대상으로 안내.
      return { refundable: rows.filter((r) => r.paidAt != null || r.confirmedAt != null), cancelledCount: rows.length };
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
        WHERE fund_id = $1 AND status IN (${ACTIVE_STATUS_SQL})`,
      [fundId],
    );
    return res.rows.map((r) => r.user_id as string);
  }

  // ─── 회원 탈퇴 가드(#3) — 사용자의 "활성" 주문 수. ───
  // 예약(pledged)/결제완료(paid)/재시도중(payment_failed) + 구 무통장(입금대기/확정/취소요청) 모두 활성.
  async countActiveByUser(userId: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM reward_orders
        WHERE user_id = $1 AND status IN (${ACTIVE_STATUS_SQL}, 'cancel_requested')`,
      [userId],
    );
    return Number(res.rows[0]?.cnt) || 0;
  }

  // ─── 펀드 삭제 가드(#6) — 환불되지 않은 결제완료 주문 수. ───
  // refunded_at 이 NULL 인 confirmed/paid/cancel_requested 주문 = 아직 환불 안 된 실결제 건.
  //  - confirmed(구 무통장 입금완료): confirmed_at 으로 실입금 판별.
  //  - paid(모의결제 완료): paid_at 으로 실결제 판별.
  //  - cancel_requested: 원래 confirmed/paid 였던 건이면 환불 필요.
  async countUnrefundedConfirmedForFund(fundId: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM reward_orders
        WHERE fund_id = $1
          AND status IN ('confirmed','paid','cancel_requested')
          AND refunded_at IS NULL
          AND (confirmed_at IS NOT NULL OR paid_at IS NOT NULL)`,
      [fundId],
    );
    return Number(res.rows[0]?.cnt) || 0;
  }

  /**
   * 사용자 취소 신청(#4, 배치17 환불 플로우) — 본인 주문이고 paid/awaiting_deposit/confirmed 일 때만
   * cancel_requested 로 전이(관리자 환불 → 취소). 예약(pledged)은 이 경로가 아니라 cancelPledgedByUser 로 즉시 자기취소.
   * 이미 취소요청/취소/환불/예약 상태면 0행(409). 본인 소유가 아니면 0행(IDOR 방지).
   * 반환: 전이된 주문(상태 포함) 또는 null.
   */
  async requestCancel(id: string, userId: string, reason: string | null): Promise<RewardOrder | null> {
    const res = await this.pool.query(
      `UPDATE reward_orders
          SET status = 'cancel_requested', cancel_requested_at = NOW(), cancel_reason = $3
        WHERE id = $1 AND user_id = $2 AND status IN ('paid','awaiting_deposit','confirmed')
        RETURNING *`,
      [id, userId, reason],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  /**
   * 캠페인 중(pledged) 본인 후원 즉시 자기취소(텀블벅: 마감 전 자유 취소) — 환불 불필요.
   *  - 원자 트랜잭션: status='cancelled' + groupbuys.current_quantity -1 + 티어 soldCount -1.
   *  - 본인 소유 + status='pledged' 일 때만(아니면 null → 409). 멱등(이미 취소면 0행).
   */
  async cancelPledgedByUser(id: string, userId: string, reason: string | null): Promise<RewardOrder | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sel = await client.query(
        `SELECT * FROM reward_orders WHERE id = $1 AND user_id = $2 AND status = 'pledged' FOR UPDATE`,
        [id, userId],
      );
      if (sel.rows.length === 0) { await client.query('ROLLBACK'); return null; }
      const order = mapRow(sel.rows[0]);
      // 펀드 행 잠금 + 상태 확인 — 마감(성공/실패)으로 더이상 'open' 이 아니면 자유취소 불가(성공 확정 후 결제 회피·달성금액 사후감소 방지). null → 409.
      const gb = await client.query(`SELECT status, deadline FROM groupbuys WHERE id = $1 FOR UPDATE`, [order.fundId]);
      // status='open' AND 마감 전만(스케줄러 60s 갭 동안 마감펀드 사후 변경 차단 — createWithStockGuard 와 대칭).
      const gbExpired = !!gb.rows[0]?.deadline && new Date(gb.rows[0].deadline as string).getTime() <= Date.now();
      if (gb.rows[0]?.status !== 'open' || gbExpired) { await client.query('ROLLBACK'); return null; }
      // 사용자 자기취소(pledged): 수량 -1 + 달성 금액 캐시 -= amount(031).
      await client.query(
        `UPDATE groupbuys SET current_quantity = GREATEST(0, current_quantity - 1), current_amount = GREATEST(0, current_amount - $2), updated_at = NOW() WHERE id = $1`,
        [order.fundId, order.amount],
      );
      await bumpTierSoldCount(client, order.fundId, order.rewardTierId, -1);
      const upd = await client.query(
        `UPDATE reward_orders SET status = 'cancelled', cancel_reason = $2, cancel_requested_at = NOW() WHERE id = $1 RETURNING *`,
        [id, reason],
      );
      await client.query('COMMIT');
      return mapRow(upd.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 펀딩(리워드) 변경 — 본인 소유 + status='pledged' 주문의 리워드 티어만 교체(텀블벅식: 마감 전 변경).
   *  - 원자 트랜잭션: 펀드 행 FOR UPDATE 잠금 → 티어별 soldCount 이전 -1·새 +1 조정 + reward_tier_id/reward_title/amount 갱신.
   *  - 수량(current_quantity)은 1개 그대로(티어만 변경)라 불변.
   *  - 새 티어 재고(stockLimit) 초과면 SOLD_OUT. 같은 티어로의 변경은 그대로 통과(soldCount 순증감 0).
   *  - 본인 소유 아님/주문 없음 → NOT_FOUND(0행, IDOR 비노출). status!='pledged' → INVALID_STATE.
   * 반환: { ok:true, order } | { ok:false, code:'NOT_FOUND'|'INVALID_STATE'|'SOLD_OUT' }
   */
  async changeReward(
    orderId: string,
    userId: string,
    newTierId: string,
    newTitle: string,
    newAmount: number,
    oldTierId: string,
    newStockLimit: number | null,
  ): Promise<
    | { ok: true; order: RewardOrder }
    | { ok: false; code: 'NOT_FOUND' | 'INVALID_STATE' | 'SOLD_OUT' }
  > {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // 본인 소유 주문 잠금 — 없으면 NOT_FOUND(소유자 아님 포함, 존재 여부 비노출).
      const sel = await client.query(
        'SELECT * FROM reward_orders WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [orderId, userId],
      );
      if (sel.rows.length === 0) { await client.query('ROLLBACK'); return { ok: false, code: 'NOT_FOUND' }; }
      const order = mapRow(sel.rows[0]);
      // 예약(pledged) 상태에서만 변경 가능 — 결제완료 후엔 취소 후 재참여로 안내.
      if (order.status !== 'pledged') { await client.query('ROLLBACK'); return { ok: false, code: 'INVALID_STATE' }; }

      // 펀드 행 잠금 + 상태/마감 확인 — 마감 후('open' 아님 OR 마감일 경과)엔 변경 불가(성공 확정 후 하향 회피 방지, 스케줄러 60s 갭 포함).
      const gb = await client.query('SELECT status, deadline FROM groupbuys WHERE id = $1 FOR UPDATE', [order.fundId]);
      const chExpired = !!gb.rows[0]?.deadline && new Date(gb.rows[0].deadline as string).getTime() <= Date.now();
      if (gb.rows[0]?.status !== 'open' || chExpired) { await client.query('ROLLBACK'); return { ok: false, code: 'INVALID_STATE' }; }

      const sameTier = oldTierId === newTierId;
      if (!sameTier && newStockLimit != null) {
        // 새 티어 재고 확인 — 현재 새 티어를 점유한 활성 주문 수가 한도 미만이어야 함.
        const cnt = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM reward_orders
            WHERE fund_id = $1 AND reward_tier_id = $2 AND status IN (${ACTIVE_STATUS_SQL})`,
          [order.fundId, newTierId],
        );
        const taken = Number(cnt.rows[0]?.cnt) || 0;
        if (taken >= newStockLimit) { await client.query('ROLLBACK'); return { ok: false, code: 'SOLD_OUT' }; }
      }

      // 티어별 soldCount 조정 — 이전 티어 -1, 새 티어 +1 (같은 티어면 둘 다 스킵).
      if (!sameTier) {
        await bumpTierSoldCount(client, order.fundId, oldTierId, -1);
        await bumpTierSoldCount(client, order.fundId, newTierId, +1);
      }

      // 리워드 변경: 수량(참여 인원)은 1 그대로지만 후원 금액이 바뀌므로 달성 금액 캐시를 차액만큼 조정(031).
      //   delta = newAmount - oldAmount. 음수면 감소(GREATEST 로 0 미만 방지).
      const amountDelta = newAmount - order.amount;
      if (amountDelta !== 0) {
        await client.query(
          `UPDATE groupbuys SET current_amount = GREATEST(0, current_amount + $2), updated_at = NOW() WHERE id = $1`,
          [order.fundId, amountDelta],
        );
      }

      const upd = await client.query(
        `UPDATE reward_orders
            SET reward_tier_id = $2, reward_title = $3, amount = $4
          WHERE id = $1 AND status = 'pledged'
          RETURNING *`,
        [orderId, newTierId, newTitle, newAmount],
      );
      // status='pledged' 가드 재확인 — 위 SELECT…FOR UPDATE 이후라 사실상 항상 1행.
      if (upd.rows.length === 0) { await client.query('ROLLBACK'); return { ok: false, code: 'INVALID_STATE' }; }
      await client.query('COMMIT');
      return { ok: true, order: mapRow(upd.rows[0]) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
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
    // 실결제 건(confirmed_at[구 무통장] 또는 paid_at[모의결제] 있음)만 환불 표시 대상.
    const res = await this.pool.query(
      `UPDATE reward_orders
          SET refunded_at = COALESCE(refunded_at, NOW())
        WHERE id = $1 AND (confirmed_at IS NOT NULL OR paid_at IS NOT NULL)
          AND status IN ('confirmed','paid','cancel_requested')
        RETURNING *`,
      [id],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  /**
   * 관리자 최종 취소(#4) — 원자 트랜잭션:
   *  - 실결제 건(confirmed_at[구 무통장] 또는 paid_at[모의결제] 있음): 아직 환불표시 안 됐으면 'REFUND_REQUIRED'
   *    반환(취소 거부). 환불표시 됐으면 status='refunded' + groupbuys.current_quantity 1 감소 + 티어 soldCount 감소.
   *  - 미결제(awaiting_deposit/cancel_requested 인데 결제기록 없음): 환불 없이 status='cancelled'.
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
      // 취소 가능 상태: awaiting_deposit / confirmed / paid / cancel_requested.
      if (!['awaiting_deposit', 'confirmed', 'paid', 'cancel_requested'].includes(current.status)) {
        await client.query('ROLLBACK');
        return { ok: false, code: 'INVALID_STATE' };
      }

      // 실결제 여부 — 구 무통장(confirmed_at) 또는 모의결제(paid_at) 흔적이 있으면 환불 필요.
      const wasConfirmed = current.confirmedAt != null || current.paidAt != null;
      if (wasConfirmed) {
        // 실결제 건은 환불표시(refunded_at) 선행 필수.
        if (current.refundedAt == null) { await client.query('ROLLBACK'); return { ok: false, code: 'REFUND_REQUIRED' }; }
        // 재고/수량/달성금액 되돌리기 — 예약/입금확인 시 +1·+amount 의 역연산(031).
        await client.query('SELECT 1 FROM groupbuys WHERE id = $1 FOR UPDATE', [current.fundId]);
        await client.query(
          `UPDATE groupbuys SET current_quantity = GREATEST(0, current_quantity - 1), current_amount = GREATEST(0, current_amount - $2), updated_at = NOW() WHERE id = $1`,
          [current.fundId, current.amount],
        );
        await bumpTierSoldCount(client, current.fundId, current.rewardTierId, -1);
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

  // ─────────────────────────────────────────────────────────────────────────
  // 텀블벅식 마감 처리 + 모의결제 잡 지원(030). 모두 멱등(매 tick 재실행 안전).
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 무통장입금 모델: 마감 성공한 펀드의 pledged 주문 → 'awaiting_deposit'(입금 대기).
   * 반환: 각 주문의 {id, userId, amount} — 후원자별 입금 안내(계좌·금액) 알림용. 멱등(pledged 만 대상).
   */
  async markPledgedAwaitingDeposit(fundId: string): Promise<Array<{ id: string; userId: string; amount: number }>> {
    const res = await this.pool.query(
      `UPDATE reward_orders SET status = 'awaiting_deposit'
        WHERE fund_id = $1 AND status = 'pledged'
        RETURNING id, user_id, amount`,
      [fundId],
    );
    return res.rows.map((r) => ({ id: r.id as string, userId: r.user_id as string, amount: Number(r.amount) || 0 }));
  }

  /**
   * 마감 실패한 펀드의 pledged 주문들 → 'cancelled'(예약 해제, 청구 없음).
   * 캠페인 종료라 current_quantity 복원은 불필요(스펙) — 펀드가 failed 로 전이돼 더는 집계에 쓰이지 않음.
   * 반환: 취소된 후원자 user_id 목록(알림 대상). 멱등(pledged 만 대상).
   */
  async cancelPledgedForFund(fundId: string): Promise<string[]> {
    const res = await this.pool.query(
      `UPDATE reward_orders SET status = 'cancelled', cancel_requested_at = NOW()
        WHERE fund_id = $1 AND status = 'pledged'
        RETURNING user_id`,
      [fundId],
    );
    return res.rows.map((r) => r.user_id as string);
  }

  /**
   * 결제 도래 주문 조회 — status IN ('pledged','payment_failed') AND next_charge_at <= now.
   * 순차 처리를 위해 next_charge_at 오름차순, limit 개. (payment_failed 도 재시도 도래 시 포함.)
   */
  async findDueCharges(now: Date, limit: number): Promise<RewardOrder[]> {
    const res = await this.pool.query(
      `SELECT * FROM reward_orders
        WHERE status IN ('pledged','payment_failed')
          AND next_charge_at IS NOT NULL AND next_charge_at <= $1
        ORDER BY next_charge_at ASC
        LIMIT $2`,
      [now, limit],
    );
    return res.rows.map(mapRow);
  }

  /**
   * 모의결제 성공 — pledged/payment_failed → paid, paid_at=NOW(), next_charge_at=NULL(재시도 종료).
   * 이미 paid/cancelled 등이면 0행(멱등). 반환: 갱신된 주문 또는 null.
   */
  async markPaid(id: string): Promise<RewardOrder | null> {
    const res = await this.pool.query(
      `UPDATE reward_orders
          SET status = 'paid', paid_at = NOW(), next_charge_at = NULL, fail_reason = NULL
        WHERE id = $1 AND status IN ('pledged','payment_failed')
        RETURNING *`,
      [id],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  /**
   * 모의결제 실패 — charge_attempts+1, status='payment_failed', fail_reason 기록,
   * next_charge_at=다음 재시도 시각(보통 now+1일). pledged/payment_failed 에서만.
   * 반환: 갱신된 주문(증가된 charge_attempts 포함) 또는 null(대상 아님).
   */
  async markPaymentFailed(id: string, reason: string, nextChargeAt: Date): Promise<RewardOrder | null> {
    const res = await this.pool.query(
      `UPDATE reward_orders
          SET status = 'payment_failed',
              charge_attempts = charge_attempts + 1,
              fail_reason = $2,
              next_charge_at = $3
        WHERE id = $1 AND status IN ('pledged','payment_failed')
        RETURNING *`,
      [id, reason.slice(0, 500), nextChargeAt],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  /**
   * 결제 3진아웃 자동취소 — payment_failed 주문 → 'cancelled' + current_quantity/soldCount -1.
   * 원자 트랜잭션. 이미 취소/결제됐으면 null(멱등).
   * 반환: { order, userId } 또는 null.
   */
  async autoCancelFailedCharge(id: string): Promise<RewardOrder | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sel = await client.query(
        `SELECT * FROM reward_orders WHERE id = $1 AND status = 'payment_failed' FOR UPDATE`,
        [id],
      );
      if (sel.rows.length === 0) { await client.query('ROLLBACK'); return null; }
      const order = mapRow(sel.rows[0]);
      await client.query('SELECT 1 FROM groupbuys WHERE id = $1 FOR UPDATE', [order.fundId]);
      // 결제 3진아웃 자동취소: 수량 -1 + 달성 금액 캐시 -= amount(031).
      await client.query(
        `UPDATE groupbuys SET current_quantity = GREATEST(0, current_quantity - 1), current_amount = GREATEST(0, current_amount - $2), updated_at = NOW() WHERE id = $1`,
        [order.fundId, order.amount],
      );
      await bumpTierSoldCount(client, order.fundId, order.rewardTierId, -1);
      const upd = await client.query(
        `UPDATE reward_orders SET status = 'cancelled', next_charge_at = NULL, cancel_requested_at = NOW() WHERE id = $1 RETURNING *`,
        [id],
      );
      await client.query('COMMIT');
      return mapRow(upd.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

}
