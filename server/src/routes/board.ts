import { Router } from 'express';
import type { Request, Response, RequestHandler } from 'express';
import type { BoardRepository } from '../repositories/board-repository.js';
import type { UserRepository } from '../repositories/user-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';
import { uuidParamGuard } from '../middleware/uuid-param.js';
import { isValidBoardCategory, sanitizeTitle, sanitizeBody, sanitizeComment, normalizeMedia } from '../utils/board-content.js';

function fail(res: Response, e: unknown, msg: string): void {
  if (e instanceof AppError) { res.status(e.httpStatus).json(createErrorResponse(e)); return; }
  logger.error({ err: e }, msg);
  res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
}
function notFound(res: Response, msg: string): void {
  res.status(404).json({ error: 'NOT_FOUND', message: msg });
}
async function canModify(req: Request, authorId: string, userRepo: UserRepository): Promise<boolean> {
  if (req.userId && req.userId === authorId) return true;
  if (!req.userId) return false;
  const u = await userRepo.findById(req.userId);
  return !!u && String(u.role).toUpperCase() === 'ADMIN';
}

export function createBoardRouter(repo: BoardRepository, authRequired: RequestHandler, userRepo: UserRepository): Router {
  const router = Router();
  router.param('id', uuidParamGuard); // 서브라우터 자체 UUID 가드(전역 app.param 미적용 대비)

  // 목록(공개)
  router.get('/posts', async (req: Request, res: Response) => {
    try {
      const cat = typeof req.query.category === 'string' && isValidBoardCategory(req.query.category) ? req.query.category : undefined;
      const limit = Number(req.query.limit) || 20;
      const before = typeof req.query.before === 'string' ? req.query.before : undefined;
      res.json({ items: await repo.listPosts({ category: cat, limit, before }) });
    } catch (e) { fail(res, e, '게시판 목록 조회 실패'); }
  });

  // 상세(공개)
  router.get('/posts/:id', async (req: Request, res: Response) => {
    try {
      const post = await repo.getPost(req.params.id);
      if (!post) { notFound(res, '게시글을 찾을 수 없습니다'); return; }
      res.json(post);
    } catch (e) { fail(res, e, '게시글 조회 실패'); }
  });

  // 작성(로그인)
  router.post('/posts', authRequired, async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const category = isValidBoardCategory(body.category) ? body.category : 'general';
      const title = sanitizeTitle(body.title);
      const text = sanitizeBody(body.body);
      const media = normalizeMedia(body.media);
      if (!title) { res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', '제목을 입력해 주세요'))); return; }
      if (!text.trim() && media.length === 0) { res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', '내용 또는 사진·영상·링크를 추가해 주세요'))); return; }
      const post = await repo.createPost({ authorId: req.userId as string, category, title, body: text, media });
      res.status(201).json(post);
    } catch (e) { fail(res, e, '게시글 작성 실패'); }
  });

  // 삭제(본인 또는 관리자)
  router.delete('/posts/:id', authRequired, async (req: Request, res: Response) => {
    try {
      const authorId = await repo.getPostAuthorId(req.params.id);
      if (!authorId) { notFound(res, '게시글을 찾을 수 없습니다'); return; }
      if (!(await canModify(req, authorId, userRepo))) { res.status(403).json(createErrorResponse(new AppError('FORBIDDEN'))); return; }
      await repo.deletePost(req.params.id);
      res.json({ ok: true });
    } catch (e) { fail(res, e, '게시글 삭제 실패'); }
  });

  // 댓글 목록(공개)
  router.get('/posts/:id/comments', async (req: Request, res: Response) => {
    try { res.json({ items: await repo.listComments(req.params.id) }); }
    catch (e) { fail(res, e, '댓글 조회 실패'); }
  });

  // 댓글 작성(로그인)
  router.post('/posts/:id/comments', authRequired, async (req: Request, res: Response) => {
    try {
      const text = sanitizeComment((req.body as Record<string, unknown> | undefined)?.body);
      if (!text) { res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', '댓글을 입력해 주세요'))); return; }
      if (!(await repo.getPostAuthorId(req.params.id))) { notFound(res, '게시글을 찾을 수 없습니다'); return; }
      const c = await repo.createComment({ postId: req.params.id, authorId: req.userId as string, body: text });
      res.status(201).json(c);
    } catch (e) { fail(res, e, '댓글 작성 실패'); }
  });

  // 댓글 삭제(본인 또는 관리자)
  router.delete('/comments/:id', authRequired, async (req: Request, res: Response) => {
    try {
      const authorId = await repo.getCommentAuthorId(req.params.id);
      if (!authorId) { notFound(res, '댓글을 찾을 수 없습니다'); return; }
      if (!(await canModify(req, authorId, userRepo))) { res.status(403).json(createErrorResponse(new AppError('FORBIDDEN'))); return; }
      await repo.deleteComment(req.params.id);
      res.json({ ok: true });
    } catch (e) { fail(res, e, '댓글 삭제 실패'); }
  });

  return router;
}
