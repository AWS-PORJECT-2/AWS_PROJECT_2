import type { Request, Response } from 'express';
import type { GroupBuyRepository, GroupBuyFindManyOptions } from '../repositories/groupbuy-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/groupbuys — 공개 목록.
 * query: sort=popular|latest|ending, category, creatorId, limit, offset
 * → { total, items:[<card>] }
 */
export function createGroupBuysListHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const sortRaw = String(req.query.sort ?? 'popular');
    const sort: GroupBuyFindManyOptions['sort'] =
      sortRaw === 'latest' ? 'latest' : sortRaw === 'ending' ? 'ending' : 'popular';
    const category = (req.query.category as string | undefined)?.trim() || undefined;
    const creatorId = (req.query.creatorId as string | undefined)?.trim() || undefined;
    const limit = Number(req.query.limit) || undefined;
    const offset = Number(req.query.offset) || undefined;

    try {
      const { total, rows } = await repo.findMany({ sort, category, creatorId, limit, offset });
      res.json({ total, items: rows });
    } catch (err) {
      logger.error({ err }, '공구 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * GET /api/groupbuys/:id — 단일 상세 + maker. soft-auth(viewer 로 maker.isFollowing 채움).
 */
export function createGroupBuyDetailHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' });
      return;
    }
    try {
      const detail = await repo.getDetail(id, req.userId);
      if (!detail) {
        res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' });
        return;
      }
      // 분석용 조회수 — best-effort, 비차단(실패해도 응답은 정상). 결과를 기다리지 않음.
      void repo.incrementViewCount(id);
      res.json(detail);
    } catch (err) {
      logger.error({ err, id }, '공구 상세 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
