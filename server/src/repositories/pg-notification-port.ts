import type pg from 'pg';
import type { NotificationPort, PointNotificationInput } from './notification-port.js';

/**
 * PostgreSQL `notification` 테이블(마이그레이션 004)에 포인트 변동 알림을 기록하는
 * NotificationPort 구현.
 *
 * 적립·소모 거래와 동일한 DB 트랜잭션에 참여할 수 있도록 `client` 를 주입받으며,
 * 주어지지 않으면 풀에서 단독 실행한다(`client ?? this.pool`).
 * 포인트 알림은 펀드와 무관하므로 `fund_id = NULL` 로 기록된다(컬럼 기본값 사용).
 * (요구사항 1.4, 2.4, 3.4, 4.6, 5.6)
 */
export class PgNotificationPort implements NotificationPort {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: PointNotificationInput, client?: pg.PoolClient | null): Promise<void> {
    const executor = client ?? this.pool;
    await executor.query(
      `INSERT INTO notification (user_id, type, title, body)
       VALUES ($1, $2, $3, $4)`,
      [input.userId, input.type, input.title, input.body],
    );
  }
}
