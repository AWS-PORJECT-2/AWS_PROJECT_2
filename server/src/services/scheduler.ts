import type { PaymentService } from '../interfaces/payment-service.js';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { OrderRepository } from '../repositories/order-repository.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import type { PgRewardOrderRepository } from '../repositories/pg-reward-order-repository.js';
import type { RewardOrder } from '../types/index.js';
import type { DistributedLockProvider } from './distributed-lock.js';
import { notify, notifyMany } from './notify.js';
import { logger } from '../logger.js';

/**
 * 모의결제(mock) — 현재는 실제 청구를 하지 않고 항상 성공을 반환한다.
 * !! 추후 PG 연동 지점 !! : 여기에 toss-payments-client(빌링키 결제) 등 실제 PG 호출을 꽂는다.
 *   - 사용자 결제수단(payment_methods.encrypted_billing_key) 복호화 → PG 빌링 결제 API 호출.
 *   - 성공 시 { ok: true }, 실패 시 { ok: false, reason } 반환하면 스케줄러가 재시도/3진아웃을 처리.
 * 절대 이 함수에서 실제 과금 API 를 호출하지 말 것(모의 단계). 비용 발생 방지.
 */
async function mockCharge(_order: RewardOrder): Promise<{ ok: true } | { ok: false; reason: string }> {
  // 모의: 항상 성공. (실패 경로 검증이 필요하면 PG 연동 시 이 분기에서 { ok:false, reason } 반환.)
  return { ok: true };
}

export interface SchedulerConfig {
  intervalMs: number;
  maxRetryAttempts: number;
  lockKey: number;
  /** 한 tick 당 처리할 모의결제 건수(순차 청구 throttle). */
  rewardChargesPerTick: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  intervalMs: 60_000,
  maxRetryAttempts: 3,
  lockKey: 100001,
  rewardChargesPerTick: 20,
};

// 결제 예약 지연: 마감 다음날부터 청구. 재시도 간격도 동일(1일).
const CHARGE_DELAY_MS = 24 * 60 * 60 * 1000;

// 마감 임박 알림 윈도: 마감이 지금부터 24~48시간 내인 open 펀드.
const DEADLINE_SOON_MIN_MS = 24 * 60 * 60 * 1000;
const DEADLINE_SOON_MAX_MS = 48 * 60 * 60 * 1000;

// 알림 전용 선택 의존성 — 미주입 시 알림 잡은 건너뛰고 기존 결제/상태전환만 수행.
export interface SchedulerNotificationDeps {
  notificationRepo: NotificationRepository;
  rewardOrderRepo: PgRewardOrderRepository;
}

export class PaymentScheduler {
  private readonly config: SchedulerConfig;
  private readonly paymentService: PaymentService;
  private readonly groupBuyRepo: GroupBuyRepository;
  private readonly orderRepo: OrderRepository;
  private readonly lockProvider: DistributedLockProvider;
  private readonly notify?: SchedulerNotificationDeps;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(
    paymentService: PaymentService,
    groupBuyRepo: GroupBuyRepository,
    orderRepo: OrderRepository,
    lockProvider: DistributedLockProvider,
    config?: Partial<SchedulerConfig>,
    notifyDeps?: SchedulerNotificationDeps,
  ) {
    this.paymentService = paymentService;
    this.groupBuyRepo = groupBuyRepo;
    this.orderRepo = orderRepo;
    this.lockProvider = lockProvider;
    this.notify = notifyDeps;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.intervalHandle) return;
    logger.info({ intervalMs: this.config.intervalMs }, '결제 스케줄러 시작');
    // tick() 은 fire-and-forget 이므로 반드시 .catch() — 내부에서 새는 거부(예: DB 단절)가
    // unhandledRejection 으로 프로세스를 죽이지 않도록 방어(이중 안전: distributed-lock 도 fail-closed).
    this.intervalHandle = setInterval(() => {
      void this.tick().catch((err) => logger.error({ err }, '스케줄러 tick 실패(무시, 다음 주기 재시도)'));
    }, this.config.intervalMs);
    // Run immediately on start
    void this.tick().catch((err) => logger.error({ err }, '스케줄러 tick 실패(무시, 다음 주기 재시도)'));
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info('결제 스케줄러 중지');
    }
  }

  async tick(): Promise<void> {
    if (this.isRunning) {
      logger.debug('스케줄러: 이전 배치 처리 중 — 건너뜀');
      return;
    }

    const lock = await this.lockProvider.acquire(this.config.lockKey);
    if (!lock) {
      logger.debug('스케줄러: 분산 락 획득 실패 — 건너뜀');
      return;
    }

    this.isRunning = true;
    try {
      await this.promoteScheduledGroupBuys();
      await this.notifyDeadlineSoon();
      await this.processExpiredGroupBuys();
      await this.processRewardCharges();
      await this.processRetries();
    } catch (err) {
      logger.error({ err }, '스케줄러: 처리 중 오류 발생');
    } finally {
      this.isRunning = false;
      await lock.release();
    }
  }

  // 공개예정(scheduled) → open 전환: open_at <= now 인 펀드를 공개로 전환(023_plan_features).
  // 구독자 알림은 best-effort(없으면 상태전환만). 전환 실패는 다음 tick 에서 재시도.
  private async promoteScheduledGroupBuys(): Promise<void> {
    try {
      const opened = await this.groupBuyRepo.promoteScheduledToOpen(new Date());
      if (opened.length > 0) {
        logger.info({ count: opened.length, ids: opened }, '공개예정 → 공개 전환');
      }
      // 공개예정 알림 신청한 구독자에게 오픈 소식(best-effort). 전환된 펀드만 대상이라 중복 발송 없음.
      if (this.notify) {
        for (const fundId of opened) {
          try {
            const fund = await this.groupBuyRepo.findById(fundId);
            const subscribers = await this.groupBuyRepo.subscriberUserIds(fundId);
            await notifyMany(this.notify.notificationRepo, subscribers, {
              type: 'scheduled_open',
              title: '관심 프로젝트가 공개되었어요',
              body: `'${fund?.title ?? '프로젝트'}' 후원이 시작되었어요. 지금 확인해 보세요.`,
              fundId,
            });
          } catch (err) {
            logger.warn({ err, fundId }, '공개예정 오픈 알림 실패(무시)');
          }
        }
      }
    } catch (err) {
      logger.error({ err }, '공개예정 → 공개 전환 실패');
    }
  }

  /**
   * 마감 임박 알림 — 마감이 지금부터 24~48시간 내인 open 펀드.
   * 펀드 단위 1회만: notifications 에 동일 type='deadline_soon' + fund_id 가 이미 있으면 건너뜀.
   * 대상: 후원자(reward_orders 의 입금대기/확정자) + 창작자. 모두 fund_id 포함.
   */
  private async notifyDeadlineSoon(): Promise<void> {
    if (!this.notify) return;
    const { notificationRepo, rewardOrderRepo } = this.notify;
    try {
      const now = Date.now();
      // findExpiredOpen 은 마감이 '지난' 펀드만 — 마감 '임박'(미래) 조회 메서드는 없어 list 로 open 펀드를 받아
      // 잔여시간(24~48h)으로 직접 필터한다. list 는 limit 을 100 으로 클램프(매 tick 재실행 + 펀드단위 dedup 으로 안전).
      const { items } = await this.groupBuyRepo.list({ status: 'open', limit: 100 });
      for (const gb of items) {
        try {
          const remaining = new Date(gb.deadline).getTime() - now;
          if (remaining < DEADLINE_SOON_MIN_MS || remaining > DEADLINE_SOON_MAX_MS) continue;
          // 중복 방지: 이 펀드에 deadline_soon 알림을 이미 보냈으면 건너뜀.
          if (await notificationRepo.existsForFund('deadline_soon', gb.id)) continue;

          // 후원자 + 찜(좋아요)한 사용자 모두에게(중복 제거). likedDeadline 토글이 '후원·관심 프로젝트'를 가리키므로 둘 다 대상.
          //  창작자는 아래 전용 알림을 따로 받으므로 여기서 제외(자기 펀드를 후원/찜했어도 1건만 받도록).
          const backers = await rewardOrderRepo.backerUserIds(gb.id);
          const likers = await this.groupBuyRepo.likerUserIds(gb.id);
          const recipients = [...new Set([...backers, ...likers])].filter((id) => id !== gb.creatorId);
          await notifyMany(notificationRepo, recipients, {
            type: 'deadline_soon',
            title: '관심 프로젝트 마감이 임박했어요',
            body: `'${gb.title}' 프로젝트 마감이 곧 다가와요. 잊지 마세요.`,
            fundId: gb.id,
          });
          // 창작자에게도 1회.
          if (gb.creatorId) {
            await notify(notificationRepo, {
              userId: gb.creatorId,
              type: 'deadline_soon',
              title: '내 프로젝트 마감이 임박했어요',
              body: `'${gb.title}' 프로젝트 마감이 곧 다가와요.`,
              fundId: gb.id,
            });
          }
          logger.info({ fundId: gb.id, recipients: recipients.length }, '마감 임박 알림 발송');
        } catch (err) {
          logger.warn({ err, fundId: gb.id }, '마감 임박 알림 실패(무시)');
        }
      }
    } catch (err) {
      logger.error({ err }, '마감 임박 알림 잡 실패');
    }
  }

  private async processExpiredGroupBuys(): Promise<void> {
    const now = new Date();
    const expiredGroupBuys = await this.groupBuyRepo.findExpiredOpen(now);

    for (const gb of expiredGroupBuys) {
      try {
        // 금액 기준 성공 판정(와디즈/텀블벅식, 031) — 달성 금액(current_amount 캐시) >= 목표 금액.
        //   목표 금액(target_amount) 폴백: (target_quantity × final_price). 목표가 산정 불가(0)면
        //   기존 수량 기준(current_quantity >= target_quantity)으로 폴백.
        const targetAmount = (gb.targetAmount && gb.targetAmount > 0)
          ? gb.targetAmount
          : (gb.targetQuantity ?? 0) * (gb.finalPrice ?? 0);
        // 캐시 드리프트 방어 — 마감 판정 직전 실제 활성 주문 합계로 current_amount/quantity 재계산·동기화.
        //  (과거 이중계상/취소 미복원으로 캐시가 어긋나도 마감 성공/실패 오판을 막는다.)
        let achievedAmount = gb.currentAmount ?? 0;
        let achievedQty = gb.currentQuantity ?? 0;
        if (this.notify) {
          const rc = await this.notify.rewardOrderRepo.recomputeFundCounts(gb.id);
          achievedAmount = rc.amount; achievedQty = rc.quantity;
        }
        const success = targetAmount > 0
          ? achievedAmount >= targetAmount
          : achievedQty >= (gb.targetQuantity ?? 0);
        // 상태 전환 전에 후원자 목록을 미리 확보(전환 로직이 참여를 취소할 수 있으므로).
        const backers = this.notify ? await this.notify.rewardOrderRepo.backerUserIds(gb.id) : [];

        if (success) {
          logger.info({ groupbuyId: gb.id }, '목표 달성 — 일괄 결제 실행');
          await this.paymentService.executeBatchPayments(gb.id);
        } else {
          logger.info({ groupbuyId: gb.id }, '목표 미달 — 공동구매 실패 처리');
          await this.paymentService.markGroupBuyFailed(gb.id);
        }

        // ── 텀블벅식 reward_orders 처리(실제 UI 후원 경로). 위 executeBatchPayments/markGroupBuyFailed 는
        //    미사용 orders 시스템 대상이라 reward_orders 와 단절돼 있어, 여기서 별도로 예약/취소를 건다. ──
        //    펀드는 위에서 이미 open 밖으로 전이돼 findExpiredOpen 에 다시 안 잡힘(멱등). 단, 재처리되더라도
        //    schedulePledgedCharges(next_charge_at NULL 만)·cancelPledgedForFund(pledged 만)는 멱등.
        // 무통장입금 모델: 성공 → pledged 를 입금대기(awaiting_deposit)로 전환하고 후원자별 입금 안내.
        //  (구 모의결제 schedulePledgedCharges 는 더 이상 호출 안 함 — 자동결제 비활성.)
        let awaitingOrders: Array<{ id: string; userId: string; amount: number }> = [];
        if (this.notify) {
          const { rewardOrderRepo } = this.notify;
          try {
            if (success) {
              awaitingOrders = await rewardOrderRepo.markPledgedAwaitingDeposit(gb.id);
              if (awaitingOrders.length > 0) logger.info({ groupbuyId: gb.id, count: awaitingOrders.length }, '마감 성공 — 무통장 입금 대기 전환');
            } else {
              // 예약 해제(청구 없음). 수량 복원 불필요(캠페인 종료).
              const cancelledUserIds = await rewardOrderRepo.cancelPledgedForFund(gb.id);
              if (cancelledUserIds.length > 0) logger.info({ groupbuyId: gb.id, count: cancelledUserIds.length }, '미달 — 예약 후원 취소');
            }
          } catch (err) {
            logger.error({ err, groupbuyId: gb.id }, '예약 후원(reward_orders) 마감 처리 실패');
          }
        }

        // 성공/실패 알림(best-effort) — 창작자 + 후원자 모두 fund_id 포함.
        if (this.notify) {
          const { notificationRepo } = this.notify;
          if (success) {
            await notify(notificationRepo, {
              userId: gb.creatorId,
              type: 'fund_success',
              title: '프로젝트가 성공했어요',
              body: `'${gb.title}' 프로젝트가 목표를 달성했어요. 축하해요!`,
              fundId: gb.id,
            });
            // 후원자별 무통장 입금 안내 — 각자 후원 금액 + 입금 계좌.
            const bank = process.env.DEPOSIT_BANK ?? '국민은행';
            const account = process.env.DEPOSIT_ACCOUNT ?? '000000-00-000000';
            for (const o of awaitingOrders) {
              await notify(notificationRepo, {
                userId: o.userId,
                type: 'deposit_request',
                title: '펀딩 성공 · 입금 안내',
                body: `'${gb.title}' 펀딩이 성공했습니다! ${bank} ${account} 계좌로 ${o.amount.toLocaleString('ko-KR')}원 입금해 주세요.`,
                fundId: gb.id,
              });
            }
          } else {
            await notify(notificationRepo, {
              userId: gb.creatorId,
              type: 'fund_failed',
              title: '프로젝트가 무산되었어요',
              body: `'${gb.title}' 프로젝트가 목표에 도달하지 못했어요.`,
              fundId: gb.id,
            });
            await notifyMany(notificationRepo, backers, {
              type: 'backed_failed',
              title: '후원하신 프로젝트가 무산되었어요',
              body: `'${gb.title}' 프로젝트가 목표에 도달하지 못했어요.`,
              fundId: gb.id,
            });
          }
        }
      } catch (err) {
        logger.error({ err, groupbuyId: gb.id }, '만료 공동구매 처리 실패');
      }
    }
  }

  /**
   * 모의결제 잡 — status IN ('pledged','payment_failed') AND next_charge_at <= now 인 주문을
   * 한 tick 당 N건(rewardChargesPerTick) 순차 처리. 멱등(상태 가드로 재실행 안전).
   *  - 성공: status='paid', 결제완료 알림('payment_done', best-effort).
   *  - 실패: charge_attempts+1 → 'payment_failed', 다음날 재시도, 알림('payment_failed').
   *  - charge_attempts >= maxRetryAttempts(3): 자동취소(status='cancelled', 수량/soldCount -1), 알림('payment_cancelled').
   * notify 의존(rewardOrderRepo/notificationRepo) 미주입 시 잡 자체를 건너뜀.
   */
  private async processRewardCharges(): Promise<void> {
    if (!this.notify) return;
    const { rewardOrderRepo, notificationRepo } = this.notify;
    try {
      const now = new Date();
      const due = await rewardOrderRepo.findDueCharges(now, this.config.rewardChargesPerTick);
      for (const order of due) {
        try {
          // ── 모의결제 호출(추후 PG 연동 지점) ──
          const result = await mockCharge(order);

          if (result.ok) {
            const paid = await rewardOrderRepo.markPaid(order.id);
            if (paid) {
              logger.info({ orderId: order.id, amount: order.amount }, '모의결제 성공(paid)');
              await notify(notificationRepo, {
                userId: order.userId,
                type: 'payment_done',
                title: '결제가 완료되었어요',
                body: '후원하신 프로젝트 결제가 완료되었어요.',
                fundId: order.fundId,
              });
            }
            continue;
          }

          // ── 실패 경로(모의에선 비활성: mockCharge 가 항상 성공). PG 연동 후 실제 동작. ──
          const reason = result.reason ?? '결제 실패';
          const nextTry = new Date(now.getTime() + CHARGE_DELAY_MS);
          const failed = await rewardOrderRepo.markPaymentFailed(order.id, reason, nextTry);
          if (!failed) continue; // 동시 처리/상태변경으로 대상 아님

          logger.warn({ orderId: order.id, attempts: failed.chargeAttempts, reason }, '모의결제 실패');

          if ((failed.chargeAttempts ?? 0) >= this.config.maxRetryAttempts) {
            // 3진아웃 → 자동취소 + 수량/soldCount 복원.
            const cancelled = await rewardOrderRepo.autoCancelFailedCharge(order.id);
            if (cancelled) {
              logger.warn({ orderId: order.id }, '결제 3회 실패 — 펀딩 자동취소');
              await notify(notificationRepo, {
                userId: order.userId,
                type: 'payment_cancelled',
                title: '결제 실패로 펀딩이 취소되었어요',
                body: '결제가 3회 실패하여 펀딩이 자동 취소되었어요.',
                fundId: order.fundId,
              });
            }
          } else {
            await notify(notificationRepo, {
              userId: order.userId,
              type: 'payment_failed',
              title: '결제에 실패했어요',
              body: `결제 실패: ${reason}. 내일 다시 시도할게요.`,
              fundId: order.fundId,
            });
          }
        } catch (err) {
          logger.error({ err, orderId: order.id }, '모의결제 처리 중 오류(개별 건 건너뜀)');
        }
      }
    } catch (err) {
      logger.error({ err }, '모의결제 잡 실패');
    }
  }

  private async processRetries(): Promise<void> {
    const failedOrders = await this.orderRepo.findFailedForRetry(this.config.maxRetryAttempts);

    for (const order of failedOrders) {
      try {
        logger.info({ orderId: order.id, retryCount: order.retryCount }, '결제 재시도');
        await this.paymentService.retryFailedPayment(order.id);
      } catch (err) {
        logger.error({ err, orderId: order.id }, '결제 재시도 실패');
      }
    }
  }
}
