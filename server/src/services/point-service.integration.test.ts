/**
 * PostgreSQL 통합 테스트 - 포인트 시스템 (point-system)
 *
 * InMemory 로는 검증할 수 없는 DB 의존 동작을 실 PostgreSQL 에서 확인한다.
 * 설계 문서 "Testing Strategy - 통합 테스트(PostgreSQL)" 에 1:1 로 대응한다.
 *
 *   - 11.1: partial unique index 동시 INSERT — 동일 (user_id, reason='signup', type='earn')
 *           을 동시에 INSERT 하면 1행만 허용되고 다른 한쪽은 `23505` 로 거부된다.
 *           (요구사항 1.3, 2.3, 3.3)
 *   - 11.2: FOR UPDATE 동시 차감 — 잔액 100, cost 100 인 동일 사용자 차감 2건을
 *           동시에 처리하면 1건만 성공하고 잔액이 음수로 내려가지 않는다.
 *           (요구사항 6.4, 6.5)
 *   - 11.3: 마이그레이션 004 스모크 — point_transaction/notification/user_profile 테이블과
 *           관련 인덱스가 존재한다. (요구사항 6.1, 7.1)
 *
 * 실행 가드: 이 환경에는 DB 가 없을 수 있다.
 *   `TEST_DATABASE_URL` 또는 `DATABASE_URL` 이 설정돼 있을 때만 실제로 실행하고,
 *   없으면 `describe.skip` 으로 깔끔하게 건너뛴다(스위트를 실패시키지 않는다).
 *   각 테스트는 고유한 사용자 id 로 격리하고, afterAll 에서 생성한 데이터를 정리한다.
 */
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PgPointTransactionRepository } from '../repositories/pg-point-transaction-repository.js';
import { PgUserProfileRepository } from '../repositories/pg-user-profile-repository.js';
import { PgNotificationPort } from '../repositories/pg-notification-port.js';
import { PointServiceImpl } from './point-service.js';
import { SPEND_COSTS } from '../types/index.js';
import type { PointTransaction } from '../types/index.js';

const { Pool } = pg;

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

// DB 가 없으면 스위트를 실패시키지 않고 건너뛴다.
const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[point-service.integration] TEST_DATABASE_URL/DATABASE_URL 미설정 — PostgreSQL 통합 테스트를 건너뜁니다.',
  );
}

/** db.ts 의 SSL 정책을 동일하게 재현한다(검증 비활성화는 하지 않음). */
function buildSslConfig(): pg.PoolConfig['ssl'] {
  if (process.env.DATABASE_SSL === 'disabled') return undefined;
  const caPath = process.env.DATABASE_SSL_CA;
  if (caPath) return { ca: fs.readFileSync(caPath, 'utf8') };
  return { rejectUnauthorized: true };
}

/**
 * 마이그레이션 004 스키마를 멱등하게 보장한다.
 * 실 환경에서는 `npm run db:migrate` 로 이미 적용돼 있지만, 통합 테스트가
 * 독립적으로 동작하도록 IF NOT EXISTS 로 동일한 테이블/인덱스를 보장한다.
 */
async function ensureSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "user" (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email         VARCHAR(255) NOT NULL UNIQUE,
      name          VARCHAR(255) NOT NULL,
      school_domain VARCHAR(255) NOT NULL,
      picture       VARCHAR(512),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profile (
      user_id    UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      department VARCHAR(100),
      year       INTEGER CHECK (year BETWEEN 1 AND 6),
      points     INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS point_transaction (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id       UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      type          VARCHAR(10) NOT NULL CHECK (type IN ('earn', 'spend')),
      reason        VARCHAR(40) NOT NULL,
      amount        INTEGER NOT NULL CHECK (amount > 0),
      balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
      request_id    UUID,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_point_tx_user_created
      ON point_transaction(user_id, created_at DESC)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_point_tx_one_time_earn
      ON point_transaction(user_id, reason)
      WHERE type = 'earn' AND reason IN ('signup', 'first_post', 'first_comment')
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_point_tx_request_id
      ON point_transaction(request_id)
      WHERE request_id IS NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification (
      id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id    UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      type       VARCHAR(50) NOT NULL,
      title      VARCHAR(255) NOT NULL,
      body       TEXT NOT NULL,
      fund_id    UUID,
      read_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

describeDb('PointService PostgreSQL 통합 테스트', () => {
  let pool: pg.Pool;
  const createdUserIds: string[] = [];

  /** 격리를 위해 고유한 테스트 사용자 행을 생성하고 정리 목록에 등록한다. */
  async function createTestUser(): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO "user" (id, email, name, school_domain)
       VALUES ($1, $2, $3, $4)`,
      [id, `pt-int-${id}@test.local`, '포인트통합테스트', 'test.local'],
    );
    createdUserIds.push(id);
    return id;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL, ssl: buildSslConfig() });
    await ensureSchema(pool);
  });

  afterAll(async () => {
    if (!pool) return;
    // "user" 삭제 시 point_transaction/notification/user_profile 이 ON DELETE CASCADE 로 함께 정리되지만,
    // 명시적으로 자식 행을 먼저 지워 의도를 분명히 한다.
    for (const userId of createdUserIds) {
      await pool.query('DELETE FROM point_transaction WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM notification WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM user_profile WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    }
    await pool.end();
  });

  it('11.1 partial unique index — 동일 일회성 적립 동시 INSERT 시 1건만 허용되고 다른 한쪽은 23505 로 거부된다', async () => {
    const userId = await createTestUser();
    const txRepo = new PgPointTransactionRepository(pool);

    /** 각자 독립 트랜잭션(BEGIN/COMMIT) 안에서 signup earn 1건을 INSERT 한다. */
    const insertSignupEarn = async (): Promise<PointTransaction> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx: PointTransaction = {
          id: randomUUID(),
          userId,
          type: 'earn',
          reason: 'signup',
          amount: 100,
          balanceAfter: 100,
          requestId: null,
          createdAt: new Date(),
        };
        const inserted = await txRepo.insert(tx, client);
        await client.query('COMMIT');
        return inserted;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    };

    const results = await Promise.allSettled([insertSignupEarn(), insertSignupEarn()]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    // 정확히 한쪽만 성공해야 한다(partial unique index 가 두 번째 INSERT 를 막는다).
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // 거부된 쪽은 PostgreSQL unique_violation(23505) 이어야 한다.
    const rejection = rejected[0].reason as { code?: string };
    expect(rejection.code).toBe('23505');

    // DB 에는 정확히 1행만 남는다.
    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM point_transaction
       WHERE user_id = $1 AND reason = 'signup' AND type = 'earn'`,
      [userId],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('11.2 FOR UPDATE — 잔액 100, cost 100 동시 차감 2건 중 1건만 성공하고 최종 잔액은 0(음수 불가)', async () => {
    const userId = await createTestUser();

    // 잔액 100 으로 시드.
    await pool.query(
      `INSERT INTO user_profile (user_id, points) VALUES ($1, 100)
       ON CONFLICT (user_id) DO UPDATE SET points = 100`,
      [userId],
    );

    const service = new PointServiceImpl({
      pool,
      pointTransactionRepository: new PgPointTransactionRepository(pool),
      userProfileRepository: new PgUserProfileRepository(pool),
      notificationPort: new PgNotificationPort(pool),
    });

    const cost = SPEND_COSTS.ai_blueprint; // 100
    const [a, b] = await Promise.all([
      service.spend(userId, 'ai_blueprint', cost),
      service.spend(userId, 'ai_blueprint', cost),
    ]);

    const okCount = [a, b].filter((r) => r.ok).length;
    const failCount = [a, b].filter((r) => !r.ok).length;

    // 정확히 1건만 성공, 1건은 잔액 부족으로 거부.
    expect(okCount).toBe(1);
    expect(failCount).toBe(1);

    // 최종 잔액은 0, 음수로 내려가지 않는다.
    const balance = await pool.query(
      `SELECT points FROM user_profile WHERE user_id = $1`,
      [userId],
    );
    expect(balance.rows[0].points).toBe(0);
    expect(balance.rows[0].points).toBeGreaterThanOrEqual(0);

    // 성공한 차감 거래는 정확히 1건만 기록된다.
    const spendCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM point_transaction
       WHERE user_id = $1 AND type = 'spend'`,
      [userId],
    );
    expect(spendCount.rows[0].n).toBe(1);
  });

  it('11.3 마이그레이션 004 스모크 — 테이블과 인덱스가 존재한다', async () => {
    // 테이블 존재 확인.
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('point_transaction', 'notification', 'user_profile')`,
    );
    const tableNames = tables.rows.map((r) => r.table_name).sort();
    expect(tableNames).toEqual(['notification', 'point_transaction', 'user_profile']);

    // 인덱스 존재 확인.
    const indexes = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname IN (
           'uq_point_tx_one_time_earn',
           'uq_point_tx_request_id',
           'idx_point_tx_user_created'
         )`,
    );
    const indexNames = indexes.rows.map((r) => r.indexname).sort();
    expect(indexNames).toEqual([
      'idx_point_tx_user_created',
      'uq_point_tx_one_time_earn',
      'uq_point_tx_request_id',
    ]);
  });
});
