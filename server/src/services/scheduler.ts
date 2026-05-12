import type { PaymentService } from '../interfaces/payment-service.js';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { OrderRepository } from '../repositories/order-repository.js';
import type { DistributedLockProvider } from './distributed-lock.js';
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

export class PaymentScheduler {
  private readonly config: SchedulerConfig;
  private readonly paymentService: PaymentService;
  private readonly groupBuyRepo: GroupBuyRepository;
  private readonly orderRepo: OrderRepository;
  private readonly lockProvider: DistributedLockProvider;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(
    paymentService: PaymentService,
    groupBuyRepo: GroupBuyRepository,
    orderRepo: OrderRepository,
    lockProvider: DistributedLockProvider,
    config?: Partial<SchedulerConfig>,
  ) {
    this.paymentService = paymentService;
    this.groupBuyRepo = groupBuyRepo;
    this.orderRepo = orderRepo;
    this.lockProvider = lockProvider;
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
      await this.processExpiredGroupBuys();
      await this.processRetries();
    } catch (err) {
      logger.error({ err }, '스케줄러: 처리 중 오류 발생');
    } finally {
      this.isRunning = false;
      await lock.release();
    }
  }

  private async processExpiredGroupBuys(): Promise<void> {
    const now = new Date();
    const expiredGroupBuys = await this.groupBuyRepo.findExpiredOpen(now);

    for (const gb of expiredGroupBuys) {
      try {
        if (gb.currentQuantity >= gb.targetQuantity) {
          logger.info({ groupbuyId: gb.id }, '목표 달성 — 일괄 결제 실행');
          await this.paymentService.executeBatchPayments(gb.id);
        } else {
          logger.info({ groupbuyId: gb.id }, '목표 미달 — 공동구매 실패 처리');
          await this.paymentService.markGroupBuyFailed(gb.id);
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
