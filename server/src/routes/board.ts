import { Router } from 'express';
import type { Request, Response, RequestHandler } from 'express';
import type { BoardRepository } from '../repositories/board-repository.js';
import type { UserRepository } from '../repositories/user-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';
import { uuidParamGuard } from '../middleware/uuid-param.js';
import { isValidBoardCategory, sanitizeTitle, sanitizeBody, sanitizeComment, sanitizeThumbnail, normalizeMedia, htmlToText, BOARD_HTML_MAX } from '../utils/board-content.js';
import { sanitizeStoryHtml } from '../utils/content-blocks.js';

// 글 본문(작성/수정 공용) 정규화 — 서버에서 contentBlocks(html) 재새니타이즈 + 평문 스니펫·미디어·썸네일 파생.
// 반환 null = 필수 누락(title/내용). ok=true 면 저장 가능한 필드 묶음.
function parsePostInput(raw: Record<string, unknown>):
  | { ok: false; field: 'title' | 'content' }
  | { ok: true; category: string; title: string; thumbnail: string | null; contentBlocks: unknown[]; media: ReturnType<typeof normalizeMedia>; body: string } {
  const category = isValidBoardCategory(raw.category) ? raw.category : 'general';
  const title = sanitizeTitle(raw.title);
  const media = normalizeMedia(raw.media);
  const thumbnail = sanitizeThumbnail(raw.thumbnail);
  let contentBlocks: unknown[] = [];
  let text = '';
  let htmlHasMedia = false;
  if (Array.isArray(raw.contentBlocks)) {
    const rawBlock = raw.contentBlocks.find((b) => b && (b as { type?: string }).type === 'html') as { html?: unknown } | undefined;
    const rawHtml = rawBlock && typeof rawBlock.html === 'string' ? rawBlock.html : '';
    const html = sanitizeStoryHtml(rawHtml, BOARD_HTML_MAX);
    contentBlocks = html ? [{ type: 'html', html }] : [];
    text = htmlToText(html);
    htmlHasMedia = /<(img|iframe)\b/i.test(html);
  } else {
    text = sanitizeBody(raw.body);
  }
  if (!title) return { ok: false, field: 'title' };
  // 빈 글 차단 — 텍스트도 미디어(img/iframe)도 첨부도 없으면 거절.
  if (!text.trim() && !htmlHasMedia && media.length === 0) return { ok: false, field: 'content' };
  return { ok: true, category, title, thumbnail, contentBlocks, media, body: text };
}

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

export function createBoardRouter(repo: BoardRepository, authRequired: RequestHandler, userRepo: UserRepository, writeRateLimit: RequestHandler): Router {
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
  router.post('/posts', authRequired, writeRateLimit, async (req: Request, res: Response) => {
    try {
      const parsed = parsePostInput((req.body ?? {}) as Record<string, unknown>);
      if (!parsed.ok) {
        const msg = parsed.field === 'title' ? '제목을 입력해 주세요' : '내용을 입력해 주세요';
        res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', msg))); return;
      }
      const post = await repo.createPost({
        authorId: req.userId as string,
        category: parsed.category, title: parsed.title, body: parsed.body,
        thumbnail: parsed.thumbnail, contentBlocks: parsed.contentBlocks, media: parsed.media,
      });
      res.status(201).json(post);
    } catch (e) { fail(res, e, '게시글 작성 실패'); }
  });

  // 수정(본인 또는 관리자) — 카테고리·제목·본문·썸네일 갱신. 작성자 불변.
  router.patch('/posts/:id', authRequired, writeRateLimit, async (req: Request, res: Response) => {
    try {
      const authorId = await repo.getPostAuthorId(req.params.id);
      if (!authorId) { notFound(res, '게시글을 찾을 수 없습니다'); return; }
      if (!(await canModify(req, authorId, userRepo))) { res.status(403).json(createErrorResponse(new AppError('FORBIDDEN'))); return; }
      const parsed = parsePostInput((req.body ?? {}) as Record<string, unknown>);
      if (!parsed.ok) {
        const msg = parsed.field === 'title' ? '제목을 입력해 주세요' : '내용을 입력해 주세요';
        res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', msg))); return;
      }
      const post = await repo.updatePost(req.params.id, {
        category: parsed.category, title: parsed.title, body: parsed.body,
        thumbnail: parsed.thumbnail, contentBlocks: parsed.contentBlocks, media: parsed.media,
      });
      if (!post) { notFound(res, '게시글을 찾을 수 없습니다'); return; }
      res.json(post);
    } catch (e) { fail(res, e, '게시글 수정 실패'); }
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
  router.post('/posts/:id/comments', authRequired, writeRateLimit, async (req: Request, res: Response) => {
    try {
      const text = sanitizeComment((req.body as Record<string, unknown> | undefined)?.body);
      if (!text) { res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', '댓글을 입력해 주세요'))); return; }
      if (!(await repo.getPostAuthorId(req.params.id))) { notFound(res, '게시글을 찾을 수 없습니다'); return; }
      const c = await repo.createComment({ postId: req.params.id, authorId: req.userId as string, body: text });
      if (!c) { res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR'))); return; }
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
