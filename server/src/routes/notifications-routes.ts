import type { Request, Response } from 'express';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import type { Notification } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// DB 모델 → API 계약 아이템.
function toItem(n: Notification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    fundId: n.fundId,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  };
}

function parseLimit(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/** GET /api/me/notifications?limit=50 → { items, unreadCount } */
export function createMyNotificationsHandler(repo: NotificationRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const limit = parseLimit(req.query.limit);
    try {
      const [rows, unreadCount] = await Promise.all([
        repo.listByUser(userId, limit),
        repo.unreadCount(userId),
      ]);
      res.json({ items: rows.map(toItem), unreadCount });
    } catch (err) {
      logger.error({ err, userId }, '알림 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/me/notifications/:id/read → { ok: true } (본인 알림만) */
export function createMarkNotificationReadHandler(repo: NotificationRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      await repo.markRead(userId, req.params.id);
      // 멱등: 이미 읽음/없음이어도 ok. 타인 알림은 markRead 가 user_id 로 걸러 영향 없음.
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, userId, id: req.params.id }, '알림 읽음 처리 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/me/notifications/read-all → { ok: true } */
export function createMarkAllNotificationsReadHandler(repo: NotificationRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      await repo.markAllRead(userId);
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, userId }, '알림 전체 읽음 처리 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** DELETE /api/me/notifications → { ok: true } — 본인 알림 전부 삭제 */
export function createDeleteAllNotificationsHandler(repo: NotificationRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      await repo.deleteAllForUser(userId);
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, userId }, '알림 전체 삭제 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
