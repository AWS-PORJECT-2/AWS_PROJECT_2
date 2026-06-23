import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type {
  EarnReason, PointTransaction, PointType, SpendReason, TransactionReason,
} from '../types/index.js';
import { EARN_AMOUNTS } from '../types/index.js';
import type {
  AdminAdjustResult, EarnResult, PointRepository, RefundResult, SpendResult,
} from './point-repository.js';

// 사용자 행 잠금 — 잔액 변동 트랜잭션의 첫 단계. points 캐시를 진실 원장과 함께 직렬화한다.
const LOCK_USER = 'SELECT points FROM "user" WHERE id = $1 FOR UPDATE';

function mapRow(row: Record<string, unknown>): PointTransaction {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as PointType,
    reason: row.reason as TransactionReason,
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    requestId: (row.request_id as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * 포인트 저장소 PostgreSQL 구현. (045_point_system)
 * 모든 잔액 변동은 pool.connect()+BEGIN → `SELECT points FOR UPDATE` 로 사용자 행을 잠근 뒤
 *   point_transaction INSERT 와 "user".points UPDATE 를 한 트랜잭션에서 수행하고 COMMIT 한다.
 *   원장이 진실 공급원, "user".points 는 같은 트랜잭션에서 갱신되는 캐시.
 */
export class PgPointRepository implements PointRepository {
  constructor(private readonly pool: pg.Pool) {}

  async earnOnce(userId: string, reason: EarnReason): Promise<EarnResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(LOCK_USER, [userId]);
      const current = Number(locked.rows[0]?.points ?? 0);

      // 이미 동일 사유의 1회성 적립이 있으면 멱등 — 변동 없이 현재 잔액 반환.
      const existing = await client.query(
        `SELECT 1 FROM point_transaction WHERE user_id = $1 AND reason = $2 AND type = 'earn' LIMIT 1`,
        [userId, reason],
      );
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        return { balanceAfter: current, created: false };
      }

      const amount = EARN_AMOUNTS[reason];
      const newBalance = current + amount;
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO point_transaction (id, user_id, type, reason, amount, balance_after)
         VALUES ($1, $2, 'earn', $3, $4, $5)
         RETURNING id, user_id, type, reason, amount, balance_after, request_id, created_at`,
        [id, userId, reason, amount, newBalance],
      );
      await client.query('UPDATE "user" SET points = $1 WHERE id = $2', [newBalance, userId]);
      await client.query('COMMIT');
      return { balanceAfter: newBalance, created: true, transaction: mapRow(inserted.rows[0]) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      // 부분 유니크 인덱스(uq_point_tx_one_time_earn) 충돌 → 동시 요청이 먼저 적립함. 이미 적립으로 처리.
      if (isUniqueViolation(err)) {
        return { balanceAfter: await this.getBalance(userId), created: false };
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async spend(userId: string, reason: SpendReason, cost: number, requestId?: string): Promise<SpendResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(LOCK_USER, [userId]);
      const current = Number(locked.rows[0]?.points ?? 0);

      // requestId 멱등 — 동일 요청이 이미 처리됐으면 그때의 잔액/거래를 그대로 반환(중복 차감 방지).
      if (requestId) {
        const dup = await client.query(
          `SELECT id, user_id, type, reason, amount, balance_after, request_id, created_at
             FROM point_transaction WHERE request_id = $1 LIMIT 1`,
          [requestId],
        );
        if (dup.rows.length > 0) {
          await client.query('COMMIT');
          const tx = mapRow(dup.rows[0]);
          return { ok: true, balanceAfter: tx.balanceAfter, transaction: tx, created: false };
        }
      }

      // 잔액 부족 — 변동 없이 거부.
      if (current < cost) {
        await client.query('COMMIT');
        return { ok: false, balanceAfter: current };
      }

      const newBalance = current - cost;
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO point_transaction (id, user_id, type, reason, amount, balance_after, request_id)
         VALUES ($1, $2, 'spend', $3, $4, $5, $6)
         RETURNING id, user_id, type, reason, amount, balance_after, request_id, created_at`,
        [id, userId, reason, cost, newBalance, requestId ?? null],
      );
      await client.query('UPDATE "user" SET points = $1 WHERE id = $2', [newBalance, userId]);
      await client.query('COMMIT');
      return { ok: true, balanceAfter: newBalance, transaction: mapRow(inserted.rows[0]), created: true };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      // request_id 유니크 충돌 → 동시 요청이 먼저 차감함. 그 거래를 다시 읽어 멱등 반환.
      if (isUniqueViolation(err) && requestId) {
        const tx = await this.findByRequestId(requestId);
        if (tx) return { ok: true, balanceAfter: tx.balanceAfter, transaction: tx, created: false };
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async refund(userId: string, reason: SpendReason, amount: number): Promise<RefundResult> {
    const refundReason: TransactionReason = reason === 'ai_blueprint' ? 'refund_ai_blueprint' : 'refund_ai_tryon';
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(LOCK_USER, [userId]);
      const current = Number(locked.rows[0]?.points ?? 0);
      const newBalance = current + amount;
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO point_transaction (id, user_id, type, reason, amount, balance_after)
         VALUES ($1, $2, 'earn', $3, $4, $5)
         RETURNING id, user_id, type, reason, amount, balance_after, request_id, created_at`,
        [id, userId, refundReason, amount, newBalance],
      );
      await client.query('UPDATE "user" SET points = $1 WHERE id = $2', [newBalance, userId]);
      await client.query('COMMIT');
      return { balanceAfter: newBalance, transaction: mapRow(inserted.rows[0]) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async adminAdjust(userId: string, delta: number): Promise<AdminAdjustResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(LOCK_USER, [userId]);
      const current = Number(locked.rows[0]?.points ?? 0);

      if (delta === 0) {
        await client.query('COMMIT');
        return { ok: true, balanceAfter: current };
      }

      const newBalance = current + delta;
      if (newBalance < 0) {
        await client.query('COMMIT');
        return { ok: false, balanceAfter: current };
      }

      const type: PointType = delta > 0 ? 'earn' : 'spend';
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO point_transaction (id, user_id, type, reason, amount, balance_after)
         VALUES ($1, $2, $3, 'admin_adjust', $4, $5)
         RETURNING id, user_id, type, reason, amount, balance_after, request_id, created_at`,
        [id, userId, type, Math.abs(delta), newBalance],
      );
      await client.query('UPDATE "user" SET points = $1 WHERE id = $2', [newBalance, userId]);
      await client.query('COMMIT');
      return { ok: true, balanceAfter: newBalance, transaction: mapRow(inserted.rows[0]) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async adminSetBalance(userId: string, target: number): Promise<AdminAdjustResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(LOCK_USER, [userId]);
      const current = Number(locked.rows[0]?.points ?? 0);
      const delta = target - current;

      if (delta === 0) {
        await client.query('COMMIT');
        return { ok: true, balanceAfter: current };
      }

      const type: PointType = delta > 0 ? 'earn' : 'spend';
      const id = randomUUID();
      // target>=0 보장 → balance_after 음수 불가. amount 는 변동분 절댓값.
      const inserted = await client.query(
        `INSERT INTO point_transaction (id, user_id, type, reason, amount, balance_after)
         VALUES ($1, $2, $3, 'admin_adjust', $4, $5)
         RETURNING id, user_id, type, reason, amount, balance_after, request_id, created_at`,
        [id, userId, type, Math.abs(delta), target],
      );
      await client.query('UPDATE "user" SET points = $1 WHERE id = $2', [target, userId]);
      await client.query('COMMIT');
      return { ok: true, balanceAfter: target, transaction: mapRow(inserted.rows[0]) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async getBalance(userId: string): Promise<number> {
    const res = await this.pool.query('SELECT points FROM "user" WHERE id = $1', [userId]);
    return Number(res.rows[0]?.points ?? 0);
  }

  async getTransactions(userId: string, limit: number, offset: number): Promise<PointTransaction[]> {
    const res = await this.pool.query(
      `SELECT id, user_id, type, reason, amount, balance_after, request_id, created_at
         FROM point_transaction
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return res.rows.map(mapRow);
  }

  // request_id 로 단건 조회(멱등 충돌 복구용). 트랜잭션 밖에서 호출.
  private async findByRequestId(requestId: string): Promise<PointTransaction | null> {
    const res = await this.pool.query(
      `SELECT id, user_id, type, reason, amount, balance_after, request_id, created_at
         FROM point_transaction WHERE request_id = $1 LIMIT 1`,
      [requestId],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }
}

// PostgreSQL unique_violation(23505) 판별 — 멱등 처리 분기에 사용.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
