import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AnnouncementRepository } from '../repositories/announcement-repository.js';
import { logger } from '../logger.js';

/**
 * 공지사항 라우트.
 * - GET /            : 목록 (공용, 인증 불필요)
 * - GET /:id        : 상세 (공용, 조회수 증가)
 * - POST /          : 생성 (관리자 전용 — requireAdmin 미들웨어 외부에서 적용)
 * - PUT /:id        : 수정 (관리자 전용)
 * - DELETE /:id     : 삭제 (관리자 전용)
 */
export function createAnnouncementsRouter(
  announcementRepo: AnnouncementRepository,
  authRequired: (req: Request, res: Response, next: () => void) => void,
  requireAdmin: (req: Request, res: Response, next: () => void) => void,
) {
  const router = Router();

  // 공용: 목록
  router.get('/', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const offset = (page - 1) * limit;

      const { items, total } = await announcementRepo.list(limit, offset);
      res.json({ items, total, page, limit });
    } catch (err) {
      logger.error({ err }, '공지사항 목록 조회 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 공용: 상세
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const announcement = await announcementRepo.findById(id);
      if (!announcement) {
        res.status(404).json({ error: 'NOT_FOUND', message: '공지사항을 찾을 수 없습니다' });
        return;
      }
      // 조회수 증가 (비동기, 실패해도 응답에 영향 없음)
      announcementRepo.incrementViewCount(id).catch((e) =>
        logger.warn({ err: e, id }, '조회수 증가 실패'),
      );
      res.json(announcement);
    } catch (err) {
      logger.error({ err }, '공지사항 상세 조회 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 관리자: 생성
  router.post('/', authRequired, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { title, content } = req.body as { title?: string; content?: string };
      if (!title?.trim() || !content?.trim()) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: '제목과 내용을 입력해주세요' });
        return;
      }
      const announcement = await announcementRepo.create(req.userId!, title.trim(), content.trim());
      res.status(201).json(announcement);
    } catch (err) {
      logger.error({ err }, '공지사항 생성 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 관리자: 수정
  router.put('/:id', authRequired, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { title, content } = req.body as { title?: string; content?: string };
      if (!title?.trim() || !content?.trim()) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: '제목과 내용을 입력해주세요' });
        return;
      }
      const updated = await announcementRepo.update(id, title.trim(), content.trim());
      if (!updated) {
        res.status(404).json({ error: 'NOT_FOUND', message: '공지사항을 찾을 수 없습니다' });
        return;
      }
      res.json(updated);
    } catch (err) {
      logger.error({ err }, '공지사항 수정 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 관리자: 삭제
  router.delete('/:id', authRequired, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await announcementRepo.delete(id);
      res.status(204).send();
    } catch (err) {
      logger.error({ err }, '공지사항 삭제 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  return router;
}
