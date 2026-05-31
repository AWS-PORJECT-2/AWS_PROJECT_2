import type { Pool, PoolClient } from 'pg';
import { logger } from '../logger.js';

export interface DistributedLock {
  release(): Promise<void>;
}

export interface DistributedLockProvider {
  acquire(lockKey: number): Promise<DistributedLock | null>;
}

/**
 * PostgreSQL advisory lock 기반 분산 락 구현.
 * pg_try_advisory_lock 을 사용하여 non-blocking 방식으로 락을 획득한다.
 */
export class PgDistributedLockProvider implements DistributedLockProvider {
  constructor(private readonly pool: Pool) {}

  async acquire(lockKey: number): Promise<DistributedLock | null> {
    // pool.connect() 도 try 안에서 처리 — RDS 페일오버·풀 고갈·네트워크 단절 시 reject 가
    // 스케줄러 tick 으로 전파돼 unhandledRejection 으로 프로세스가 죽는 것을 막는다(획득 실패 → null → 이번 tick 건너뜀).
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (err) {
      logger.error({ err, lockKey }, '분산 락 획득 실패(connect)');
      return null;
    }
    try {
      const result = await client.query<{ pg_try_advisory_lock: boolean }>(
        'SELECT pg_try_advisory_lock($1)',
        [lockKey],
      );
      const acquired = result.rows[0]?.pg_try_advisory_lock === true;
      if (!acquired) {
        client.release();
        return null;
      }
      return {
        release: async () => {
          try {
            await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
          } catch (err) {
            logger.error({ err, lockKey }, '분산 락 해제 실패');
          } finally {
            client.release();
          }
        },
      };
    } catch (err) {
      client.release();
      logger.error({ err, lockKey }, '분산 락 획득 실패');
      return null;
    }
  }
}

