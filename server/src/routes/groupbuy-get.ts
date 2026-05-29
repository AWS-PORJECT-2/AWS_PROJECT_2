import type { Request, Response } from 'express';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';

/**
 * GET /api/groupbuys/:id — 단일 펀드 상세 (게시글 본문 포함).
 * 목록(list)은 가벼움을 위해 큰 이미지/본문을 제외하므로, 상세는 여기서 전체를 반환.
 */
export function createGroupBuyGetHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const g = await repo.findById(req.params.id);
    if (!g) {
      res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' });
      return;
    }
    res.json({
      id: g.id,
      title: g.title,
      description: g.description,
      designImageUrl: g.designImageUrl ?? null,
      tryonImageUrl: g.tryonImageUrl ?? null,
      contentBlocks: g.contentBlocks ?? null,
      basePrice: g.basePrice,
      designFee: g.designFee,
      platformFee: g.platformFee,
      finalPrice: g.finalPrice,
      targetQuantity: g.targetQuantity,
      currentQuantity: g.currentQuantity,
      deadline: g.deadline,
      status: g.status,
      createdAt: g.createdAt,
    });
  };
}
