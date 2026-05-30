import type { Request, Response, NextFunction } from 'express';
import type { PaymentService } from '../interfaces/payment-service.js';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import { AppError } from '../errors/app-error.js';
import { notify } from '../services/notify.js';

export function createGroupBuyParticipateHandler(
  paymentService: PaymentService,
  notificationRepo?: NotificationRepository,
  groupBuyRepo?: GroupBuyRepository,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new AppError('NOT_AUTHENTICATED');
      }

      const groupbuyId = req.params.id;
      if (!groupbuyId) {
        throw new AppError('MISSING_REQUIRED_FIELD', 'groupbuyId가 필요합니다');
      }

      const body = req.body as Record<string, unknown>;
      const cardInfo = body.cardInfo as Record<string, unknown> | undefined;
      const selectedOptions = body.selectedOptions as Record<string, string> | undefined;
      const quantity = body.quantity as number | undefined;

      if (!cardInfo || !selectedOptions || !quantity || quantity < 1) {
        throw new AppError('MISSING_REQUIRED_FIELD', 'cardInfo, selectedOptions, quantity가 필요합니다');
      }

      const result = await paymentService.participate(userId, groupbuyId, {
        cardInfo: cardInfo as any,
        selectedOptions,
        quantity,
      });

      // 알림(best-effort) — (a) 후원자 본인 접수, (b) 펀드 창작자에게 새 후원자.
      if (notificationRepo) {
        const fund = groupBuyRepo ? await groupBuyRepo.findById(groupbuyId).catch(() => null) : null;
        const title = fund?.title ?? '프로젝트';
        await notify(notificationRepo, {
          userId,
          type: 'backed',
          title: '후원이 접수되었습니다',
          body: `'${title}' 후원이 접수되었어요.`,
          fundId: groupbuyId,
        });
        if (fund?.creatorId && fund.creatorId !== userId) {
          await notify(notificationRepo, {
            userId: fund.creatorId,
            type: 'new_backer',
            title: '새로운 후원자가 참여했어요',
            body: `'${title}' 프로젝트에 새 후원이 들어왔어요.`,
            fundId: groupbuyId,
          });
        }
      }

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };
}
