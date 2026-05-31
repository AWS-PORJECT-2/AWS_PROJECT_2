import type { Request, Response } from 'express';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/funds/:id/like — 펀드 찜(좋아요) 추가(인증 필수, UPSERT).
 * 누른 본인 외 모든 사용자에게 좋아요 수가 반영되도록 서버에 저장한다.
 * → { liked: true, likeCount }  (펀드 없음: 404)
 */
export function createLikeHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const id = req.params.id;
    if (!UUID_RE.test(id)) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' }); return; }
    try {
      const likeCount = await repo.like(userId, id);
      if (likeCount === null) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' }); return; }
      res.json({ liked: true, likeCount });
    } catch (err) {
      logger.error({ err, id, userId }, '찜 추가 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * DELETE /api/funds/:id/like — 펀드 찜 취소(인증 필수).
 * → { liked: false, likeCount }  (펀드 없음: 404)
 */
export function createUnlikeHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const id = req.params.id;
    if (!UUID_RE.test(id)) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' }); return; }
    try {
      const likeCount = await repo.unlike(userId, id);
      if (likeCount === null) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' }); return; }
      res.json({ liked: false, likeCount });
    } catch (err) {
      logger.error({ err, id, userId }, '찜 취소 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * GET /api/me/likes — 내가 찜한 펀드 id 목록(인증 필수).
 * 기기간 유지를 위해 서버에서 조회. → { ids: [groupbuyId...] }
 */
export function createMyLikesHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      const ids = await repo.likedIdsByUser(userId);
      res.json({ ids });
    } catch (err) {
      logger.error({ err, userId }, '내 찜 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
