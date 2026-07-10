import type { Request, Response } from 'express';
import type { PgStoryRepository, StoryVote } from '../repositories/pg-story-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/stories — 내 크루 + 본인의 살아있는 스토리 목록. 인증 필수. */
export function createStoriesListHandler(repo: PgStoryRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.json({ items: [] }); return; }
    try {
      const items = await repo.listForViewer(req.userId);
      res.json({ items });
    } catch (err) {
      logger.error({ err }, '스토리 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/stories — 스토리 업로드. body: { mediaUrl, mediaType?, vote? }. 인증 필수. */
export function createStoryCreateHandler(repo: PgStoryRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl : '';
    if (!mediaUrl) { res.status(400).json({ error: 'INVALID', message: '미디어가 필요해요' }); return; }
    const mediaType = body.mediaType === 'video' ? 'video' : 'image';
    let vote: StoryVote | null = null;
    if (body.vote && typeof body.vote === 'object') {
      const v = body.vote as Record<string, unknown>;
      const q = typeof v.q === 'string' ? v.q.trim().slice(0, 60) : '';
      const a = typeof v.a === 'string' ? v.a.trim().slice(0, 20) : '';
      const b = typeof v.b === 'string' ? v.b.trim().slice(0, 20) : '';
      if (q && a && b) {
        vote = { q, a, b,
          x: typeof v.x === 'number' ? v.x : 50,
          y: typeof v.y === 'number' ? v.y : 60 };
      }
    }
    try {
      const id = await repo.create(req.userId, mediaUrl, mediaType, vote);
      res.status(201).json({ id });
    } catch (err) {
      logger.error({ err }, '스토리 업로드 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/stories/:id/vote — 투표. body: { option: 0|1 }. 인증 필수. */
export function createStoryVoteHandler(repo: PgStoryRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const storyId = req.params.id;
    if (!UUID_RE.test(storyId)) { res.status(400).json({ error: 'INVALID', message: '잘못된 스토리입니다' }); return; }
    const option = Number((req.body ?? {}).option);
    if (option !== 0 && option !== 1) { res.status(400).json({ error: 'INVALID', message: '옵션은 0 또는 1' }); return; }
    try {
      const counts = await repo.vote(storyId, req.userId, option as 0 | 1);
      res.json({ counts, myVote: option });
    } catch (err) {
      if (err instanceof Error && err.message === 'STORY_NOT_VOTABLE') {
        res.status(409).json({ error: 'NOT_VOTABLE', message: '투표할 수 없는 스토리예요' });
        return;
      }
      logger.error({ err, storyId }, '스토리 투표 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
