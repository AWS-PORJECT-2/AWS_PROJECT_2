import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { PointService, PointBalance, SpendResult } from '../interfaces/point-service.js';
import type { PointTransactionRepository } from '../repositories/point-transaction-repository.js';
import type { UserProfileRepository } from '../repositories/user-profile-repository.js';
import { withInMemoryTransaction } from '../repositories/user-profile-repository.js';
import type { NotificationPort } from '../repositories/notification-port.js';
import type { PointTransaction, EarnReason, SpendReason, TransactionReason } from '../types/index.js';
import { EARN_AMOUNTS, SPEND_COSTS, REASON_LABEL } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { logger } from '../logger.js';

/** 데드락(`40P01`)·직렬화 실패(`40001`) 재시도 한도. payment-service.ts 와 동일. */
const MAX_DEADLOCK_RETRIES = 3;

/** PostgreSQL unique_violation 에러 코드. InMemory 의 UniqueViolationError 도 동일 코드를 노출한다. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * 단일 DB 트랜잭션을 실행하는 러너.
 *
 * - PostgreSQL 경로: 실제 `BEGIN ... COMMIT/ROLLBACK` 을 수행하는 `PoolClient` 를 콜백에 넘긴다.
 * - InMemory 경로: `InMemoryTransactionClient` 를 `PoolClient` 자리에 주입한다(PBT/InMemory 검증용).
 *
 * 어느 경로든 콜백은 동일하게 `client` 를 리포지토리에 전달하기만 하면 된다.
 */
type TransactionRunner = <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;

export interface PointServiceDeps {
  /** PostgreSQL 풀. 존재하면 실제 트랜잭션 경로를 사용한다. InMemory 검증 시 생략(또는 null). */
  pool?: Pool | null;
  pointTransactionRepository: PointTransactionRepository;
  userProfileRepository: UserProfileRepository;
  notificationPort: NotificationPort;
  /**
   * 트랜잭션 러너를 명시적으로 주입할 수 있다(테스트/커스텀 경로). 미지정 시
   * `pool` 유무에 따라 Pg 트랜잭션 또는 InMemory 트랜잭션 러너가 자동 선택된다.
   */
  withTransaction?: TransactionRunner;
}

/**
 * 포인트 시스템의 모든 비즈니스 규칙을 담는 서비스 구현.
 *
 * 적립/차감/환불은 하나의 트랜잭션 안에서 원장 INSERT + 잔액 UPDATE + 알림 INSERT 를
 * 함께 수행한다. `payment-service.ts` 의 `withTransaction` / `withRetry`(지수 백오프)
 * 패턴을 그대로 재사용한다.
 *
 * 동일 클래스가 Pg 경로(실 pool)와 InMemory 경로(PBT)를 모두 지원하도록,
 * 트랜잭션 러너 추상화를 통해 `PoolClient` 자리에 적절한 클라이언트를 주입한다.
 */
export class PointServiceImpl implements PointService {
  private readonly pool: Pool | null;
  private readonly txRepo: PointTransactionRepository;
  private readonly userProfileRepo: UserProfileRepository;
  private readonly notificationPort: NotificationPort;
  private readonly runTransaction: TransactionRunner;

  constructor(deps: PointServiceDeps) {
    this.pool = deps.pool ?? null;
    this.txRepo = deps.pointTransactionRepository;
    this.userProfileRepo = deps.userProfileRepository;
    this.notificationPort = deps.notificationPort;
    this.runTransaction = deps.withTransaction ?? this.createDefaultRunner();
  }

  /**
   * 일회성 적립. 동일 (userId, reason) 이 이미 지급됐다면 적립·알림 없이 기존 잔액을 그대로 반환(멱등).
   *
   * 트랜잭션 안에서:
   *  1. `ensureAndLock` 으로 잔액 행을 보장하고 FOR UPDATE 로 잠근다(동시 호출 직렬화).
   *  2. `existsOneTimeEarn` 사전 확인 — 이미 있으면 변화 없이 현재 잔액 반환.
   *  3. 원장 INSERT(`type='earn'`, balanceAfter = current + amount).
   *     - 동시 중복으로 unique 위반(`23505`)이 나면 "이미 지급됨"으로 간주하고 멱등 성공 처리.
   *  4. `addPoints(+amount)` 로 잔액 캐시 갱신.
   *  5. 적립 알림 1건 생성(금액·사유 포함).
   *
   * 적립 금액은 서버 상수 `EARN_AMOUNTS[reason]` 로만 결정한다(클라이언트 값 미신뢰).
   * 요구사항 1.1~1.4, 2.1~2.4, 3.1~3.4.
   */
  async earnOnce(userId: string, reason: EarnReason): Promise<PointBalance> {
    return this.withRetry(() =>
      this.runTransaction(async (client) => {
        // 1. 잔액 행 보장 + 행 잠금(직렬화).
        const current = await this.userProfileRepo.ensureAndLock(userId, client);

        // 2. 사전 확인(빠른 경로): 이미 지급됐으면 변화 없이 멱등 반환.
        const alreadyGranted = await this.txRepo.existsOneTimeEarn(userId, reason, client);
        if (alreadyGranted) {
          return { userId, points: current };
        }

        const amount = EARN_AMOUNTS[reason];
        const balanceAfter = current + amount;
        const transaction: PointTransaction = {
          id: randomUUID(),
          userId,
          type: 'earn',
          reason,
          amount,
          balanceAfter,
          requestId: null,
          createdAt: new Date(),
        };

        // 3. 원장 INSERT — partial unique index 가 최종 멱등성을 보장한다.
        try {
          await this.txRepo.insert(transaction, client);
        } catch (err) {
          if (this.isUniqueViolation(err)) {
            // 동시 중복 적립: 다른 트랜잭션이 먼저 지급함 → 추가 적립·알림 없이 기존 잔액 유지.
            logger.info({ userId, reason }, '일회성 적립 멱등 충돌(23505) — 이미 지급됨으로 처리');
            return { userId, points: current };
          }
          throw err;
        }

        // 4. 잔액 캐시 갱신.
        const updated = await this.userProfileRepo.addPoints(userId, amount, client);

        // 5. 적립 알림(같은 트랜잭션).
        await this.notificationPort.create(
          {
            userId,
            type: 'point_earn',
            title: '포인트 적립',
            body: `${REASON_LABEL[reason]}(으)로 ${amount}포인트가 적립되었습니다.`,
          },
          client,
        );

        return { userId, points: updated };
      }),
    );
  }

  // --- 후속 작업에서 구현 (인터페이스 충족용 스텁) ---

  /**
   * 원자적 차감. 잔액 >= cost 이면 차감 후 원장·잔액·알림을 같은 트랜잭션에 기록(ok=true),
   * 부족하면 아무 것도 변경하지 않고 ok=false 로 거부한다(부분 차감 없음).
   *
   * 차감 금액은 서버 상수 `SPEND_COSTS[reason]` 로만 결정한다. 호출부가 넘긴 `cost` 가
   * 상수와 다르면 임의 금액 주입으로 간주하여 거부한다(클라이언트 값 미신뢰).
   *
   * 트랜잭션 안에서:
   *  1. `ensureAndLock` 으로 잔액 행을 FOR UPDATE 잠금 → 동일 사용자 동시 차감을 직렬화(요구사항 6.4/6.5).
   *  2. `requestId` 가 있으면 기존 차감 거래를 찾아 멱등하게 반환(이중 차감 방지).
   *  3. 잔액 < cost → 무변화로 거부(ok=false, 원장·알림·잔액 변경 없음). 요구사항 4.4/5.4/6.5.
   *  4. 충분하면 원장 INSERT(`type='spend'`) + `addPoints(-cost)` + 차감 알림 1건.
   *     - `requestId` 동시 중복으로 unique 위반(`23505`)이 나면 기존 거래를 재조회해 멱등 반환.
   *
   * 요구사항 4.1, 4.3, 4.4, 4.6, 5.1, 5.3, 5.4, 5.6, 6.1, 6.2, 6.4, 6.5.
   */
  async spend(
    userId: string,
    reason: SpendReason,
    cost: number,
    requestId?: string,
  ): Promise<SpendResult> {
    // 임의 금액 주입 차단: 차감액은 서버 상수로만 결정한다.
    const expected = SPEND_COSTS[reason];
    if (cost !== expected) {
      logger.warn({ userId, reason, cost, expected }, '차감 금액 불일치 — 임의 금액 주입 차단');
      throw new AppError('PRICE_MISMATCH');
    }

    return this.withRetry(() =>
      this.runTransaction(async (client) => {
        // 1. 잔액 행 보장 + 행 잠금(동시 차감 직렬화).
        const current = await this.userProfileRepo.ensureAndLock(userId, client);

        // 2. 멱등: 동일 requestId 차감이 이미 있으면 재차감 없이 그대로 반환.
        if (requestId) {
          const existing = await this.txRepo.findByRequestId(requestId, client);
          if (existing) {
            logger.info({ userId, reason, requestId }, '소모 멱등 재요청 — 기존 거래 반환');
            return { ok: true, balanceAfter: existing.balanceAfter, transaction: existing };
          }
        }

        // 3. 잔액 부족 → 무변화로 거부(원장·알림·잔액 변경 없음).
        if (current < cost) {
          return { ok: false, balanceAfter: current };
        }

        const balanceAfter = current - cost;
        const transaction: PointTransaction = {
          id: randomUUID(),
          userId,
          type: 'spend',
          reason,
          amount: cost,
          balanceAfter,
          requestId: requestId ?? null,
          createdAt: new Date(),
        };

        // 4. 원장 INSERT — requestId unique 위반은 동시 중복 차감으로 간주하고 멱등 처리.
        try {
          await this.txRepo.insert(transaction, client);
        } catch (err) {
          if (requestId && this.isUniqueViolation(err)) {
            const existing = await this.txRepo.findByRequestId(requestId, client);
            if (existing) {
              logger.info({ userId, reason, requestId }, '소모 멱등 충돌(23505) — 기존 거래 반환');
              return { ok: true, balanceAfter: existing.balanceAfter, transaction: existing };
            }
          }
          throw err;
        }

        // 잔액 캐시 갱신.
        await this.userProfileRepo.addPoints(userId, -cost, client);

        // 차감 알림(같은 트랜잭션).
        await this.notificationPort.create(
          {
            userId,
            type: 'point_spend',
            title: '포인트 차감',
            body: `${REASON_LABEL[reason]}(으)로 ${cost}포인트가 차감되었습니다.`,
          },
          client,
        );

        return { ok: true, balanceAfter, transaction };
      }),
    );
  }

  /**
   * 보상(환불) 적립. `spend` 가 성공한 뒤 후속 AI 작업이 실패하면 차감분을 환원한다.
   *
   * 환불은 `type='earn'`, `reason='refund_ai_blueprint' | 'refund_ai_tryon'` 거래로 기록한다.
   * 이 사유들은 일회성 적립 partial unique index 대상이 아니므로 여러 번 발생할 수 있다.
   *
   * 트랜잭션 안에서:
   *  1. `ensureAndLock` 으로 잔액 행을 잠그고 현재 잔액을 읽는다.
   *  2. 보상 적립 거래 INSERT(`type='earn'`, balanceAfter = current + amount).
   *  3. `addPoints(+amount)` 로 잔액 복원 + 환불 알림 1건.
   *
   * `originalTransactionId` 는 추적(로그)용으로 사용한다.
   * 요구사항 4.2/5.2 흐름의 역(보상) 트랜잭션.
   */
  async refund(
    userId: string,
    reason: SpendReason,
    amount: number,
    originalTransactionId: string,
  ): Promise<PointBalance> {
    const refundReason: TransactionReason =
      reason === 'ai_blueprint' ? 'refund_ai_blueprint' : 'refund_ai_tryon';

    return this.withRetry(() =>
      this.runTransaction(async (client) => {
        // 1. 잔액 행 보장 + 잠금.
        const current = await this.userProfileRepo.ensureAndLock(userId, client);
        const balanceAfter = current + amount;

        // 2. 보상 적립 거래 INSERT.
        const transaction: PointTransaction = {
          id: randomUUID(),
          userId,
          type: 'earn',
          reason: refundReason,
          amount,
          balanceAfter,
          requestId: null,
          createdAt: new Date(),
        };
        await this.txRepo.insert(transaction, client);

        // 3. 잔액 복원 + 환불 알림.
        const updated = await this.userProfileRepo.addPoints(userId, amount, client);
        await this.notificationPort.create(
          {
            userId,
            type: 'point_earn',
            title: '포인트 환불',
            body: `${REASON_LABEL[refundReason]}(으)로 ${amount}포인트가 환불되었습니다.`,
          },
          client,
        );

        logger.info(
          { userId, reason: refundReason, amount, originalTransactionId },
          '보상 환불 적립 완료',
        );

        return { userId, points: updated };
      }),
    );
  }

  /**
   * 현재 잔액 조회. 잠금 없는 단순 조회(`getPoints`)로 캐시된 잔액을 그대로 반환한다.
   * 행이 없으면 0 포인트로 간주한다. 요구사항 7.3.
   */
  async getBalance(userId: string): Promise<PointBalance> {
    return { userId, points: await this.userProfileRepo.getPoints(userId) };
  }

  /**
   * 사용자 거래 내역 조회. 리포지토리가 최신순(newest-first)으로 모든 필수 필드를 포함해
   * 반환하므로 그대로 위임한다. `limit`/`offset` 으로 페이지네이션한다. 요구사항 7.1, 7.2.
   */
  async getTransactions(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<PointTransaction[]> {
    return this.txRepo.findByUser(userId, limit, offset);
  }

  // --- Private helpers ---

  /** PG unique_violation(`23505`) 또는 InMemory UniqueViolationError 인지 판별. */
  private isUniqueViolation(err: unknown): boolean {
    return (err as { code?: unknown })?.code === PG_UNIQUE_VIOLATION;
  }

  /**
   * `pool` 유무에 따라 기본 트랜잭션 러너를 만든다.
   * - pool 있음 → 실제 BEGIN/COMMIT/ROLLBACK (payment-service.ts 패턴).
   * - pool 없음 → InMemory 트랜잭션(`withInMemoryTransaction`).
   */
  private createDefaultRunner(): TransactionRunner {
    const pool = this.pool;
    if (pool) {
      return async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
        const client: PoolClient = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(client);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          // ROLLBACK 자체가 throw 하더라도 원본 err 를 잃지 않게 한다.
          try {
            await client.query('ROLLBACK');
          } catch (rbErr) {
            logger.error({ rbErr, originalErr: err }, 'ROLLBACK 실패 — 원본 에러는 throw');
          }
          throw err;
        } finally {
          client.release();
        }
      };
    }
    // InMemory 경로: InMemoryTransactionClient 를 PoolClient 자리에 주입.
    return <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> =>
      withInMemoryTransaction((client) => fn(client as unknown as PoolClient));
  }

  /**
   * 데드락(`40P01`)·직렬화 실패(`40001`) 시 지수 백오프로 재시도.
   * payment-service.ts 의 withRetry 와 동일한 정책.
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_DEADLOCK_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;
        const code = (err as { code?: unknown })?.code;
        const isRetryable =
          code === '40P01' ||
          code === '40001' ||
          (err instanceof Error &&
            (err.message.includes('deadlock') || err.message.includes('40P01')));
        if (!isRetryable || attempt === MAX_DEADLOCK_RETRIES) throw err;
        const delay = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }
}
