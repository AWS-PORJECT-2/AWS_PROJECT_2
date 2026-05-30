import type pg from 'pg';
import type { ProjectDraft } from '../types/index.js';
import type { ProjectDraftRepository, ProjectDraftSummary } from './project-draft-repository.js';

// data (JSONB/TEXT) → 안전 파싱. 객체가 아니면 빈 객체.
function parseData(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return {}; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  return obj as Record<string, unknown>;
}

function mapRow(row: Record<string, unknown>): ProjectDraft {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: (row.title as string | null) ?? null,
    data: parseData(row.data),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class PgProjectDraftRepository implements ProjectDraftRepository {
  constructor(private readonly pool: pg.Pool) {}

  async listByUser(userId: string): Promise<ProjectDraftSummary[]> {
    // 목록은 가볍게 — 큰 data 통째 대신 title + data->>'category' 만 뽑는다.
    const res = await this.pool.query(
      `SELECT id, title, updated_at, data->>'category' AS category
         FROM project_drafts
        WHERE user_id = $1
        ORDER BY updated_at DESC`,
      [userId],
    );
    return res.rows.map((r) => ({
      id: r.id as string,
      title: (r.title as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      updatedAt: new Date(r.updated_at as string),
    }));
  }

  async findByIdForUser(id: string, userId: string): Promise<ProjectDraft | null> {
    const res = await this.pool.query(
      'SELECT * FROM project_drafts WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  async create(userId: string, title: string | null, data: Record<string, unknown>): Promise<ProjectDraft> {
    const res = await this.pool.query(
      `INSERT INTO project_drafts (user_id, title, data)
       VALUES ($1, $2, $3::jsonb)
       RETURNING *`,
      [userId, title, JSON.stringify(data ?? {})],
    );
    return mapRow(res.rows[0]);
  }

  async updateForUser(
    id: string,
    userId: string,
    title: string | null | undefined,
    data: Record<string, unknown>,
  ): Promise<ProjectDraft | null> {
    // title 미제공(undefined)이면 기존 title 유지. data 는 항상 통째 교체.
    const res = await this.pool.query(
      `UPDATE project_drafts
          SET data = $3::jsonb,
              title = CASE WHEN $4::boolean THEN $5 ELSE title END,
              updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [id, userId, JSON.stringify(data ?? {}), title !== undefined, title ?? null],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const res = await this.pool.query(
      'DELETE FROM project_drafts WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
