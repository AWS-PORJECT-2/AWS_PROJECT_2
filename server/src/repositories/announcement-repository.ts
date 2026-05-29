import type pg from 'pg';
import type { Announcement, AnnouncementListItem } from '../types/index.js';

export interface AnnouncementRepository {
  findById(id: string): Promise<Announcement | null>;
  list(limit: number, offset: number): Promise<{ items: AnnouncementListItem[]; total: number }>;
  create(authorId: string, title: string, content: string): Promise<Announcement>;
  update(id: string, title: string, content: string): Promise<Announcement | null>;
  delete(id: string): Promise<void>;
  incrementViewCount(id: string): Promise<void>;
}

export class PgAnnouncementRepository implements AnnouncementRepository {
  constructor(private readonly pool: pg.Pool) {}

  async findById(id: string): Promise<Announcement | null> {
    const result = await this.pool.query(
      `SELECT a.id, a.title, a.content, a.author_id, a.view_count, a.created_at, a.updated_at,
              u.name AS author_name
         FROM announcements a
         LEFT JOIN "user" u ON u.id = a.author_id
        WHERE a.id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async list(limit: number, offset: number): Promise<{ items: AnnouncementListItem[]; total: number }> {
    const [listRes, countRes] = await Promise.all([
      this.pool.query(
        `SELECT a.id, a.title, a.view_count, a.created_at,
                u.name AS author_name
           FROM announcements a
           LEFT JOIN "user" u ON u.id = a.author_id
          ORDER BY a.created_at DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      this.pool.query(`SELECT COUNT(*)::int AS cnt FROM announcements`),
    ]);
    const items = listRes.rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      authorName: (r.author_name as string | null) ?? null,
      viewCount: Number(r.view_count),
      createdAt: new Date(r.created_at as string),
    }));
    const total = Number(countRes.rows[0].cnt);
    return { items, total };
  }

  async create(authorId: string, title: string, content: string): Promise<Announcement> {
    const result = await this.pool.query(
      `INSERT INTO announcements (title, content, author_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [title, content, authorId],
    );
    const created = await this.findById(result.rows[0].id as string);
    if (!created) throw new Error('생성 직후 조회 실패');
    return created;
  }

  async update(id: string, title: string, content: string): Promise<Announcement | null> {
    const result = await this.pool.query(
      `UPDATE announcements
          SET title = $1, content = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id`,
      [title, content, id],
    );
    if (result.rowCount === 0) return null;
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM announcements WHERE id = $1`, [id]);
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE announcements SET view_count = view_count + 1 WHERE id = $1`,
      [id],
    );
  }

  private mapRow(row: Record<string, unknown>): Announcement {
    return {
      id: row.id as string,
      title: row.title as string,
      content: row.content as string,
      authorId: (row.author_id as string | null) ?? null,
      authorName: (row.author_name as string | null) ?? null,
      viewCount: Number(row.view_count),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
