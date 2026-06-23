import type { PoolClient } from 'pg';

/**
 * 사용자 포인트 잔액 행(`user_profile.points`) 접근용 리포지토리.
 *
 * 잔액 캐시는 마이그레이션 003 의 `user_profile.points` 컬럼을 재사용한다.
 * 진실의 원천은 `point_transaction` 원장이며, 본 리포지토리는 빠른 조회용 잔액과
 * 차감 직렬화를 위한 행 잠금(FOR UPDATE)을 담당한다.
 *
 * - `ensureAndLock` / `addPoints` 는 반드시 트랜잭션 안에서 호출한다(`client` 주입).
 * - `getPoints` 는 잠금 없는 단순 조회다.
 *
 * 설계 참조: design.md "UserProfileRepository (잔액 행)", "동시성 모델".
 */
export interface UserProfileRepository {
  /**
   * 잔액 행을 보장(없으면 points=0 으로 생성)한 뒤 해당 행을 FOR UPDATE 로 잠그고
   * 현재 잔액을 반환한다. 같은 사용자에 대한 동시 호출은 이 잠금에서 직렬화된다.
   * 요구사항 6.1, 6.4.
   */
  ensureAndLock(userId: string, client: PoolClient): Promise<number>;

  /**
   * 잔액을 delta 만큼 가감(트랜잭션 내에서만 호출)하고 갱신된 잔액을 반환한다.
   * delta 는 적립 시 양수, 차감 시 음수다. 요구사항 6.2.
   */
  addPoints(userId: string, delta: number, client: PoolClient): Promise<number>;

  /** 잔액 단순 조회(잠금 없음). 행이 없으면 0. 요구사항 7.3. */
  getPoints(userId: string): Promise<number>;
}

/**
 * InMemory 트랜잭션 토큰.
 *
 * PostgreSQL 의 `PoolClient` 자리에 주입되는 경량 토큰이다. 트랜잭션 동안 획득한
 * 행 잠금의 해제 콜백을 모아 두었다가, 트랜잭션 종료(커밋/롤백) 시점에 일괄 해제한다.
 * `FOR UPDATE` 잠금이 트랜잭션 종료까지 유지되는 의미를 동일하게 모델링한다.
 *
 * `withInMemoryTransaction` 헬퍼로 생성/정리하는 것을 권장한다.
 */
export class InMemoryTransactionClient {
  /** 트랜잭션 종료 시 호출할 잠금 해제 콜백들. */
  readonly releases: Array<() => void> = [];
  /** 이 트랜잭션이 이미 잠근 사용자 집합(FOR UPDATE 재진입 방지). */
  readonly lockedUsers = new Set<string>();
}

/**
 * InMemory 트랜잭션 경계 헬퍼.
 *
 * 콜백 실행 후(성공/실패 무관) 트랜잭션 동안 획득한 모든 행 잠금을 해제한다.
 * PostgreSQL 의 `BEGIN ... COMMIT/ROLLBACK` 시 잠금이 해제되는 의미를 모델링한다.
 */
export async function withInMemoryTransaction<T>(
  fn: (client: InMemoryTransactionClient) => Promise<T>,
): Promise<T> {
  const client = new InMemoryTransactionClient();
  try {
    return await fn(client);
  } finally {
    // 커밋/롤백 모두에서 이 트랜잭션이 잡은 잠금을 해제한다.
    for (const release of client.releases.splice(0)) {
      release();
    }
  }
}

/**
 * InMemory `UserProfileRepository` 구현.
 *
 * 잔액을 `Map<userId, points>` 로 추적한다. `FOR UPDATE` 직렬화 의미를 사용자별
 * 비동기 뮤텍스(프로미스 체인)로 모델링한다. 따라서 동일 사용자에 대한 동시
 * `ensureAndLock` 호출은 한 번에 하나씩만 진행되고, 앞선 트랜잭션이 종료되어
 * 잠금을 해제할 때까지 다음 트랜잭션은 대기한다(속성 5 검증에 사용).
 *
 * 서로 다른 사용자에 대한 잠금은 서로를 막지 않는다(사용자별 독립 체인).
 */
export class InMemoryUserProfileRepository implements UserProfileRepository {
  private readonly balances = new Map<string, number>();
  /** 사용자별 잠금 체인의 꼬리. 현재 보유자가 잠금을 해제하면 resolve 된다. */
  private readonly lockTails = new Map<string, Promise<void>>();

  async ensureAndLock(userId: string, client: PoolClient): Promise<number> {
    const token = client as unknown as InMemoryTransactionClient;

    // 같은 트랜잭션이 이미 이 사용자를 잠갔다면(FOR UPDATE 재진입) 다시 대기하지 않는다.
    if (token.lockedUsers.has(userId)) {
      return this.balances.get(userId) ?? 0;
    }

    // 사용자별 뮤텍스: 앞선 보유자가 해제할 때까지 대기한 뒤 잠금을 획득한다.
    const previous = this.lockTails.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // 이후 대기자는 우리가 해제(held resolve)할 때까지 기다린다.
    this.lockTails.set(
      userId,
      previous.then(() => held),
    );
    // 우리 차례가 올 때까지 대기(직렬화 지점).
    await previous;

    // 행 보장: 없으면 points=0 으로 생성.
    if (!this.balances.has(userId)) {
      this.balances.set(userId, 0);
    }

    // 잠금 보유 등록 + 트랜잭션 종료 시 해제 예약.
    token.lockedUsers.add(userId);
    token.releases.push(() => {
      token.lockedUsers.delete(userId);
      release();
    });

    return this.balances.get(userId) ?? 0;
  }

  async addPoints(userId: string, delta: number, _client: PoolClient): Promise<number> {
    const current = this.balances.get(userId) ?? 0;
    const next = current + delta;
    this.balances.set(userId, next);
    return next;
  }

  async getPoints(userId: string): Promise<number> {
    return this.balances.get(userId) ?? 0;
  }
}
