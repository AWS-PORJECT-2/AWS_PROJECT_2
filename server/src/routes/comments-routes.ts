import type { Request, Response } from 'express';
import type { CommentRepository } from '../repositories/comment-repository.js';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import type { Comment, CommentTargetType } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { notify } from '../services/notify.js';
import { logger } from '../logger.js';

const CONTENT_MAX = 2000;

function isTargetType(v: unknown): v is CommentTargetType {
  return v === 'fund' || v === 'profile';
}

function serialize(c: Comment, viewerId?: string) {
  return {
    id: c.id,
    targetType: c.targetType,
    targetId: c.targetId,
    userId: c.userId,
    userName: c.userName,
    userPicture: c.userPicture,
    userSlug: c.userSlug,
    content: c.content,
    parentId: c.parentId,
    createdAt: c.createdAt.toISOString(),
    mine: !!viewerId && viewerId === c.userId,
  };
}

/** GET /api/comments?targetType&targetId — 최신순. soft-auth(viewer 로 mine 채움). */
export function createCommentsListHandler(repo: CommentRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const targetType = req.query.targetType;
    const targetId = String(req.query.targetId ?? '').trim();
    if (!isTargetType(targetType) || !targetId) {
      res.status(400).json({ error: 'INVALID', message: 'targetType/targetId 가 필요합니다' });
      return;
    }
    try {
      const list = await repo.list(targetType, targetId);
      res.json(list.map((c) => serialize(c, req.userId)));
    } catch (err) {
      logger.error({ err, targetType, targetId }, '댓글 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/comments — 댓글/대댓글 작성(인증 필수). */
export function createCommentCreateHandler(
  repo: CommentRepository,
  groupBuyRepo?: GroupBuyRepository,
  notificationRepo?: NotificationRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const targetType = body.targetType;
    const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const parentId = typeof body.parentId === 'string' && body.parentId.trim() ? body.parentId.trim() : null;

    if (!isTargetType(targetType) || !targetId) {
      res.status(400).json({ error: 'INVALID', message: 'targetType/targetId 가 필요합니다' });
      return;
    }
    if (!content || content.length > CONTENT_MAX) {
      res.status(400).json({ error: 'INVALID', message: '댓글은 1~2000자입니다' });
      return;
    }

    try {
      // 대댓글이면 부모가 같은 대상에 존재하는지 확인(엉뚱한 트리 방지). 답글 알림 대상도 여기서 캡처.
      let parentAuthorId: string | null = null;
      if (parentId) {
        const parent = await repo.findById(parentId);
        if (!parent || parent.targetType !== targetType || parent.targetId !== targetId) {
          res.status(400).json({ error: 'INVALID_PARENT', message: '잘못된 상위 댓글입니다' });
          return;
        }
        parentAuthorId = parent.userId;
      }
      const created = await repo.create({ targetType, targetId, userId, content, parentId });

      // 알림(best-effort) — 메인 응답에 영향 없도록 try/catch 흡수.
      //   (a) 펀드 댓글 → 프로젝트 창작자에게(본인 댓글/본인 프로젝트 제외).
      //   (b) 대댓글 → 원댓글 작성자에게(본인 답글/창작자 중복 제외).
      if (notificationRepo) {
        const preview = content.length > 60 ? `${content.slice(0, 60)}…` : content;
        let creatorId: string | null = null;
        if (targetType === 'fund' && groupBuyRepo) {
          let fund = null;
          try { fund = await groupBuyRepo.findById(targetId); } catch { /* 조회 실패는 무시 */ }
          creatorId = fund?.creatorId ?? null;
          if (creatorId && creatorId !== userId) {
            await notify(notificationRepo, {
              userId: creatorId,
              type: 'project_comment',
              title: '내 프로젝트에 새 댓글이 달렸어요',
              body: preview,
              fundId: targetId,
            });
          }
        }
        if (parentAuthorId && parentAuthorId !== userId && parentAuthorId !== creatorId) {
          await notify(notificationRepo, {
            userId: parentAuthorId,
            type: 'comment_reply',
            title: '내 댓글에 답글이 달렸어요',
            body: preview,
            fundId: targetType === 'fund' ? targetId : null,
          });
        }
      }

      res.status(201).json(serialize(created, userId));
    } catch (err) {
      logger.error({ err, userId, targetType, targetId }, '댓글 작성 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** DELETE /api/comments/:id — 작성자 본인만 204, 아니면 403. */
export function createCommentDeleteHandler(repo: CommentRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const id = req.params.id;
    try {
      const existing = await repo.findById(id);
      if (!existing) { res.status(404).json({ error: 'NOT_FOUND', message: '댓글을 찾을 수 없습니다' }); return; }
      if (existing.userId !== userId) {
        res.status(403).json(createErrorResponse(new AppError('FORBIDDEN')));
        return;
      }
      await repo.delete(id);
      res.status(204).end();
    } catch (err) {
      logger.error({ err, id, userId }, '댓글 삭제 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
