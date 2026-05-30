import type { Request, Response } from 'express';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

/**
 * 관리자 펀드 심사 핸들러.
 * authRequired + requireAdmin 뒤에 마운트.
 *   GET  /api/admin/funds?status=pending  심사 대기/상태별 목록
 *   POST /api/admin/funds/:id/approve      승인 → status 'open'(공개)
 *   POST /api/admin/funds/:id/reject       반려 → status 'rejected'
 */
export function createAdminFundsListHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const status = (req.query.status as string | undefined)?.trim() || 'pending';
    try {
      const { items, total } = await repo.list({ status, sort: 'latest', limit: 100, offset: 0 });
      const funds = items.map((g) => ({
        id: g.id,
        title: g.title,
        category: g.category ?? null,
        status: g.status,
        creatorId: g.creatorId,
        authorName: (g as { authorName?: string | null }).authorName ?? null,
        imageUrl: (g as { imageUrl?: string | null }).imageUrl ?? null,
        targetQuantity: g.targetQuantity,
        finalPrice: g.finalPrice,
        deadline: g.deadline,
        createdAt: g.createdAt,
      }));
      res.json({ items: funds, total });
    } catch (err) {
      logger.error({ err }, '관리자 펀드 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

function createReviewHandler(repo: GroupBuyRepository, next: 'open' | 'rejected', label: string) {
  return async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    try {
      const fund = await repo.findById(id);
      if (!fund) {
        res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '펀드를 찾을 수 없습니다' });
        return;
      }
      if (fund.status !== 'pending') {
        res.status(409).json({ error: 'INVALID_STATE', message: `심사 대기(pending) 상태만 ${label}할 수 있습니다 (현재: ${fund.status})` });
        return;
      }
      await repo.updateStatus(id, next);
      logger.info({ id, adminId: req.userId, next }, `관리자 펀드 ${label}`);
      res.json({ id, status: next });
    } catch (err) {
      logger.error({ err, id }, `관리자 펀드 ${label} 실패`);
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

export const createAdminFundApproveHandler = (repo: GroupBuyRepository) => createReviewHandler(repo, 'open', '승인');
export const createAdminFundRejectHandler = (repo: GroupBuyRepository) => createReviewHandler(repo, 'rejected', '반려');

/** GET /api/admin/fund-delete-requests — 삭제 요청된 펀드 목록 */
export function createAdminDeleteRequestsHandler(repo: GroupBuyRepository) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({ items: await repo.listDeleteRequests() });
    } catch (err) {
      logger.error({ err }, '삭제 요청 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * POST /api/admin/funds/:id/delete — 펀드 삭제 처리 + 후원 취소/환불 안내.
 * confirmed(입금완료) 후원은 실제 송금 환불이 필요하므로 목록으로 반환.
 */
export function createAdminFundDeleteHandler(
  repo: GroupBuyRepository,
  rewardOrderRepo: { cancelAllForFund: (fundId: string) => Promise<{ refundable: unknown[]; cancelledCount: number }> },
) {
  return async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    try {
      const fund = await repo.findById(id);
      if (!fund) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '펀드를 찾을 수 없습니다' }); return; }
      const result = await rewardOrderRepo.cancelAllForFund(id);
      await repo.cancelFund(id);
      logger.info({ id, adminId: req.userId, cancelled: result.cancelledCount, refundable: result.refundable.length }, '관리자 펀드 삭제 처리');
      res.json({ id, status: 'cancelled', cancelledBackings: result.cancelledCount, refundable: result.refundable });
    } catch (err) {
      logger.error({ err, id }, '펀드 삭제 처리 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
