import type { Request, Response } from 'express';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import { logger } from '../logger.js';

/**
 * GET /api/groupbuys - 공동구매(상품) 목록 조회
 * Query:
 *   - category : '과잠' | '반팔티' | '에코백' | 'all'
 *   - sort     : 'popular' | 'latest'
 *   - q        : 검색 키워드
 *   - page     : 페이지 번호 (1부터)
 *   - limit    : 페이지 크기 (기본 20, 최대 100)
 */
export function createGroupBuysListHandler(groupBuyRepo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const offset = (page - 1) * limit;

      const category = (req.query.category as string | undefined) ?? undefined;
      const sortRaw = (req.query.sort as string | undefined) ?? undefined;
      const sort = sortRaw === 'latest' ? 'latest' : 'popular';
      const q = (req.query.q as string | undefined)?.trim() || undefined;

      const { items, total } = await groupBuyRepo.list({ category, sort, q, limit, offset });

      // 프론트엔드 mock-data 형식과 호환되는 응답
      const products = items.map((g) => {
        const rate = g.targetQuantity > 0
          ? Math.round((g.currentQuantity / g.targetQuantity) * 100)
          : 0;
        return {
          id: g.id,
          creatorId: g.creatorId,
          title: g.title,
          description: g.description,
          imageUrl: g.imageUrl ?? '',
          author: g.authorName ?? '익명',
          authorAvatar: '',
          department: g.authorDepartment ?? '',
          category: g.category ?? '',
          price: g.finalPrice,
          priceText: g.finalPrice.toLocaleString('ko-KR') + '원',
          targetQuantity: g.targetQuantity,
          currentQuantity: g.currentQuantity,
          achievementRate: rate,
          deadline: g.deadline.toISOString(),
          status: g.status,
          createdAt: g.createdAt.toISOString(),
        };
      });

      res.json({ items: products, total, page, limit });
    } catch (err) {
      logger.error({ err }, '공동구매 목록 조회 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류' });
    }
  };
}
