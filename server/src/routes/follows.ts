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

// 팔로우/언팔로우 핸들러는 routes/users-routes.ts(createFollowHandler/createUnfollowHandler)로 일원화됨.
// 이 파일은 상태조회(createFollowStatusHandler)만 제공한다.
