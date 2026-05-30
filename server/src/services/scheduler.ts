import type { PaymentService } from '../interfaces/payment-service.js';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { OrderRepository } from '../repositories/order-repository.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import type { PgRewardOrderRepository } from '../repositories/pg-reward-order-repository.js';
import type { DistributedLockProvider } from './distributed-lock.js';
import { notify, notifyMany } from './notify.js';
import { logger } from '../logger.js';

export interface SchedulerConfig {
  intervalMs: number;
  maxRetryAttempts: number;
  lockKey: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  intervalMs: 60_000,
  maxRetryAttempts: 3,
  lockKey: 100001,
};

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
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, this.config.intervalMs);
    // Run immediately on start
    void this.tick();
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

          const backers = await rewardOrderRepo.backerUserIds(gb.id);
          await notifyMany(notificationRepo, backers, {
            type: 'deadline_soon',
            title: '후원하신 프로젝트 마감이 임박했어요',
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
          logger.info({ fundId: gb.id, backers: backers.length }, '마감 임박 알림 발송');
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
        const success = gb.currentQuantity >= gb.targetQuantity;
        // 상태 전환 전에 후원자 목록을 미리 확보(전환 로직이 참여를 취소할 수 있으므로).
        const backers = this.notify ? await this.notify.rewardOrderRepo.backerUserIds(gb.id) : [];

        if (success) {
          logger.info({ groupbuyId: gb.id }, '목표 달성 — 일괄 결제 실행');
          await this.paymentService.executeBatchPayments(gb.id);
        } else {
          logger.info({ groupbuyId: gb.id }, '목표 미달 — 공동구매 실패 처리');
          await this.paymentService.markGroupBuyFailed(gb.id);
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
            await notifyMany(notificationRepo, backers, {
              type: 'backed_success',
              title: '후원하신 프로젝트가 성공했어요',
              body: `'${gb.title}' 프로젝트가 목표를 달성했어요.`,
              fundId: gb.id,
            });
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
