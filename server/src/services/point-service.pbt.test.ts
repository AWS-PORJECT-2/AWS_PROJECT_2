/**
 * 속성 기반 테스트(PBT) - 포인트 시스템 (point-system)
 *
 * 설계 문서 "Correctness Properties"(속성 1~7) 및 "Testing Strategy" 를 1:1 로 구현한다.
 * 대상(SUT): InMemory 리포지토리/포트를 주입한 `PointServiceImpl`.
 *   - `pool` 을 생략하면 서비스가 InMemory 트랜잭션 러너(`withInMemoryTransaction`)를 사용한다.
 *   - 멱등(partial unique index)과 직렬화(FOR UPDATE)의 의미는 InMemory 구현이 동일하게 모델링한다.
 *
 * 모든 속성 테스트는 fast-check 로 `numRuns >= 100`(pbtParams) 회 반복한다.
 * 입력 생성기는 경계값(잔액 0, 정확히 cost, cost-1, 대량 시퀀스)을 포함하도록 구성한다.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { randomUUID } from 'node:crypto';
import { PointServiceImpl } from './point-service.js';
import { InMemoryPointTransactionRepository } from '../repositories/point-transaction-repository.js';
import { InMemoryUserProfileRepository } from '../repositories/user-profile-repository.js';
import { InMemoryNotificationPort } from '../repositories/notification-port.js';
import { EARN_AMOUNTS, SPEND_COSTS, REASON_LABEL } from '../types/index.js';
import type { EarnReason, SpendReason, PointTransaction } from '../types/index.js';
import { pbtParams } from '../test-utils/pbt.js';

// --- 공통 SUT 빌더 ---

function makeService() {
  const txRepo = new InMemoryPointTransactionRepository();
  const userRepo = new InMemoryUserProfileRepository();
  const notifications = new InMemoryNotificationPort();
  // pool 생략 → InMemory 트랜잭션 러너 사용.
  const service = new PointServiceImpl({
    pointTransactionRepository: txRepo,
    userProfileRepository: userRepo,
    notificationPort: notifications,
  });
  return { service, txRepo, userRepo, notifications };
}

/**
 * 임의 초기 잔액 b 를 공개 API 로만 시드한다.
 * refund 는 임의 금액의 보상 적립(type='earn', reason='refund_*')을 추가하므로
 * 잔액을 정확히 b 로 만들 수 있다(b===0 이면 시드 불필요).
 */
async function seedBalance(service: PointServiceImpl, userId: string, b: number): Promise<void> {
  if (b > 0) {
    await service.refund(userId, 'ai_blueprint', b, randomUUID());
  }
}

// --- 공통 생성기 ---

const earnReasonArb = fc.constantFrom<EarnReason>('signup', 'first_post', 'first_comment');
const spendReasonArb = fc.constantFrom<SpendReason>('ai_blueprint', 'ai_tryon');

type Op =
  | { kind: 'earn'; reason: EarnReason }
  | { kind: 'spend'; reason: SpendReason }
  | { kind: 'refund'; reason: SpendReason; amount: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  earnReasonArb.map((reason) => ({ kind: 'earn', reason }) as Op),
  spendReasonArb.map((reason) => ({ kind: 'spend', reason }) as Op),
  fc
    .record({ reason: spendReasonArb, amount: fc.integer({ min: 1, max: 250 }) })
    .map((o) => ({ kind: 'refund', reason: o.reason, amount: o.amount }) as Op),
);

const opsArb = fc.array(opArb, { minLength: 0, maxLength: 30 });

/** 단일 연산을 서비스에 순차 적용한다. cost 는 항상 서버 상수 SPEND_COSTS 를 사용한다. */
async function applyOp(service: PointServiceImpl, userId: string, op: Op): Promise<void> {
  if (op.kind === 'earn') {
    await service.earnOnce(userId, op.reason);
  } else if (op.kind === 'spend') {
    await service.spend(userId, op.reason, SPEND_COSTS[op.reason]);
  } else {
    await service.refund(userId, op.reason, op.amount, randomUUID());
  }
}

/** findByUser 는 최신순이므로, 시간 오름차순(삽입 순) 재구성을 위해 역순으로 돌린다. */
function chronological(txs: PointTransaction[]): PointTransaction[] {
  return [...txs].reverse();
}

const userIdArb = fc.uuid();

describe('PointService 속성 기반 테스트 (Properties 1-7)', () => {
  // Feature: point-system, Property 1: 잔액 비음수 불변식 — 임의의 적립·소모·환불 시퀀스에 대해
  // 매 연산 직후와 최종 시점의 잔액은 항상 0 이상의 정수이다.
  // Validates: Requirements 6.1, 6.4
  it('Property 1: 모든 중간/최종 잔액은 0 이상의 정수', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, opsArb, async (userId, ops) => {
        const { service } = makeService();
        for (const op of ops) {
          await applyOp(service, userId, op);
          const { points } = await service.getBalance(userId);
          expect(Number.isInteger(points)).toBe(true);
          expect(points).toBeGreaterThanOrEqual(0);
        }
        const { points: finalPoints } = await service.getBalance(userId);
        expect(Number.isInteger(finalPoints)).toBe(true);
        expect(finalPoints).toBeGreaterThanOrEqual(0);
      }),
      pbtParams(),
    );
  });

  // Feature: point-system, Property 2: 잔액-원장 일치 및 balance_after 정확성 — 시퀀스 종료 후
  // 잔액 == Σ(적립 amount) − Σ(소모 amount) == 마지막 거래의 balanceAfter == getBalance(),
  // 그리고 각 거래의 balanceAfter 는 그 거래까지의 누적 잔액과 일치한다.
  // Validates: Requirements 1.2, 2.2, 3.2, 4.3, 5.3, 6.2, 6.3, 7.3
  it('Property 2: 잔액-원장 일치 및 balanceAfter 누적 정확성', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, opsArb, async (userId, ops) => {
        const { service } = makeService();
        for (const op of ops) {
          await applyOp(service, userId, op);
        }

        const txs = await service.getTransactions(userId);
        const ordered = chronological(txs);

        // 누적 잔액과 각 balanceAfter 일치 검증.
        let running = 0;
        let earnSum = 0;
        let spendSum = 0;
        for (const tx of ordered) {
          if (tx.type === 'earn') {
            running += tx.amount;
            earnSum += tx.amount;
          } else {
            running -= tx.amount;
            spendSum += tx.amount;
          }
          expect(tx.balanceAfter).toBe(running);
        }

        const ledgerBalance = earnSum - spendSum;
        const { points } = await service.getBalance(userId);
        expect(points).toBe(ledgerBalance);
        if (txs.length > 0) {
          // 가장 최근(newest-first 의 첫 원소) 거래의 balanceAfter == 현재 잔액.
          expect(txs[0].balanceAfter).toBe(points);
        }
      }),
      pbtParams(),
    );
  });

  // Feature: point-system, Property 3: 일회성 적립은 최대 1회, 정확한 금액 — earnOnce(reason) 를
  // N>=1 회(동시 호출 포함) 호출해도 해당 사유 적립 거래는 정확히 1건이고 총 적립액은 정의된 금액이며,
  // 2회차 이후 호출은 잔액을 변화시키지 않는다.
  // Validates: Requirements 1.1, 1.3, 2.1, 2.3, 3.1, 3.3
  it('Property 3: earnOnce 멱등 — N회(동시 포함) 호출 후 거래 1건·정확한 금액', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        earnReasonArb,
        fc.integer({ min: 1, max: 10 }),
        fc.boolean(),
        async (userId, reason, n, concurrent) => {
          const { service, txRepo } = makeService();

          if (concurrent) {
            // 동시 호출: 동일 사용자 행 잠금으로 직렬화되어 정확히 1건만 적립되어야 한다.
            await Promise.all(
              Array.from({ length: n }, () => service.earnOnce(userId, reason)),
            );
          } else {
            for (let i = 0; i < n; i++) {
              await service.earnOnce(userId, reason);
            }
          }

          const all = await txRepo.findByUser(userId);
          const earnsForReason = all.filter((t) => t.type === 'earn' && t.reason === reason);
          expect(earnsForReason).toHaveLength(1);

          const { points } = await service.getBalance(userId);
          expect(points).toBe(EARN_AMOUNTS[reason]);
        },
      ),
      pbtParams(),
    );
  });

  // Feature: point-system, Property 4: 소모의 원자성 (전액 차감 또는 무변화) — 임의의 소모 사유와
  // 임의의 초기 잔액 b 에 대해, spend(reason, cost) 는 (b>=cost: 정확히 cost 차감 + spend 거래 1건)
  // 또는 (b<cost: 무변화 + ok=false) 둘 중 하나뿐이며, 부분 차감은 결코 없다.
  // Validates: Requirements 4.1, 4.4, 5.1, 5.4, 6.5
  it('Property 4: spend 는 전액 차감 또는 무변화 (부분 차감 없음)', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        spendReasonArb,
        // 경계값 포함: 0, cost-1(99), cost(100), 그 주변, 대형 값.
        fc.oneof(
          fc.constantFrom(0, 99, 100, 101, 199, 200),
          fc.integer({ min: 0, max: 1000 }),
        ),
        async (userId, reason, b) => {
          const { service, txRepo } = makeService();
          await seedBalance(service, userId, b);

          const cost = SPEND_COSTS[reason];
          const before = (await service.getBalance(userId)).points;
          expect(before).toBe(b);

          const result = await service.spend(userId, reason, cost);
          const after = (await service.getBalance(userId)).points;
          const spendTxs = (await txRepo.findByUser(userId)).filter((t) => t.type === 'spend');

          if (b >= cost) {
            expect(result.ok).toBe(true);
            expect(after).toBe(b - cost);
            expect(spendTxs).toHaveLength(1);
            expect(spendTxs[0].amount).toBe(cost);
            expect(spendTxs[0].balanceAfter).toBe(b - cost);
          } else {
            expect(result.ok).toBe(false);
            expect(after).toBe(b); // 무변화
            expect(spendTxs).toHaveLength(0);
          }
        },
      ),
      pbtParams(),
    );
  });

  // Feature: point-system, Property 5: 동시 차감의 직렬화와 음수 방지 — 초기 잔액 b 와 동일 cost 의
  // 동시 차감 N건을 처리한 뒤 성공 건수는 정확히 floor(b/cost), 최종 잔액은 b − 성공×cost >= 0 이며,
  // 어떤 중간 시점에도 잔액이 0 미만으로 내려가지 않는다.
  // Validates: Requirements 6.4, 6.5
  it('Property 5: 동시 차감 직렬화 — 성공 == floor(b/cost), 음수 없음', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        spendReasonArb,
        fc.oneof(fc.constantFrom(0, 99, 100, 200, 250, 300), fc.integer({ min: 0, max: 600 })),
        fc.integer({ min: 1, max: 8 }),
        async (userId, reason, b, n) => {
          const { service, txRepo } = makeService();
          await seedBalance(service, userId, b);
          const cost = SPEND_COSTS[reason];

          // 동일 사용자에 대한 N개의 동시 차감(requestId 없음 → 각각 독립).
          const results = await Promise.all(
            Array.from({ length: n }, () => service.spend(userId, reason, cost)),
          );

          const successes = results.filter((r) => r.ok).length;
          const expectedSuccesses = Math.min(n, Math.floor(b / cost));
          expect(successes).toBe(expectedSuccesses);

          const after = (await service.getBalance(userId)).points;
          expect(after).toBe(b - expectedSuccesses * cost);
          expect(after).toBeGreaterThanOrEqual(0);

          // 어떤 spend 거래의 balanceAfter 도 음수가 아니어야 한다(중간 시점 음수 방지).
          const spendTxs = (await txRepo.findByUser(userId)).filter((t) => t.type === 'spend');
          expect(spendTxs).toHaveLength(expectedSuccesses);
          for (const tx of spendTxs) {
            expect(tx.balanceAfter).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      pbtParams(),
    );
  });

  // Feature: point-system, Property 6: 적립·소모마다 정확히 1건의 알림 — 상태를 실제로 변화시킨
  // 모든 적립/소모/환불 거래 1건당 알림이 정확히 1건 생성되고 본문에 금액·사유가 포함되며,
  // 멱등 충돌(no-op 적립)이나 잔액 부족 거부 차감은 알림을 생성하지 않는다.
  // Validates: Requirements 1.4, 2.4, 3.4, 4.6, 5.6
  it('Property 6: 상태 변경 거래 1건당 알림 1건(금액·사유 포함), no-op/거부 시 0건', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, opsArb, async (userId, ops) => {
        const { service, notifications } = makeService();
        for (const op of ops) {
          await applyOp(service, userId, op);
        }

        const txs = await service.getTransactions(userId);
        // 상태 변경 거래 1건당 알림 1건.
        expect(notifications.created).toHaveLength(txs.length);

        // 삽입 순(시간 오름차순)으로 거래와 알림을 1:1 대응시켜 본문에 금액·사유 포함 확인.
        const ordered = chronological(txs);
        for (let i = 0; i < ordered.length; i++) {
          const tx = ordered[i];
          const notif = notifications.created[i];
          expect(notif.body).toContain(String(tx.amount));
          expect(notif.body).toContain(REASON_LABEL[tx.reason]);
          expect(notif.type).toBe(tx.type === 'earn' ? 'point_earn' : 'point_spend');
        }
      }),
      pbtParams(),
    );
  });

  // Feature: point-system, Property 7: 거래 내역은 최신순이며 필수 필드를 포함 — getTransactions 결과는
  // createdAt 기준 내림차순(최신순)으로 정렬되고, 반환된 모든 거래는 type/reason/amount/balanceAfter/createdAt 을 포함한다.
  // Validates: Requirements 7.1, 7.2
  it('Property 7: getTransactions 는 최신순 정렬 + 모든 필수 필드 포함', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, opsArb, async (userId, ops) => {
        const { service } = makeService();
        for (const op of ops) {
          await applyOp(service, userId, op);
        }

        const txs = await service.getTransactions(userId);

        // 최신순(createdAt 내림차순, 동률 허용 → 비증가).
        for (let i = 0; i + 1 < txs.length; i++) {
          expect(txs[i].createdAt.getTime()).toBeGreaterThanOrEqual(txs[i + 1].createdAt.getTime());
        }

        // 모든 거래가 필수 필드를 포함.
        for (const tx of txs) {
          expect(tx.type === 'earn' || tx.type === 'spend').toBe(true);
          expect(typeof tx.reason).toBe('string');
          expect(tx.reason.length).toBeGreaterThan(0);
          expect(Number.isInteger(tx.amount)).toBe(true);
          expect(Number.isInteger(tx.balanceAfter)).toBe(true);
          expect(tx.createdAt).toBeInstanceOf(Date);
        }
      }),
      pbtParams(),
    );
  });
});
