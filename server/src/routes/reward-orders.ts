import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { AddressRepository } from '../repositories/address-repository.js';
import type { PgRewardOrderRepository } from '../repositories/pg-reward-order-repository.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { notify } from '../services/notify.js';
import { logger } from '../logger.js';

// 무통장입금 계좌 — 운영 시 env 로 주입. 미설정 시 안내용 placeholder.
function depositAccount() {
  return {
    bank: process.env.DEPOSIT_BANK ?? '국민은행',
    account: process.env.DEPOSIT_ACCOUNT ?? '000000-00-000000',
    holder: process.env.DEPOSIT_HOLDER ?? '두띵(주)',
  };
}

/** POST /api/funds/:id/back — 리워드 후원(무통장입금) 신청. 로그인+배송지 필수. */
export function createBackingHandler(
  groupBuyRepo: GroupBuyRepository,
  rewardOrderRepo: PgRewardOrderRepository,
  addressRepo: AddressRepository,
  notificationRepo?: NotificationRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const rewardTierId = typeof body.rewardTierId === 'string' ? body.rewardTierId : '';
    const addressId = typeof body.addressId === 'string' ? body.addressId : '';
    const depositorName = typeof body.depositorName === 'string' ? body.depositorName.trim().slice(0, 50) : '';

    try {
      const fund = await groupBuyRepo.findById(req.params.id);
      if (!fund) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '펀드를 찾을 수 없습니다' }); return; }
      if (fund.status !== 'open') {
        res.status(409).json({ error: 'NOT_OPEN', message: '진행 중(공개)인 펀드만 후원할 수 있습니다' }); return;
      }
      const tier = (fund.rewardTiers ?? []).find((t) => t.id === rewardTierId);
      if (!tier) { res.status(400).json({ error: 'INVALID_REWARD', message: '리워드를 선택해 주세요' }); return; }

      // 배송지 게이팅 — 본인 소유 배송지 필수
      if (!addressId) { res.status(400).json({ error: 'ADDRESS_REQUIRED', message: '배송지를 먼저 등록·선택해 주세요' }); return; }
      const addr = await addressRepo.findById(addressId);
      if (!addr || addr.userId !== userId) {
        res.status(400).json({ error: 'INVALID_ADDRESS', message: '유효한 배송지를 선택해 주세요' }); return;
      }

      // 재고(한정수량) 체크 + INSERT 를 한 트랜잭션으로 원자 처리 — 동시 후원 시 초과판매(TOCTOU) 방지.
      // (이전엔 confirmedCountForTier 별도 SELECT 후 create 라 동시 요청이 모두 통과해 한도 초과 가능)
      const order = await rewardOrderRepo.createWithStockGuard({
        id: randomUUID(),
        fundId: fund.id,
        rewardTierId: tier.id,
        rewardTitle: tier.title,
        userId,
        addressId,
        depositorName: depositorName || null,
        amount: tier.price,
        status: 'awaiting_deposit',
        createdAt: new Date(),
        confirmedAt: null,
      }, tier.stockLimit ?? null);

      if (!order) {
        res.status(409).json({ error: 'SOLD_OUT', message: '해당 리워드가 마감되었습니다' }); return;
      }

      logger.info({ orderId: order.id, userId, fundId: fund.id, amount: order.amount }, '리워드 후원 신청(입금대기)');

      // 알림(best-effort) — (a) 후원자 본인 접수, (b) 펀드 창작자에게 새 후원자.
      if (notificationRepo) {
        await notify(notificationRepo, {
          userId,
          type: 'backed',
          title: '후원이 접수되었습니다',
          body: `'${fund.title}' 프로젝트 후원이 접수되었어요. 입금이 확인되면 확정됩니다.`,
          fundId: fund.id,
        });
        if (fund.creatorId && fund.creatorId !== userId) {
          await notify(notificationRepo, {
            userId: fund.creatorId,
            type: 'new_backer',
            title: '새로운 후원자가 참여했어요',
            body: `'${fund.title}' 프로젝트에 새 후원이 들어왔어요.`,
            fundId: fund.id,
          });
        }
      }

      res.status(201).json({ orderId: order.id, amount: order.amount, deposit: depositAccount() });
    } catch (err) {
      logger.error({ err, userId }, '리워드 후원 신청 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/me/backings — 내 후원 내역 */
export function createMyBackingsHandler(rewardOrderRepo: PgRewardOrderRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      const items = await rewardOrderRepo.listByUser(userId);
      res.json({ items, deposit: depositAccount() });
    } catch (err) {
      logger.error({ err, userId }, '내 후원 내역 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/me/backings/:orderId/report — 입금자명 보고 */
export function createReportDepositorHandler(rewardOrderRepo: PgRewardOrderRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const depositorName = typeof req.body?.depositorName === 'string' ? req.body.depositorName.trim().slice(0, 50) : '';
    if (!depositorName) { res.status(400).json({ error: 'MISSING', message: '입금자명을 입력해 주세요' }); return; }
    try {
      const ok = await rewardOrderRepo.reportDepositor(req.params.orderId, userId, depositorName);
      if (!ok) { res.status(409).json({ error: 'INVALID_STATE', message: '입금 대기 상태의 본인 주문만 보고할 수 있습니다' }); return; }
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, userId }, '입금자명 보고 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/admin/deposits?status= — 관리자 입금 대기/내역 */
export function createAdminDepositsListHandler(rewardOrderRepo: PgRewardOrderRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const status = (req.query.status as string | undefined) === 'confirmed' ? 'confirmed' : 'awaiting_deposit';
    try {
      const items = await rewardOrderRepo.listByStatus(status);
      res.json({ items });
    } catch (err) {
      logger.error({ err }, '관리자 입금 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/admin/deposits/:id/confirm — 입금 확인 → 참여 확정 */
export function createAdminConfirmDepositHandler(
  rewardOrderRepo: PgRewardOrderRepository,
  groupBuyRepo?: GroupBuyRepository,
  notificationRepo?: NotificationRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const order = await rewardOrderRepo.confirm(req.params.id);
      if (!order) { res.status(409).json({ error: 'INVALID_STATE', message: '입금 대기 상태의 주문만 확인할 수 있습니다' }); return; }
      logger.info({ orderId: order.id, adminId: req.userId }, '관리자 입금 확인 → 참여 확정');

      // 알림(best-effort) — 후원자에게 입금 확인 통지. 펀드 제목은 있으면 포함(없어도 무해).
      if (notificationRepo && order.userId) {
        let fundTitle: string | null = null;
        try { fundTitle = (await groupBuyRepo?.findById(order.fundId))?.title ?? null; } catch { /* 제목 조회 실패는 무시 */ }
        await notify(notificationRepo, {
          userId: order.userId,
          type: 'deposit_confirmed',
          title: '입금이 확인되었습니다',
          body: fundTitle
            ? `'${fundTitle}' 프로젝트 후원 입금이 확인되어 참여가 확정되었습니다.`
            : '후원 입금이 확인되어 참여가 확정되었습니다.',
          fundId: order.fundId,
        });
      }

      res.json({ id: order.id, status: 'confirmed' });
    } catch (err) {
      logger.error({ err, id: req.params.id }, '입금 확인 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
