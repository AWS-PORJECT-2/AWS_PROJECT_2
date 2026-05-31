import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { AddressRepository } from '../repositories/address-repository.js';
import type { PaymentMethodRepository } from '../repositories/payment-method-repository.js';
import type { PgRewardOrderRepository } from '../repositories/pg-reward-order-repository.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { notify } from '../services/notify.js';
import { logger } from '../logger.js';

// 무통장입금 계좌 — 구주문(awaiting_deposit) 내역 표시 호환용으로만 유지. 신규 후원은 사용 안 함.
function depositAccount() {
  return {
    bank: process.env.DEPOSIT_BANK ?? '국민은행',
    account: process.env.DEPOSIT_ACCOUNT ?? '000000-00-000000',
    holder: process.env.DEPOSIT_HOLDER ?? '두띵(주)',
  };
}

/**
 * POST /api/funds/:id/back — 리워드 후원(예약, 텀블벅식). 로그인 + 배송지 + 결제수단 필수.
 *  - 후원 = 예약(pledged): 청구는 마감 성공 시 스케줄러가 모의결제로 순차 진행.
 *  - 예약 즉시 목표 수량에 반영(current_quantity + 티어 soldCount +1).
 */
export function createBackingHandler(
  groupBuyRepo: GroupBuyRepository,
  rewardOrderRepo: PgRewardOrderRepository,
  addressRepo: AddressRepository,
  paymentMethodRepo: PaymentMethodRepository,
  notificationRepo?: NotificationRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    // 리워드 식별자 — 문자열 id 또는 숫자 인덱스(구버전 티어는 id 가 없어 인덱스로 옴) 모두 수용.
    const rewardTierId = (typeof body.rewardTierId === 'string' || typeof body.rewardTierId === 'number')
      ? String(body.rewardTierId) : '';
    const addressId = typeof body.addressId === 'string' ? body.addressId : '';
    const depositorName = typeof body.depositorName === 'string' ? body.depositorName.trim().slice(0, 50) : '';

    try {
      const fund = await groupBuyRepo.findById(req.params.id);
      if (!fund) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '펀드를 찾을 수 없습니다' }); return; }
      if (fund.status !== 'open') {
        res.status(409).json({ error: 'NOT_OPEN', message: '진행 중(공개)인 펀드만 후원할 수 있습니다' }); return;
      }
      // 티어 매칭 — id 우선, 구버전 데이터(티어에 id 없음)는 인덱스로 폴백.
      const tiers = fund.rewardTiers ?? [];
      let tier = tiers.find((t) => t.id != null && String(t.id) === rewardTierId);
      if (!tier && /^\d+$/.test(rewardTierId)) {
        const idx = Number(rewardTierId);
        if (idx >= 0 && idx < tiers.length) tier = tiers[idx];
      }
      if (!tier) { res.status(400).json({ error: 'INVALID_REWARD', message: '리워드를 선택해 주세요' }); return; }
      // 주문 기록·재고 카운트에 쓸 안정 키 — id 있으면 id, 없으면 인덱스 문자열.
      const resolvedTierId = tier.id != null ? String(tier.id) : rewardTierId;

      // 배송지 게이팅 — 본인 소유 배송지 필수
      if (!addressId) { res.status(400).json({ error: 'ADDRESS_REQUIRED', message: '배송지를 먼저 등록·선택해 주세요' }); return; }
      const addr = await addressRepo.findById(addressId);
      if (!addr || addr.userId !== userId) {
        res.status(400).json({ error: 'INVALID_ADDRESS', message: '유효한 배송지를 선택해 주세요' }); return;
      }

      // 결제수단 게이팅 — 마감 성공 시 자동결제하므로 등록된(ACTIVE) 카드/계좌가 반드시 있어야 후원 가능.
      const methods = await paymentMethodRepo.list(userId);
      if (!methods || methods.length === 0) {
        res.status(400).json({ error: 'PAYMENT_METHOD_REQUIRED', message: '결제수단(카드/계좌)을 먼저 등록해 주세요' });
        return;
      }

      // 1인 1펀딩 사전 검사(빠른 차단) — 같은 펀드에 이미 활성 주문이 있으면 즉시 409.
      //  (경합 안전성은 createWithStockGuard 트랜잭션 내 재검사로 최종 보장.)
      const existing = await rewardOrderRepo.findActiveByUserFund(userId, fund.id);
      if (existing) {
        res.status(409).json({ error: 'ALREADY_BACKED', message: '이미 이 프로젝트에 참여 중이에요. 펀딩을 변경하거나 취소한 뒤 다시 참여할 수 있어요.' });
        return;
      }

      // 재고(한정수량) 체크 + 1인1펀딩 재검사 + INSERT 를 한 트랜잭션으로 원자 처리 — 동시 후원 시 초과판매(TOCTOU)·중복 방지.
      // (이전엔 confirmedCountForTier 별도 SELECT 후 create 라 동시 요청이 모두 통과해 한도 초과 가능)
      const result = await rewardOrderRepo.createWithStockGuard({
        id: randomUUID(),
        fundId: fund.id,
        rewardTierId: resolvedTierId,
        rewardTitle: tier.title,
        userId,
        addressId,
        depositorName: depositorName || null,
        amount: tier.price,
        status: 'pledged',
        createdAt: new Date(),
        confirmedAt: null,
      }, tier.stockLimit ?? null);

      if ('error' in result) {
        if (result.error === 'ALREADY_BACKED') {
          res.status(409).json({ error: 'ALREADY_BACKED', message: '이미 이 프로젝트에 참여 중이에요. 펀딩을 변경하거나 취소한 뒤 다시 참여할 수 있어요.' });
          return;
        }
        res.status(409).json({ error: 'SOLD_OUT', message: '해당 리워드가 마감되었습니다' }); return;
      }
      const order = result;

      logger.info({ orderId: order.id, userId, fundId: fund.id, amount: order.amount }, '리워드 후원 예약(pledged)');

      // 알림(best-effort) — (a) 후원자 본인 예약 접수, (b) 펀드 창작자에게 새 후원자.
      if (notificationRepo) {
        await notify(notificationRepo, {
          userId,
          type: 'backed',
          title: '후원이 예약되었어요',
          body: `'${fund.title}' 프로젝트 후원이 예약되었어요. 목표 달성 시 마감 다음날부터 결제가 진행돼요.`,
          fundId: fund.id,
        });
        if (fund.creatorId && fund.creatorId !== userId) {
          await notify(notificationRepo, {
            userId: fund.creatorId,
            type: 'new_backer',
            title: '새로운 후원자가 참여했어요',
            body: `'${fund.title}' 프로젝트에 새 후원 예약이 들어왔어요.`,
            fundId: fund.id,
          });
        }
      }

      res.status(201).json({
        orderId: order.id,
        amount: order.amount,
        status: 'pledged',
        chargeNote: '마감일 다음날부터 순차 결제될 예정이에요(목표 달성 시).',
      });
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

/**
 * GET /api/me/orders — 내 후원(주문) 목록(취소 신청 UI 용 경량 형태).
 * (GET /api/me/backings 와 동일 데이터지만 프론트 주문/취소 화면용 슬림 필드.)
 */
export function createMyOrdersHandler(rewardOrderRepo: PgRewardOrderRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      const rows = await rewardOrderRepo.listByUser(userId);
      const items = rows.map((o) => ({
        id: o.id,
        fundId: o.fundId,
        fundTitle: o.fundTitle,
        rewardTitle: o.rewardTitle,
        amount: o.amount,
        status: o.status,
        createdAt: o.createdAt,
      }));
      res.json({ items });
    } catch (err) {
      logger.error({ err, userId }, '내 주문 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * POST /api/me/orders/:id/change — 펀딩(리워드) 변경. 본인 소유 + status='pledged' 인 주문의 리워드만 교체.
 *  - body { rewardTierId } — 새 티어를 fund.rewardTiers 에서 매칭(id 우선·인덱스 폴백, 배치17과 동일).
 *  - 새 티어 재고 초과면 409 SOLD_OUT. 수량은 1개 그대로(티어만 변경)라 current_quantity 불변, 티어별 soldCount 만 조정.
 *  - status!='pledged' → 409 INVALID_STATE(결제완료 후엔 변경 불가, 취소 후 재참여 안내).
 *  - 본인 소유 아님/없음 → 0행 → 409(IDOR 비노출).
 */
export function createOrderChangeHandler(
  rewardOrderRepo: PgRewardOrderRepository,
  groupBuyRepo: GroupBuyRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const rewardTierId = (typeof body.rewardTierId === 'string' || typeof body.rewardTierId === 'number')
      ? String(body.rewardTierId) : '';
    if (!rewardTierId) { res.status(400).json({ error: 'INVALID_REWARD', message: '변경할 리워드를 선택해 주세요' }); return; }

    try {
      // 변경 대상 주문 — 본인 소유 확인은 changeReward 트랜잭션 내에서(0행 → 409). 여기선 fundId 만 알면 됨.
      const order = await rewardOrderRepo.findById(req.params.id);
      if (!order || order.userId !== userId) {
        // IDOR 비노출 — 존재/소유 여부를 INVALID_STATE 로 통일.
        res.status(409).json({ error: 'INVALID_STATE', message: '변경할 수 없는 주문입니다(본인 펀딩 예약만 변경 가능).' });
        return;
      }

      const fund = await groupBuyRepo.findById(order.fundId);
      if (!fund) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '펀드를 찾을 수 없습니다' }); return; }

      // 새 티어 매칭 — id 우선, 구버전 데이터(티어에 id 없음)는 인덱스로 폴백(배치17 로직 재사용).
      const tiers = fund.rewardTiers ?? [];
      let tier = tiers.find((t) => t.id != null && String(t.id) === rewardTierId);
      if (!tier && /^\d+$/.test(rewardTierId)) {
        const idx = Number(rewardTierId);
        if (idx >= 0 && idx < tiers.length) tier = tiers[idx];
      }
      if (!tier) { res.status(400).json({ error: 'INVALID_REWARD', message: '리워드를 선택해 주세요' }); return; }
      const resolvedTierId = tier.id != null ? String(tier.id) : rewardTierId;

      const result = await rewardOrderRepo.changeReward(
        req.params.id, userId, resolvedTierId, tier.title, tier.price, order.rewardTierId, tier.stockLimit ?? null,
      );
      if (!result.ok) {
        if (result.code === 'SOLD_OUT') { res.status(409).json({ error: 'SOLD_OUT', message: '변경하려는 리워드가 마감되었습니다' }); return; }
        if (result.code === 'INVALID_STATE') {
          res.status(409).json({ error: 'INVALID_STATE', message: '예약(결제 전) 상태의 펀딩만 변경할 수 있어요. 결제 완료 후에는 취소 후 다시 참여해 주세요.' });
          return;
        }
        // NOT_FOUND — 동시성으로 사라졌거나 소유 불일치. IDOR 비노출.
        res.status(409).json({ error: 'INVALID_STATE', message: '변경할 수 없는 주문입니다(본인 펀딩 예약만 변경 가능).' });
        return;
      }

      logger.info({ orderId: result.order.id, userId, fundId: order.fundId, newTierId: resolvedTierId }, '펀딩 리워드 변경');
      res.json({
        ok: true,
        orderId: result.order.id,
        rewardTierId: result.order.rewardTierId,
        rewardTitle: result.order.rewardTitle,
        amount: result.order.amount,
        status: result.order.status,
      });
    } catch (err) {
      logger.error({ err, userId, id: req.params.id }, '펀딩 변경 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * POST /api/me/orders/:id/cancel-request — 사용자가 본인 펀딩(주문) 취소.
 *  - 캠페인 중(pledged): 텀블벅식 자유 취소 → 즉시 self-cancel(status='cancelled', 수량/soldCount -1, 환불 불필요).
 *  - 결제 완료(paid) 또는 구 무통장(awaiting_deposit/confirmed): 배치17 흐름 → cancel_requested(관리자 환불 후 취소).
 * 둘 다 본인 소유가 아니거나 취소 불가 상태면 409(IDOR 방지 — 존재 여부 비노출).
 */
export function createOrderCancelRequestHandler(
  rewardOrderRepo: PgRewardOrderRepository,
  groupBuyRepo?: GroupBuyRepository,
  notificationRepo?: NotificationRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : null;
    try {
      // 1) 캠페인 중(pledged) 즉시 자기취소 시도(환불 없음). 대상이면 바로 cancelled.
      const selfCancelled = await rewardOrderRepo.cancelPledgedByUser(req.params.id, userId, reason || null);
      if (selfCancelled) {
        logger.info({ orderId: selfCancelled.id, userId }, '펀딩 예약 즉시 취소(pledged → cancelled)');
        res.json({ ok: true, status: selfCancelled.status });
        return;
      }

      // 2) 결제완료(paid)/구 무통장 → 배치17 환불 플로우(cancel_requested).
      const order = await rewardOrderRepo.requestCancel(req.params.id, userId, reason || null);
      if (!order) {
        res.status(409).json({ error: 'INVALID_STATE', message: '취소 신청할 수 없는 주문입니다(이미 취소 요청했거나 처리된 주문일 수 있어요).' });
        return;
      }
      logger.info({ orderId: order.id, userId }, '펀딩 주문 취소 신청(환불 대기)');

      // 알림(best-effort) — 펀드 창작자에게 취소 신청 통지.
      if (notificationRepo && groupBuyRepo) {
        try {
          const fund = await groupBuyRepo.findById(order.fundId);
          if (fund?.creatorId && fund.creatorId !== userId) {
            await notify(notificationRepo, {
              userId: fund.creatorId,
              type: 'new_backer',
              title: '후원 취소 신청이 접수되었어요',
              body: `'${fund.title}' 프로젝트에 후원 취소 신청이 들어왔어요. 관리자 확인 후 처리됩니다.`,
              fundId: order.fundId,
            });
          }
        } catch { /* 알림 실패는 무시 */ }
      }

      res.json({ ok: true, status: order.status });
    } catch (err) {
      logger.error({ err, userId, id: req.params.id }, '펀딩 취소 신청 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/admin/order-cancel-requests — 취소 신청된 주문 목록(관리자). */
export function createAdminOrderCancelRequestsHandler(rewardOrderRepo: PgRewardOrderRepository) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const rows = await rewardOrderRepo.listCancelRequests();
      const items = rows.map((o) => ({
        id: o.id,
        fundId: o.fundId,
        fundTitle: o.fundTitle,
        userNickname: o.userNickname ?? null, // 닉네임만 노출(개인정보 최소화)
        rewardTitle: o.rewardTitle,
        amount: o.amount,
        // 취소요청 전 confirmed 였는지: confirmed_at(=confirmedAt) 유무로 추정.
        originalStatus: o.confirmedAt ? 'confirmed' : 'awaiting_deposit',
        refunded: o.refundedAt != null,
        cancelReason: o.cancelReason ?? null,
        requestedAt: o.cancelRequestedAt ?? null,
      }));
      res.json({ items });
    } catch (err) {
      logger.error({ err }, '취소 신청 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * POST /api/admin/orders/:id/refund — 관리자 환불 표시 (#4).
 * confirmed 였던(confirmed_at 있음) 주문에 refunded_at 기록(실제 송금은 외부). 멱등.
 * 미입금 건이면 환불 대상 아님 → 409.
 */
export function createAdminOrderRefundHandler(rewardOrderRepo: PgRewardOrderRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const order = await rewardOrderRepo.markRefunded(req.params.id);
      if (!order) {
        res.status(409).json({ error: 'NOT_REFUNDABLE', message: '환불할 수 없는 주문입니다(미입금이거나 이미 취소·완료된 주문).' });
        return;
      }
      logger.info({ orderId: order.id, adminId: req.userId }, '관리자 환불 표시');
      res.json({ ok: true, id: order.id, status: order.status, refundedAt: order.refundedAt });
    } catch (err) {
      logger.error({ err, id: req.params.id }, '관리자 환불 표시 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * POST /api/admin/orders/:id/cancel — 관리자 최종 취소 (#4).
 * confirmed 였던 건은 환불표시(refunded_at) 선행 필수(없으면 409 REFUND_REQUIRED) → 'refunded' + 재고 복구.
 * 미입금 건은 환불 없이 'cancelled'. 이미 취소/환불된 건은 409.
 */
export function createAdminOrderCancelHandler(
  rewardOrderRepo: PgRewardOrderRepository,
  groupBuyRepo?: GroupBuyRepository,
  notificationRepo?: NotificationRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await rewardOrderRepo.adminCancel(req.params.id);
      if (!result.ok) {
        if (result.code === 'NOT_FOUND') { res.status(404).json({ error: 'NOT_FOUND', message: '주문을 찾을 수 없습니다' }); return; }
        if (result.code === 'REFUND_REQUIRED') {
          res.status(409).json({ error: 'REFUND_REQUIRED', message: '입금이 확정된 후원입니다. 먼저 환불 처리(환불 버튼) 후 취소할 수 있어요.' });
          return;
        }
        res.status(409).json({ error: 'INVALID_STATE', message: '이미 취소·환불된 주문입니다.' });
        return;
      }
      const order = result.order;
      logger.info({ orderId: order.id, adminId: req.userId, status: order.status }, '관리자 주문 취소 완료');

      // 알림(best-effort) — 후원자에게 취소 완료 통지.
      if (notificationRepo && order.userId) {
        let fundTitle: string | null = null;
        try { fundTitle = (await groupBuyRepo?.findById(order.fundId))?.title ?? null; } catch { /* 무시 */ }
        await notify(notificationRepo, {
          userId: order.userId,
          type: 'order_cancelled',
          title: '펀딩이 취소되었어요',
          body: fundTitle
            ? `'${fundTitle}' 프로젝트 후원이 취소 처리되었습니다.${result.wasConfirmed ? ' 환불이 진행됩니다.' : ''}`
            : `후원이 취소 처리되었습니다.${result.wasConfirmed ? ' 환불이 진행됩니다.' : ''}`,
          fundId: order.fundId,
        });
      }

      res.json({ ok: true, id: order.id, status: order.status });
    } catch (err) {
      logger.error({ err, id: req.params.id }, '관리자 주문 취소 실패');
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
