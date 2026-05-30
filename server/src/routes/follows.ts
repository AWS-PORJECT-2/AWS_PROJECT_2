import type { Request, Response } from 'express';
import type { PgFollowRepository } from '../repositories/pg-follow-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/users/:id/follow — 팔로워 수 + (로그인 시) 내 팔로우 여부. 인증 선택. */
export function createFollowStatusHandler(repo: PgFollowRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const creatorId = req.params.id;
    if (!UUID_RE.test(creatorId)) { res.json({ followerCount: 0, following: false }); return; }
    try {
      const followerCount = await repo.followerCount(creatorId);
      const following = req.userId ? await repo.isFollowing(req.userId, creatorId) : false;
      res.json({ followerCount, following });
    } catch (err) {
      logger.error({ err, creatorId }, '팔로우 상태 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/users/:id/follow — 팔로우 (인증 필수) */
export function createFollowHandler(repo: PgFollowRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const creatorId = req.params.id;
    if (!UUID_RE.test(creatorId)) { res.status(400).json({ error: 'INVALID', message: '잘못된 대상입니다' }); return; }
    if (creatorId === req.userId) { res.status(400).json({ error: 'SELF', message: '자기 자신은 팔로우할 수 없습니다' }); return; }
    try {
      await repo.follow(req.userId, creatorId);
      res.json({ following: true, followerCount: await repo.followerCount(creatorId) });
    } catch (err) {
      logger.error({ err, creatorId }, '팔로우 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** DELETE /api/users/:id/follow — 언팔로우 (인증 필수) */
export function createUnfollowHandler(repo: PgFollowRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const creatorId = req.params.id;
    try {
      await repo.unfollow(req.userId, creatorId);
      res.json({ following: false, followerCount: await repo.followerCount(creatorId) });
    } catch (err) {
      logger.error({ err, creatorId }, '언팔로우 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
