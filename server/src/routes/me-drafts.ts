import type { Request, Response } from 'express';
import type { ProjectDraftRepository } from '../repositories/project-draft-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

const TITLE_MAX = 120;
// data(JSONB) 크기 상한 — 약 6MB. 직렬화 바이트 기준으로 가드(과대 payload 차단).
const MAX_DATA_BYTES = 6 * 1024 * 1024;

// data 검증: 객체(배열/원시값 거부)여야 하고, 직렬화 크기가 상한 이내.
function validateData(v: unknown): { ok: true; data: Record<string, unknown> } | { ok: false } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false };
  let serialized: string;
  try { serialized = JSON.stringify(v); } catch { return { ok: false }; }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DATA_BYTES) return { ok: false };
  return { ok: true, data: v as Record<string, unknown> };
}

function normTitle(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, TITLE_MAX);
}

/** GET /api/me/drafts — 내 임시저장 목록(최신순). 요약만 [{id,title,category,updatedAt}]. */
export function createMeDraftsListHandler(repo: ProjectDraftRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      const items = await repo.listByUser(userId);
      res.json({
        items: items.map((d) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt,
        })),
      });
    } catch (err) {
      logger.error({ err, userId }, '임시저장 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/me/drafts — 생성 { title?, data }. → { id, title, data, updatedAt }. */
export function createMeDraftCreateHandler(repo: ProjectDraftRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const valid = validateData(body.data);
    if (!valid.ok) {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', 'data 는 객체이며 6MB 이하여야 합니다')));
      return;
    }
    try {
      const draft = await repo.create(userId, normTitle(body.title), valid.data);
      res.status(201).json({
        id: draft.id,
        title: draft.title,
        data: draft.data,
        updatedAt: draft.updatedAt.toISOString(),
      });
    } catch (err) {
      logger.error({ err, userId }, '임시저장 생성 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/me/drafts/:id — 본인 것만 단건 조회. → { id, title, data, updatedAt }. 아니면 404. */
export function createMeDraftGetHandler(repo: ProjectDraftRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      const draft = await repo.findByIdForUser(req.params.id, userId);
      if (!draft) { res.status(404).json({ error: 'DRAFT_NOT_FOUND', message: '임시저장을 찾을 수 없습니다' }); return; }
      res.json({
        id: draft.id,
        title: draft.title,
        data: draft.data,
        updatedAt: draft.updatedAt.toISOString(),
      });
    } catch (err) {
      logger.error({ err, userId, id: req.params.id }, '임시저장 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** PUT /api/me/drafts/:id — 본인 것만 갱신 { title?, data }. → { id, title, data, updatedAt }. 아니면 404. */
export function createMeDraftUpdateHandler(repo: ProjectDraftRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const valid = validateData(body.data);
    if (!valid.ok) {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', 'data 는 객체이며 6MB 이하여야 합니다')));
      return;
    }
    // title 키가 아예 없으면 기존 유지(undefined). 있으면 정규화(빈 문자열은 null).
    const title = 'title' in body ? normTitle(body.title) : undefined;
    try {
      const draft = await repo.updateForUser(req.params.id, userId, title, valid.data);
      if (!draft) { res.status(404).json({ error: 'DRAFT_NOT_FOUND', message: '임시저장을 찾을 수 없습니다' }); return; }
      res.json({
        id: draft.id,
        title: draft.title,
        data: draft.data,
        updatedAt: draft.updatedAt.toISOString(),
      });
    } catch (err) {
      logger.error({ err, userId, id: req.params.id }, '임시저장 갱신 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** DELETE /api/me/drafts/:id — 본인 것만 삭제. → { ok: true }. 아니면 404. */
export function createMeDraftDeleteHandler(repo: ProjectDraftRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      const ok = await repo.deleteForUser(req.params.id, userId);
      if (!ok) { res.status(404).json({ error: 'DRAFT_NOT_FOUND', message: '임시저장을 찾을 수 없습니다' }); return; }
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, userId, id: req.params.id }, '임시저장 삭제 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
