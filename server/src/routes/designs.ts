import { Router } from 'express';
import type { Request, Response, RequestHandler } from 'express';
import pg from 'pg';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';
import { uuidParamGuard } from '../middleware/uuid-param.js';

// 사용자 디자인 저장소 라우터(본인 것만 CRUD). design/preview/aiImage 는 data URL 을 포함할 수 있어 큼.
//  목록은 가벼운 컬럼만(design/ai_image 제외), 상세에서 전체 반환.
function rowLight(r: Record<string, unknown>) {
  return {
    id: r.id as string, category: r.category as string | null, product: r.product as string | null,
    title: (r.title as string | null) ?? '', preview: (r.preview as string | null) ?? null,
    hasAi: !!r.ai_image, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function rowFull(r: Record<string, unknown>) {
  return {
    ...rowLight(r),
    design: (typeof r.design === 'object' && r.design) ? r.design : {},
    aiImage: (r.ai_image as string | null) ?? null,
  };
}
const TITLE_MAX = 120;
const clampStr = (v: unknown, n: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

export function createDesignsRouter(pool: pg.Pool, authRequired: RequestHandler, writeRateLimit: RequestHandler): Router {
  const router = Router();
  router.param('id', uuidParamGuard);

  function fail(res: Response, e: unknown, msg: string): void {
    if (e instanceof AppError) { res.status(e.httpStatus).json(createErrorResponse(e)); return; }
    logger.error({ err: e }, msg);
    res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
  }

  // 목록(본인) — 경량 컬럼만.
  router.get('/', authRequired, async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, category, product, title, preview, (ai_image IS NOT NULL) AS ai_image, created_at, updated_at
           FROM user_designs WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100`,
        [req.userId],
      );
      res.json({ items: r.rows.map(rowLight) });
    } catch (e) { fail(res, e, '디자인 목록 조회 실패'); }
  });

  // 상세(본인) — 전체.
  router.get('/:id', authRequired, async (req: Request, res: Response) => {
    try {
      const r = await pool.query('SELECT * FROM user_designs WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
      if (!r.rows[0]) { res.status(404).json({ error: 'NOT_FOUND', message: '디자인을 찾을 수 없습니다' }); return; }
      res.json(rowFull(r.rows[0]));
    } catch (e) { fail(res, e, '디자인 조회 실패'); }
  });

  // 생성(본인).
  router.post('/', authRequired, writeRateLimit, async (req: Request, res: Response) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const r = await pool.query(
        `INSERT INTO user_designs (user_id, category, product, title, design, preview, ai_image)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING *`,
        [req.userId, clampStr(b.category, 40), clampStr(b.product, 80), clampStr(b.title, TITLE_MAX) ?? '내 디자인',
          JSON.stringify(b.design ?? {}), typeof b.preview === 'string' ? b.preview : null, typeof b.aiImage === 'string' ? b.aiImage : null],
      );
      res.status(201).json(rowFull(r.rows[0]));
    } catch (e) { fail(res, e, '디자인 저장 실패'); }
  });

  // 수정(본인) — 제공 필드만 갱신.
  router.patch('/:id', authRequired, writeRateLimit, async (req: Request, res: Response) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const sets: string[] = []; const vals: unknown[] = []; let i = 1;
      const set = (col: string, v: unknown) => { sets.push(`${col} = $${i++}`); vals.push(v); };
      if (b.title !== undefined) set('title', clampStr(b.title, TITLE_MAX) ?? '내 디자인');
      if (b.product !== undefined) set('product', clampStr(b.product, 80));
      if (b.design !== undefined) { sets.push(`design = $${i++}::jsonb`); vals.push(JSON.stringify(b.design ?? {})); }
      if (b.preview !== undefined) set('preview', typeof b.preview === 'string' ? b.preview : null);
      if (b.aiImage !== undefined) set('ai_image', typeof b.aiImage === 'string' ? b.aiImage : null);
      if (!sets.length) { res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', '변경할 내용이 없습니다'))); return; }
      sets.push('updated_at = NOW()');
      vals.push(req.params.id, req.userId);
      const r = await pool.query(`UPDATE user_designs SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`, vals);
      if (!r.rows[0]) { res.status(404).json({ error: 'NOT_FOUND', message: '디자인을 찾을 수 없습니다' }); return; }
      res.json(rowFull(r.rows[0]));
    } catch (e) { fail(res, e, '디자인 수정 실패'); }
  });

  // 삭제(본인).
  router.delete('/:id', authRequired, async (req: Request, res: Response) => {
    try {
      const r = await pool.query('DELETE FROM user_designs WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
      if (!r.rowCount) { res.status(404).json({ error: 'NOT_FOUND', message: '디자인을 찾을 수 없습니다' }); return; }
      res.json({ ok: true });
    } catch (e) { fail(res, e, '디자인 삭제 실패'); }
  });

  return router;
}
