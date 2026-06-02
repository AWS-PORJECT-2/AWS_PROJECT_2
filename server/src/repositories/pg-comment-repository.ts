import type pg from 'pg';
import type { Comment, CommentTargetType } from '../types/index.js';
import type { CommentRepository } from './comment-repository.js';

function mapRow(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    targetType: row.target_type as CommentTargetType,
    targetId: row.target_id as string,
    userId: row.user_id as string,
    userName: (row.user_name as string | null) ?? '',
    userPicture: (row.user_picture as string | null) ?? null,
    userSlug: (row.user_slug as string | null) ?? null,
    content: row.content as string,
    parentId: (row.parent_id as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}

export class PgCommentRepository implements CommentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async list(targetType: CommentTargetType, targetId: string): Promise<Comment[]> {
    const res = await this.pool.query(
      // 공개 GET 이므로 결과 하드 캡(무제한 조회 DoS 방지) — 최신 500개. board.listComments 와 동일 패턴.
      `SELECT * FROM (
         SELECT c.id, c.target_type, c.target_id, c.user_id, c.parent_id, c.content, c.created_at,
                u.name AS user_name, u.picture AS user_picture, u.slug AS user_slug
           FROM comments c
           LEFT JOIN "user" u ON u.id = c.user_id
          WHERE c.target_type = $1 AND c.target_id = $2
          ORDER BY c.created_at DESC LIMIT 500
       ) t ORDER BY t.created_at DESC`,
      [targetType, targetId],
    );
    return res.rows.map(mapRow);
  }

  async create(input: {
    targetType: CommentTargetType;
    targetId: string;
    userId: string;
    content: string;
    parentId: string | null;
  }): Promise<Comment> {
    const res = await this.pool.query(
      `INSERT INTO comments (target_type, target_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, target_type, target_id, user_id, parent_id, content, created_at`,
      [input.targetType, input.targetId, input.userId, input.content, input.parentId],
    );
    const created = res.rows[0];
    // 작성자 표시 정보 조인(방금 INSERT 한 user_id 기준)
    const u = await this.pool.query(`SELECT name, picture, slug FROM "user" WHERE id = $1`, [input.userId]);
    const ur = u.rows[0] ?? {};
    return mapRow({
      ...created,
      user_name: ur.name ?? null,
      user_picture: ur.picture ?? null,
      user_slug: ur.slug ?? null,
    });
  }

  async findById(id: string): Promise<Comment | null> {
    const res = await this.pool.query(
      `SELECT c.id, c.target_type, c.target_id, c.user_id, c.parent_id, c.content, c.created_at,
              u.name AS user_name, u.picture AS user_picture, u.slug AS user_slug
         FROM comments c
         LEFT JOIN "user" u ON u.id = c.user_id
        WHERE c.id = $1`,
      [id],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM comments WHERE id = $1', [id]);
  }
}
