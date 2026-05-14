import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type {
  AnnouncementRepository,
  AnnouncementRow,
  AnnouncementListItem,
} from '../repositories/announcement-repository.js';

/**
 * 공지사항 라우터.
 * - 공용 (GET): 모든 사용자
 * - 관리자 (POST/PUT/DELETE): requireAdmin 미들웨어로 보호 (app.ts에서 적용)
 */

const TITLE_MAX = 200;
const CONTENT_MAX = 30000;

export function createAnnouncementsRouter(repo: AnnouncementRepository): Router {
  const router = Router();

  // GET /api/announcements?page=1&pageSize=20
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSizeRaw = parseInt(String(req.query.pageSize || '20'), 10) || 20;
      const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
      const offset = (page - 1) * pageSize;

      const { items, total } = await repo.list(pageSize, offset);
      res.json({
        items: items.map(serializeListItem),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/announcements/:id
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'INVALID_ID', message: 'id가 올바르지 않습니다' });
        return;
      }
      const a = await repo.findById(id);
      if (!a) {
        res.status(404).json({ error: 'NOT_FOUND', message: '공지사항을 찾을 수 없습니다' });
        return;
      }
      // 조회수 증가 (실패해도 응답은 정상)
      repo.incrementViewCount(id).catch(() => undefined);
      res.json(serializeDetail(a));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createAdminAnnouncementsRouter(repo: AnnouncementRepository): Router {
  const router = Router();

  // POST /api/admin/announcements
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // req.userId 누락 / 비정수 방어 — NaN 이 그대로 INSERT 되면 mysql2 가 NULL 직렬화
      const authorId = parseInt(req.userId ?? '', 10);
      if (!Number.isInteger(authorId) || authorId <= 0) {
        res.status(401).json({ error: 'NOT_AUTHENTICATED', message: '유효한 사용자 인증이 필요합니다' });
        return;
      }

      const { title, content } = parseTitleContent(req.body);
      if (typeof title !== 'string' || typeof content !== 'string') {
        res.status(400).json({ error: 'MISSING_REQUIRED_FIELD', message: '제목과 내용을 입력해주세요' });
        return;
      }
      const created = await repo.create(authorId, title, content);
      res.status(201).json(serializeDetail(created));
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/admin/announcements/:id
  router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'INVALID_ID', message: 'id가 올바르지 않습니다' });
        return;
      }
      const { title, content } = parseTitleContent(req.body);
      if (typeof title !== 'string' || typeof content !== 'string') {
        res.status(400).json({ error: 'MISSING_REQUIRED_FIELD', message: '제목과 내용을 입력해주세요' });
        return;
      }

      const existing = await repo.findById(id);
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: '공지사항을 찾을 수 없습니다' });
        return;
      }

      await repo.update(id, title, content);
      const updated = await repo.findById(id);
      res.json(serializeDetail(updated!));
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/admin/announcements/:id
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'INVALID_ID', message: 'id가 올바르지 않습니다' });
        return;
      }
      const existing = await repo.findById(id);
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: '공지사항을 찾을 수 없습니다' });
        return;
      }
      await repo.delete(id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function parseTitleContent(body: unknown): { title: string | null; content: string | null } {
  const b = (body || {}) as Record<string, unknown>;
  const titleRaw = typeof b.title === 'string' ? b.title.trim() : '';
  const contentRaw = typeof b.content === 'string' ? b.content.trim() : '';
  if (!titleRaw || !contentRaw) {
    return { title: null, content: null };
  }
  if (titleRaw.length > TITLE_MAX || contentRaw.length > CONTENT_MAX) {
    return { title: null, content: null };
  }
  return { title: titleRaw, content: contentRaw };
}

function serializeDetail(a: AnnouncementRow) {
  return {
    id: a.id,
    title: a.title,
    content: a.content,
    authorId: a.authorId,
    authorName: a.authorName,
    viewCount: a.viewCount,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function serializeListItem(a: AnnouncementListItem) {
  return {
    id: a.id,
    title: a.title,
    authorName: a.authorName,
    viewCount: a.viewCount,
    createdAt: a.createdAt,
  };
}
