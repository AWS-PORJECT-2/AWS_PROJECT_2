import pg from 'pg';
import type { BoardRepository, BoardListOptions } from './board-repository.js';
import type { BoardPost, BoardComment, BoardAuthor } from '../types/board.js';
import type { BoardMedia } from '../utils/board-content.js';
import { normalizeMedia } from '../utils/board-content.js';

const AUTHOR_COLS = 'u.id AS author_id, u.name AS author_name, u.nickname AS author_nickname, u.picture AS author_picture, u.slug AS author_slug';

function toAuthor(r: Record<string, unknown>): BoardAuthor {
  return {
    id: r.author_id as string,
    name: (r.author_name as string | null) ?? null,
    nickname: (r.author_nickname as string | null) ?? null,
    picture: (r.author_picture as string | null) ?? null,
    slug: (r.author_slug as string | null) ?? null,
  };
}
function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v ?? '');
}
function toPost(r: Record<string, unknown>): BoardPost {
  return {
    id: r.id as string,
    category: (r.category as string) ?? 'general',
    title: (r.title as string) ?? '',
    body: (r.body as string) ?? '',
    thumbnail: (r.thumbnail as string | null) ?? null,
    contentBlocks: Array.isArray(r.content_blocks) ? (r.content_blocks as unknown[]) : [],
    media: normalizeMedia(r.media as unknown) as BoardMedia[],
    commentCount: Number(r.comment_count) || 0,
    author: toAuthor(r),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}
function toComment(r: Record<string, unknown>): BoardComment {
  return {
    id: r.id as string,
    postId: r.post_id as string,
    body: (r.body as string) ?? '',
    author: toAuthor(r),
    createdAt: iso(r.created_at),
  };
}

export class PgBoardRepository implements BoardRepository {
  constructor(private readonly pool: pg.Pool) {}

  async listPosts(opts: BoardListOptions): Promise<BoardPost[]> {
    const params: unknown[] = [];
    const where: string[] = [];
    if (opts.category) { params.push(opts.category); where.push(`p.category = $${params.length}`); }
    if (opts.before) { params.push(opts.before); where.push(`p.created_at < $${params.length}`); }
    params.push(Math.min(Math.max(opts.limit, 1), 50));
    // 목록은 가벼운 컬럼만 — content_blocks/media(글당 최대 수 MB의 base64)를 절대 싣지 않는다.
    // 카드 스니펫은 평문 body(migration 035가 목록/검색용으로 만든 컬럼)로 충분하고, 전체 본문/미디어는
    // getPost(상세)에서만 반환한다. (공개·무제한 GET 에 MB급 행을 곱해 보내던 자초 DoS/대역폭 낭비 차단.)
    const result = await this.pool.query(
      `SELECT p.id, p.category, p.title, p.body, p.thumbnail, p.comment_count, p.created_at, p.updated_at, ${AUTHOR_COLS}
         FROM board_posts p JOIN "user" u ON u.id = p.author_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY p.created_at DESC
        LIMIT $${params.length}`,
      params,
    );
    // toPost 는 누락된 content_blocks/media 를 [] 로 매핑 — 목록 응답은 자연히 경량화된다.
    return result.rows.map(toPost);
  }

  async getPost(id: string): Promise<BoardPost | null> {
    const r = await this.pool.query(
      `SELECT p.id, p.category, p.title, p.body, p.thumbnail, p.content_blocks, p.media, p.comment_count, p.created_at, p.updated_at, ${AUTHOR_COLS}
         FROM board_posts p JOIN "user" u ON u.id = p.author_id WHERE p.id = $1`,
      [id],
    );
    return r.rows[0] ? toPost(r.rows[0]) : null;
  }

  async createPost(input: { authorId: string; category: string; title: string; body: string; thumbnail: string | null; contentBlocks: unknown[]; media: BoardMedia[] }): Promise<BoardPost> {
    const r = await this.pool.query(
      `INSERT INTO board_posts (author_id, category, title, body, thumbnail, content_blocks, media)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb) RETURNING id`,
      [input.authorId, input.category, input.title, input.body, input.thumbnail, JSON.stringify(input.contentBlocks ?? []), JSON.stringify(input.media)],
    );
    const created = await this.getPost(r.rows[0].id as string);
    if (!created) throw new Error('board post created but not found');
    return created;
  }

  async updatePost(id: string, input: { category: string; title: string; body: string; thumbnail: string | null; contentBlocks: unknown[]; media: BoardMedia[] }): Promise<BoardPost | null> {
    const r = await this.pool.query(
      `UPDATE board_posts
          SET category = $2, title = $3, body = $4, thumbnail = $5, content_blocks = $6::jsonb, media = $7::jsonb, updated_at = NOW()
        WHERE id = $1 RETURNING id`,
      [id, input.category, input.title, input.body, input.thumbnail, JSON.stringify(input.contentBlocks ?? []), JSON.stringify(input.media)],
    );
    return r.rows[0] ? this.getPost(r.rows[0].id as string) : null;
  }

  async getPostAuthorId(id: string): Promise<string | null> {
    const r = await this.pool.query('SELECT author_id FROM board_posts WHERE id = $1', [id]);
    return r.rows[0] ? (r.rows[0].author_id as string) : null;
  }

  async deletePost(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM board_posts WHERE id = $1', [id]);
    return (r.rowCount ?? 0) > 0;
  }

  async listComments(postId: string): Promise<BoardComment[]> {
    // 무인증 공개 GET 이므로 결과를 하드 캡(무제한 조회 DoS 방지). 최신 500개만(오래된 댓글은 절단).
    const r = await this.pool.query(
      `SELECT * FROM (
         SELECT c.id, c.post_id, c.body, c.created_at, ${AUTHOR_COLS}
           FROM board_comments c JOIN "user" u ON u.id = c.author_id
          WHERE c.post_id = $1 ORDER BY c.created_at DESC LIMIT 500
       ) t ORDER BY t.created_at ASC`,
      [postId],
    );
    return r.rows.map(toComment);
  }

  async createComment(input: { postId: string; authorId: string; body: string }): Promise<BoardComment | null> {
    const ins = await this.pool.query(
      'INSERT INTO board_comments (post_id, author_id, body) VALUES ($1, $2, $3) RETURNING id',
      [input.postId, input.authorId, input.body],
    );
    await this.pool.query('UPDATE board_posts SET comment_count = comment_count + 1 WHERE id = $1', [input.postId]);
    const r = await this.pool.query(
      `SELECT c.id, c.post_id, c.body, c.created_at, ${AUTHOR_COLS}
         FROM board_comments c JOIN "user" u ON u.id = c.author_id WHERE c.id = $1`,
      [ins.rows[0].id as string],
    );
    return r.rows[0] ? toComment(r.rows[0]) : null;
  }

  async updateComment(id: string, body: string): Promise<BoardComment | null> {
    const upd = await this.pool.query('UPDATE board_comments SET body = $2 WHERE id = $1 RETURNING id', [id, body]);
    if (!upd.rows[0]) return null;
    const r = await this.pool.query(
      `SELECT c.id, c.post_id, c.body, c.created_at, ${AUTHOR_COLS}
         FROM board_comments c JOIN "user" u ON u.id = c.author_id WHERE c.id = $1`,
      [id],
    );
    return r.rows[0] ? toComment(r.rows[0]) : null;
  }

  async getCommentAuthorId(id: string): Promise<string | null> {
    const r = await this.pool.query('SELECT author_id FROM board_comments WHERE id = $1', [id]);
    return r.rows[0] ? (r.rows[0].author_id as string) : null;
  }

  async deleteComment(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM board_comments WHERE id = $1 RETURNING post_id', [id]);
    if (!r.rows[0]) return false;
    await this.pool.query(
      'UPDATE board_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1',
      [r.rows[0].post_id as string],
    );
    return true;
  }
}
