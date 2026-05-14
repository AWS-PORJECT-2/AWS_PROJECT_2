import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export interface AnnouncementRow {
  id: number;
  title: string;
  content: string;
  authorId: number | null;
  authorName: string | null;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnnouncementListItem {
  id: number;
  title: string;
  authorName: string | null;
  viewCount: number;
  createdAt: Date;
}

export interface AnnouncementRepository {
  findById(id: number): Promise<AnnouncementRow | null>;
  list(limit: number, offset: number): Promise<{ items: AnnouncementListItem[]; total: number }>;
  create(authorId: number, title: string, content: string): Promise<AnnouncementRow>;
  update(id: number, title: string, content: string): Promise<void>;
  delete(id: number): Promise<void>;
  incrementViewCount(id: number): Promise<void>;
}

export class MySQLAnnouncementRepository implements AnnouncementRepository {
  constructor(private pool: Pool) {}

  async findById(id: number): Promise<AnnouncementRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT a.id, a.title, a.content, a.author_id, a.view_count, a.created_at, a.updated_at,
              u.name AS author_name
       FROM announcements a
       LEFT JOIN users u ON u.id = a.author_id
       WHERE a.id = ?`,
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapDetail(rows[0]);
  }

  async list(limit: number, offset: number): Promise<{ items: AnnouncementListItem[]; total: number }> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT a.id, a.title, a.view_count, a.created_at,
              u.name AS author_name
       FROM announcements a
       LEFT JOIN users u ON u.id = a.author_id
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const [countRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM announcements'
    );
    const total = Number(countRows[0].cnt);

    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      authorName: r.author_name,
      viewCount: r.view_count,
      createdAt: new Date(r.created_at),
    }));

    return { items, total };
  }

  async create(authorId: number, title: string, content: string): Promise<AnnouncementRow> {
    const [result] = await this.pool.query<ResultSetHeader>(
      'INSERT INTO announcements (title, content, author_id) VALUES (?, ?, ?)',
      [title, content, authorId]
    );
    const created = await this.findById(result.insertId);
    if (!created) throw new Error('생성 직후 조회 실패');
    return created;
  }

  async update(id: number, title: string, content: string): Promise<void> {
    await this.pool.query(
      'UPDATE announcements SET title = ?, content = ? WHERE id = ?',
      [title, content, id]
    );
  }

  async delete(id: number): Promise<void> {
    await this.pool.query('DELETE FROM announcements WHERE id = ?', [id]);
  }

  async incrementViewCount(id: number): Promise<void> {
    await this.pool.query(
      'UPDATE announcements SET view_count = view_count + 1 WHERE id = ?',
      [id]
    );
  }

  private mapDetail(row: RowDataPacket): AnnouncementRow {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      authorId: row.author_id,
      authorName: row.author_name,
      viewCount: row.view_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
