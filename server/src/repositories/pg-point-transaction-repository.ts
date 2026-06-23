import type pg from 'pg';
import type { PoolClient } from 'pg';
import type { EarnReason, PointTransaction } from '../types/index.js';
import type { PointTransactionRepository } from './point-transaction-repository.js';

/**
 * PointTransactionRepository 의 PostgreSQL 구현 (마이그레이션 004 `point_transaction`).
 *
 * 멱등성의 1차 방어선은 DB 제약(partial unique index)이다. insert 가 PG
 * unique 위반(`23505`)을 그대로 전파하므로, 서비스 계층은 동시/재시도 상황에서
 * 이를 "이미 지급됨"으로 간주하여 멱등하게 처리할 수 있다.
 */
export class PgPointTransactionRepository implements PointTransactionRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(tx: PointTransaction, client?: PoolClient | null): Promise<PointTransaction> {
    // 트랜잭션 참여를 위해 client 가 주어지면 그 위에서, 아니면 pool 에서 실행한다.
    // unique 위반(`23505`)은 잡지 않고 그대로 전파하여 서비스가 멱등 처리하게 한다.
    const executor = client ?? this.pool;
    const result = await executor.query(
      `INSERT INTO point_transaction (id, user_id, type, reason, amount, balance_after, request_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tx.id,
        tx.userId,
        tx.type,
        tx.reason,
        tx.amount,
        tx.balanceAfter,
        tx.requestId,
        tx.createdAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findByUser(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<PointTransaction[]> {
    const params: unknown[] = [userId];
    let query = `SELECT * FROM point_transaction WHERE user_id = $1 ORDER BY created_at DESC`;

    if (limit !== undefined) {
      params.push(limit);
      query += ` LIMIT $${params.length}`;
    }
    if (offset !== undefined) {
      params.push(offset);
      query += ` OFFSET $${params.length}`;
    }

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  async existsOneTimeEarn(
    userId: string,
    reason: EarnReason,
    client?: PoolClient | null,
  ): Promise<boolean> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `SELECT EXISTS(
         SELECT 1 FROM point_transaction
         WHERE user_id = $1 AND reason = $2 AND type = 'earn'
       ) AS "exists"`,
      [userId, reason],
    );
    return result.rows[0].exists === true;
  }

  async findByRequestId(
    requestId: string,
    client?: PoolClient | null,
  ): Promise<PointTransaction | null> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `SELECT * FROM point_transaction WHERE request_id = $1`,
      [requestId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: Record<string, unknown>): PointTransaction {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      type: row.type as PointTransaction['type'],
      reason: row.reason as PointTransaction['reason'],
      amount: row.amount as number,
      balanceAfter: row.balance_after as number,
      requestId: (row.request_id as string) ?? null,
      createdAt: new Date(row.created_at as string),
    };
  }
}
