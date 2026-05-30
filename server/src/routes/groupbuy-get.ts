import type { Request, Response } from 'express';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import { logger } from '../logger.js';

// groupbuys.id 는 UUID. 숫자/임의 문자열로 조회하면 Postgres 가 22P02 로 던지므로 사전 차단.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/groupbuys/:id — 단일 펀드 상세 (게시글 본문 포함).
 * 목록(list)은 가벼움을 위해 큰 이미지/본문을 제외하므로, 상세는 여기서 전체를 반환.
 */
export function createGroupBuyGetHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    // UUID 가 아니면 존재할 수 없음 → 404 (구 mock 숫자 id 로 들어와도 500/크래시 방지)
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' });
      return;
    }

    let g;
    try {
      g = await repo.findById(id);
    } catch (err) {
      logger.error({ err, id }, '단일 펀드 조회 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류' });
      return;
    }
    if (!g) {
      res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' });
      return;
    }
    res.json({
      id: g.id,
      title: g.title,
      description: g.description,
      category: g.category ?? null,
      creatorId: g.creatorId,
      rewardTiers: g.rewardTiers ?? null,
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
