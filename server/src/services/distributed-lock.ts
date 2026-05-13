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
    const client: PoolClient = await this.pool.connect();
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


/**
 * 테스트/InMemory용 락 구현.
 */
export class InMemoryLockProvider implements DistributedLockProvider {
  private readonly locks = new Set<number>();

  async acquire(lockKey: number): Promise<DistributedLock | null> {
    if (this.locks.has(lockKey)) return null;
    this.locks.add(lockKey);
    return {
      release: async () => {
        this.locks.delete(lockKey);
      },
    };
  }
}
