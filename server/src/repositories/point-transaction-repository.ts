import type { PoolClient } from 'pg';
import type { PointTransaction, EarnReason } from '../types/index.js';

/**
 * 포인트 원장(추가 전용) 리포지토리.
 * 멱등성의 1차 방어선은 DB 제약(partial unique index)이며,
 * existsOneTimeEarn / findByRequestId 는 사전 확인(빠른 경로)용이다.
 */
export interface PointTransactionRepository {
  /** 거래 추가(추가 전용). 트랜잭션 참여를 위해 client 주입 가능. */
  insert(tx: PointTransaction, client?: PoolClient | null): Promise<PointTransaction>;

  /** 사용자별 거래 내역 최신순. 요구사항 7.1. */
  findByUser(userId: string, limit?: number, offset?: number): Promise<PointTransaction[]>;

  /** 일회성 적립이 이미 존재하는지 확인(멱등 판단 보조). */
  existsOneTimeEarn(
    userId: string,
    reason: EarnReason,
    client?: PoolClient | null,
  ): Promise<boolean>;

  /** requestId 로 기존 차감 거래 조회(멱등 판단 보조). */
  findByRequestId(
    requestId: string,
    client?: PoolClient | null,
  ): Promise<PointTransaction | null>;
}

// partial unique index `uq_point_tx_one_time_earn` 가 적용되는 일회성 적립 사유.
// (마이그레이션 004: type='earn' AND reason IN ('signup','first_post','first_comment'))
const ONE_TIME_EARN_REASONS: readonly EarnReason[] = [
  'signup',
  'first_post',
  'first_comment',
];

/** PostgreSQL unique_violation 에러 코드. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * PG 의 unique_violation(`23505`)을 모방하는 에러.
 * InMemory 구현이 partial unique index 의 의미를 동일하게 재현하여,
 * 서비스 계층이 PostgreSQL 구현과 동일하게 멱등 처리를 할 수 있게 한다.
 */
export class UniqueViolationError extends Error {
  readonly code = PG_UNIQUE_VIOLATION;
  readonly constraint: string;

  constructor(constraint: string, detail: string) {
    super(`duplicate key value violates unique constraint "${constraint}": ${detail}`);
    this.name = 'UniqueViolationError';
    this.constraint = constraint;
  }
}

/**
 * PointTransactionRepository 의 인메모리 구현.
 * partial unique index(멱등) 의미를 동일하게 모델링한다:
 *  - 동일 (userId, reason) 의 일회성 적립(earn) 중복 거부
 *  - 동일 requestId 중복 거부
 * 두 경우 모두 PG unique 위반(`23505`)을 모방한 UniqueViolationError 를 던진다.
 *
 * 속성 기반 테스트(PBT)와 InMemory 모드 검증에서 DB 없이 비즈니스 규칙을 확인하는 데 사용한다.
 */
export class InMemoryPointTransactionRepository implements PointTransactionRepository {
  // 삽입 순서를 보존하는 원장. (createdAt 동률 시 정렬 안정성 확보에 사용)
  private readonly transactions: PointTransaction[] = [];

  async insert(tx: PointTransaction, _client?: PoolClient | null): Promise<PointTransaction> {
    // 일회성 적립 멱등성: uq_point_tx_one_time_earn 모방
    if (tx.type === 'earn' && ONE_TIME_EARN_REASONS.includes(tx.reason as EarnReason)) {
      const exists = this.transactions.some(
        (t) => t.type === 'earn' && t.userId === tx.userId && t.reason === tx.reason,
      );
      if (exists) {
        throw new UniqueViolationError(
          'uq_point_tx_one_time_earn',
          `(user_id, reason)=(${tx.userId}, ${tx.reason}) already exists.`,
        );
      }
    }

    // 소모 멱등성: uq_point_tx_request_id 모방
    if (tx.requestId !== null && tx.requestId !== undefined) {
      const exists = this.transactions.some((t) => t.requestId === tx.requestId);
      if (exists) {
        throw new UniqueViolationError(
          'uq_point_tx_request_id',
          `(request_id)=(${tx.requestId}) already exists.`,
        );
      }
    }

    // 방어적 복사로 외부 변형으로부터 원장을 보호한다.
    const stored: PointTransaction = { ...tx };
    this.transactions.push(stored);
    return { ...stored };
  }

  async findByUser(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<PointTransaction[]> {
    const owned = this.transactions
      .map((tx, index) => ({ tx, index }))
      .filter((entry) => entry.tx.userId === userId);

    // 최신순(created_at DESC). 동일 시각이면 나중에 삽입된 거래를 먼저 둔다(안정 정렬).
    owned.sort((a, b) => {
      const diff = b.tx.createdAt.getTime() - a.tx.createdAt.getTime();
      return diff !== 0 ? diff : b.index - a.index;
    });

    const sorted = owned.map((entry) => ({ ...entry.tx }));
    const start = offset !== undefined && offset > 0 ? offset : 0;
    const end = limit !== undefined && limit >= 0 ? start + limit : undefined;
    return sorted.slice(start, end);
  }

  async existsOneTimeEarn(
    userId: string,
    reason: EarnReason,
    _client?: PoolClient | null,
  ): Promise<boolean> {
    return this.transactions.some(
      (t) => t.type === 'earn' && t.userId === userId && t.reason === reason,
    );
  }

  async findByRequestId(
    requestId: string,
    _client?: PoolClient | null,
  ): Promise<PointTransaction | null> {
    const found = this.transactions.find((t) => t.requestId === requestId);
    return found ? { ...found } : null;
  }
}
