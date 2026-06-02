import type { Request, Response } from 'express';
import pg from 'pg';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

// 디자인하기 라이브러리(무료 디자인 + 자수 패치). 공개 목록 + 관리자 추가/삭제.
function row(r: Record<string, unknown>) {
  return { id: r.id as string, kind: r.kind as string, name: (r.name as string) ?? '', image: r.image as string, sort: r.sort as number };
}
const KINDS = new Set(['free', 'patch']);

// GET /api/library?kind=free|patch  — 공개 목록.
export function createLibraryListHandler(pool: pg.Pool) {
  return async (req: Request, res: Response): Promise<void> => {
    const kind = String(req.query.kind || '');
    try {
      const r = kind && KINDS.has(kind)
        ? await pool.query('SELECT * FROM design_assets WHERE kind = $1 ORDER BY sort, created_at LIMIT 500', [kind])
        : await pool.query('SELECT * FROM design_assets ORDER BY kind, sort, created_at LIMIT 1000');
      res.json({ items: r.rows.map(row) });
    } catch (err) {
      logger.error({ err }, '라이브러리 목록 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

// POST /api/admin/library  — 관리자 추가. body: { kind, name, image(data URL 또는 경로) }
export function createLibraryAddHandler(pool: pg.Pool) {
  return async (req: Request, res: Response): Promise<void> => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const kind = String(b.kind || '');
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
    const image = typeof b.image === 'string' ? b.image.trim() : '';
    if (!KINDS.has(kind)) { res.status(400).json(createErrorResponse(new AppError('INVALID_INPUT', "kind 는 'free' 또는 'patch'"))); return; }
    const okImage = image.startsWith('data:image/') || /^\/assets\/.+\.(png|jpe?g|webp|svg)$/i.test(image) || /^https?:\/\//i.test(image);
    if (!okImage) { res.status(400).json(createErrorResponse(new AppError('INVALID_INPUT', '유효한 이미지(업로드 또는 경로)가 필요합니다'))); return; }
    try {
      const sortRow = await pool.query('SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM design_assets WHERE kind = $1', [kind]);
      const sort = (sortRow.rows[0]?.s as number) ?? 0;
      const r = await pool.query(
        'INSERT INTO design_assets (kind, name, image, sort) VALUES ($1, $2, $3, $4) RETURNING *',
        [kind, name || (kind === 'patch' ? '패치' : '디자인'), image, sort],
      );
      res.status(201).json(row(r.rows[0]));
    } catch (err) {
      logger.error({ err }, '라이브러리 추가 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

// DELETE /api/admin/library/:id  — 관리자 삭제.
export function createLibraryDeleteHandler(pool: pg.Pool) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const r = await pool.query('DELETE FROM design_assets WHERE id = $1', [req.params.id]);
      if (!r.rowCount) { res.status(404).json({ error: 'NOT_FOUND', message: '항목을 찾을 수 없습니다' }); return; }
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, '라이브러리 삭제 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
