import type { Request, Response } from 'express';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

/**
 * GET /api/me/funds — 내가 개설한 펀드(전 상태: pending/open/rejected/...).
 * 공개목록(GET /api/groupbuys)은 open 만 노출하므로, 창작자가 자신의 심사중/반려 펀드를 보려면 이 엔드포인트 사용.
 */
export function createMeFundsHandler(groupBuyRepo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      const { items } = await groupBuyRepo.list({ creatorId: userId, sort: 'latest', limit: 100, offset: 0 });
      const funds = items.map((g) => {
        const rate = g.targetQuantity > 0 ? Math.round((g.currentQuantity / g.targetQuantity) * 100) : 0;
        return {
          id: g.id,
          title: g.title,
          category: g.category ?? null,
          status: g.status,
          imageUrl: (g as { imageUrl?: string | null }).imageUrl ?? null,
          targetQuantity: g.targetQuantity,
          currentQuantity: g.currentQuantity,
          achievementRate: rate,
          finalPrice: g.finalPrice,
          deadline: g.deadline,
          createdAt: g.createdAt,
        };
      });
      res.json({ items: funds });
    } catch (err) {
      logger.error({ err, userId }, '내 펀드 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
