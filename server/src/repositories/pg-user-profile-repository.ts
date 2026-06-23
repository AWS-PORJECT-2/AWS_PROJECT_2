import type pg from 'pg';
import type { PoolClient } from 'pg';
import type { UserProfileRepository } from './user-profile-repository.js';

/**
 * PostgreSQL `UserProfileRepository` 구현.
 *
 * 잔액 캐시는 마이그레이션 003 의 `user_profile.points` 컬럼을 재사용한다.
 * 진실의 원천은 `point_transaction` 원장이며, 본 리포지토리는 빠른 조회용 잔액과
 * 차감 직렬화를 위한 행 잠금(`FOR UPDATE`)을 담당한다.
 *
 * - `ensureAndLock` / `addPoints` 는 반드시 트랜잭션 안에서(`client`) 호출한다.
 * - `getPoints` 는 `this.pool` 을 사용하는 잠금 없는 단순 조회다.
 *
 * 설계 참조: design.md "UserProfileRepository (잔액 행)", "동시성 모델".
 */
export class PgUserProfileRepository implements UserProfileRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * 잔액 행을 멱등 생성(`ON CONFLICT DO NOTHING`)한 뒤 `FOR UPDATE` 로 잠그고
   * 현재 잔액을 반환한다. 반드시 트랜잭션(`client`) 안에서 호출해야 잠금이 유지된다.
   * 같은 사용자에 대한 동시 호출은 이 잠금에서 직렬화된다. 요구사항 6.1, 6.4.
   */
  async ensureAndLock(userId: string, client: PoolClient): Promise<number> {
    await client.query(
      `INSERT INTO user_profile (user_id, points) VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const result = await client.query(
      `SELECT points FROM user_profile WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    return result.rows[0].points as number;
  }

  /**
   * 잔액을 delta 만큼 가감(트랜잭션 내에서만 호출)하고 갱신된 잔액을 반환한다.
   * delta 는 적립 시 양수, 차감 시 음수다. 요구사항 6.2, 6.5.
   */
  async addPoints(userId: string, delta: number, client: PoolClient): Promise<number> {
    const result = await client.query(
      `UPDATE user_profile SET points = points + $2, updated_at = NOW()
       WHERE user_id = $1
       RETURNING points`,
      [userId, delta],
    );
    return result.rows[0].points as number;
  }

  /** 잔액 단순 조회(잠금 없음). 행이 없으면 0. 요구사항 7.3. */
  async getPoints(userId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT points FROM user_profile WHERE user_id = $1`,
      [userId],
    );
    if (result.rows.length === 0) return 0;
    return result.rows[0].points as number;
  }
}
