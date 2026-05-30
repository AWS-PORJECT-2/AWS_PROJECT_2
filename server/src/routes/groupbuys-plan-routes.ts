import type { Request, Response } from 'express';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/groupbuys/scheduled — 공개예정 카드 목록.
 * status=scheduled AND open_at>now, open_at 오름차순.
 * query: limit, offset (선택). → { items:[<card>], total }
 */
export function createScheduledListHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const limit = Number(req.query.limit) || undefined;
    const offset = Number(req.query.offset) || undefined;
    try {
      const { total, rows } = await repo.findScheduled(limit, offset);
      res.json({ items: rows, total });
    } catch (err) {
      logger.error({ err }, '공개예정 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * GET /api/groupbuys/boost-banners — Boost 요금제 + 공개(open) 펀드 배너.
 * 홈 히어로 노출용. → { items:[{ id, title, coverImageUrl, creatorName }] } 최대 5개.
 */
export function createBoostBannersHandler(repo: GroupBuyRepository) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const items = await repo.findBoostBanners(5);
      res.json({ items });
    } catch (err) {
      logger.error({ err }, 'Boost 배너 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * POST /api/groupbuys/:id/subscribe — 공개예정 알림 구독(UPSERT).
 * → { subscribed: true, count }
 */
export function createSubscribeHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const id = req.params.id;
    if (!UUID_RE.test(id)) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' }); return; }
    try {
      // 존재하지 않는 펀드 구독 방지.
      const existing = await repo.findById(id);
      if (!existing) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' }); return; }
      const count = await repo.subscribe(userId, id);
      res.json({ subscribed: true, count });
    } catch (err) {
      logger.error({ err, id, userId }, '공개예정 알림 구독 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * DELETE /api/groupbuys/:id/subscribe — 공개예정 알림 구독 취소.
 * → { subscribed: false, count }
 */
export function createUnsubscribeHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const id = req.params.id;
    if (!UUID_RE.test(id)) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' }); return; }
    try {
      const count = await repo.unsubscribe(userId, id);
      res.json({ subscribed: false, count });
    } catch (err) {
      logger.error({ err, id, userId }, '공개예정 알림 구독 취소 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
