import type { EarnReason, SpendReason } from '../types/index.js';
import { EARN_AMOUNTS, REASON_LABEL, SPEND_COSTS } from '../types/index.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import type { PointRepository } from '../repositories/point-repository.js';
import type {
  PointAdminResult, PointEarnResult, PointRefundResult, PointService, PointSpendResult,
} from '../interfaces/point-service.js';
import { AppError } from '../errors/app-error.js';
import { notify } from './notify.js';

interface PointServiceDeps {
  pointRepo: PointRepository;
  notificationRepo: NotificationRepository;
}

/**
 * 포인트 서비스 구현. (045_point_system)
 * 잔액 변동은 저장소 트랜잭션에 위임하고, 트랜잭션이 끝난 뒤 best-effort 로 알림을 발송한다.
 *   알림은 notify() 가 try/catch 로 흡수하므로 절대 throw 하지 않으며, 실제 변동이 일어난 경우에만 보낸다.
 */
export class PointServiceImpl implements PointService {
  private readonly pointRepo: PointRepository;
  private readonly notificationRepo: NotificationRepository;

  constructor({ pointRepo, notificationRepo }: PointServiceDeps) {
    this.pointRepo = pointRepo;
    this.notificationRepo = notificationRepo;
  }

  async earnOnce(userId: string, reason: EarnReason): Promise<PointEarnResult> {
    const result = await this.pointRepo.earnOnce(userId, reason);
    if (result.created) {
      const amount = EARN_AMOUNTS[reason];
      await notify(this.notificationRepo, {
        userId,
        type: 'point_earn',
        title: '포인트 적립',
        body: `${REASON_LABEL[reason]}(으)로 ${amount}포인트가 적립되었습니다.`,
      });
    }
    return { balanceAfter: result.balanceAfter };
  }

  async spend(userId: string, reason: SpendReason, cost: number, requestId?: string): Promise<PointSpendResult> {
    // 클라이언트가 보낸 비용이 서버 정가와 일치하는지 검증(가격 위변조 방지).
    if (cost !== SPEND_COSTS[reason]) {
      throw new AppError('PRICE_MISMATCH');
    }
    const result = await this.pointRepo.spend(userId, reason, cost, requestId);
    // 실제 차감이 새로 일어났을 때만 알림(멱등 재요청이면 created=false 라 중복 알림을 보내지 않음).
    if (result.ok && result.created) {
      await notify(this.notificationRepo, {
        userId,
        type: 'point_spend',
        title: '포인트 차감',
        body: `${REASON_LABEL[reason]}(으)로 ${cost}포인트가 차감되었습니다.`,
      });
    }
    return { ok: result.ok, balanceAfter: result.balanceAfter, transaction: result.transaction };
  }

  async refund(userId: string, reason: SpendReason, amount: number): Promise<PointRefundResult> {
    const result = await this.pointRepo.refund(userId, reason, amount);
    await notify(this.notificationRepo, {
      userId,
      type: 'point_earn',
      title: '포인트 환불',
      body: `${REASON_LABEL[reason]}(으)로 ${amount}포인트가 환불되었습니다.`,
    });
    return { balanceAfter: result.balanceAfter, transaction: result.transaction };
  }

  async adminAdjust(userId: string, delta: number, note: string): Promise<PointAdminResult> {
    const result = await this.pointRepo.adminAdjust(userId, delta);
    // 실제 변동이 일어난 경우(no-op/거부가 아닌 경우)에만 알림.
    if (result.ok && result.transaction) {
      await notify(this.notificationRepo, {
        userId,
        type: 'point_admin_adjust',
        title: '관리자 포인트 조정',
        body: `${REASON_LABEL['admin_adjust']}: ${delta > 0 ? '+' : ''}${delta}포인트 (${note})`,
      });
    }
    return result;
  }

  async adminSetBalance(userId: string, target: number, note: string): Promise<PointAdminResult> {
    const result = await this.pointRepo.adminSetBalance(userId, target);
    if (result.ok && result.transaction) {
      await notify(this.notificationRepo, {
        userId,
        type: 'point_admin_adjust',
        title: '관리자 포인트 조정',
        body: `${REASON_LABEL['admin_adjust']}: 잔액을 ${result.balanceAfter}포인트로 설정했습니다 (${note})`,
      });
    }
    return result;
  }

  async getBalance(userId: string): Promise<number> {
    return this.pointRepo.getBalance(userId);
  }

  async getTransactions(userId: string, limit: number, offset: number) {
    return this.pointRepo.getTransactions(userId, limit, offset);
  }
}
