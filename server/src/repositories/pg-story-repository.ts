import type pg from 'pg';
import { randomUUID } from 'node:crypto';

export interface StoryVote {
  q: string;      // 질문
  a: string;      // 옵션 A
  b: string;      // 옵션 B
  x?: number;     // 스티커 위치 x(%)
  y?: number;     // 스티커 위치 y(%)
}

export interface Story {
  id: string;
  authorId: string;
  authorName?: string | null;
  authorPicture?: string | null;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  vote: StoryVote | null;
  voteCounts?: { a: number; b: number };
  myVote?: number | null; // 0 | 1 | null
  createdAt: Date;
  expiresAt: Date;
}

/** 스토리 저장소 — 24시간 휘발성. 만료본은 조회에서 제외 + 스케줄러 정리. */
export class PgStoryRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(authorId: string, mediaUrl: string, mediaType: 'image' | 'video', vote: StoryVote | null): Promise<string> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO stories (id, author_id, media_url, media_type, vote) VALUES ($1, $2, $3, $4, $5)`,
      [id, authorId, mediaUrl, mediaType, vote ? JSON.stringify(vote) : null],
    );
    return id;
  }

  /** viewerId 의 크루(상호 accepted) + 본인의 살아있는 스토리 목록. 작성자별로 묶어 최신순. */
  async listForViewer(viewerId: string): Promise<Story[]> {
    const r = await this.pool.query(
      `SELECT s.id, s.author_id, s.media_url, s.media_type, s.vote, s.created_at, s.expires_at,
              u.name, u.nickname, u.picture
         FROM stories s
         JOIN "user" u ON u.id = s.author_id
        WHERE s.expires_at > NOW()
          AND (
            s.author_id = $1
            OR (
              EXISTS (SELECT 1 FROM follows f1 WHERE f1.follower_id = $1 AND f1.creator_id = s.author_id AND f1.status = 'accepted')
              AND EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_id = s.author_id AND f2.creator_id = $1 AND f2.status = 'accepted')
            )
          )
        ORDER BY s.created_at DESC
        LIMIT 200`,
      [viewerId],
    );
    const stories: Story[] = [];
    for (const row of r.rows) {
      const vote = row.vote ? (typeof row.vote === 'string' ? JSON.parse(row.vote) : row.vote) : null;
      let voteCounts: { a: number; b: number } | undefined;
      let myVote: number | null = null;
      if (vote) {
        const vc = await this.pool.query(
          `SELECT option, COUNT(*)::int c FROM story_votes WHERE story_id = $1 GROUP BY option`,
          [row.id],
        );
        voteCounts = { a: 0, b: 0 };
        for (const v of vc.rows) { if (v.option === 0) voteCounts.a = v.c; else voteCounts.b = v.c; }
        const mine = await this.pool.query('SELECT option FROM story_votes WHERE story_id = $1 AND voter_id = $2', [row.id, viewerId]);
        myVote = mine.rows.length ? mine.rows[0].option : null;
      }
      stories.push({
        id: row.id,
        authorId: row.author_id,
        authorName: row.nickname || row.name || '회원',
        authorPicture: row.picture ?? null,
        mediaUrl: row.media_url,
        mediaType: row.media_type,
        vote,
        voteCounts,
        myVote,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      });
    }
    return stories;
  }

  /** 투표(1인 1표, 재투표 시 갱신). 동시성: ON CONFLICT 로 upsert. */
  async vote(storyId: string, voterId: string, option: 0 | 1): Promise<{ a: number; b: number }> {
    // 스토리 존재 + 만료 안 됨 + 투표 스티커 있음 확인
    const s = await this.pool.query('SELECT vote FROM stories WHERE id = $1 AND expires_at > NOW()', [storyId]);
    if (!s.rows.length || !s.rows[0].vote) throw new Error('STORY_NOT_VOTABLE');
    await this.pool.query(
      `INSERT INTO story_votes (story_id, voter_id, option) VALUES ($1, $2, $3)
       ON CONFLICT (story_id, voter_id) DO UPDATE SET option = EXCLUDED.option, created_at = NOW()`,
      [storyId, voterId, option],
    );
    const vc = await this.pool.query(
      `SELECT option, COUNT(*)::int c FROM story_votes WHERE story_id = $1 GROUP BY option`,
      [storyId],
    );
    const counts = { a: 0, b: 0 };
    for (const v of vc.rows) { if (v.option === 0) counts.a = v.c; else counts.b = v.c; }
    return counts;
  }

  /** 만료 스토리 정리(스케줄러/부팅 시 호출). 삭제 행 수 반환. */
  async purgeExpired(): Promise<number> {
    const r = await this.pool.query('DELETE FROM stories WHERE expires_at <= NOW()');
    return r.rowCount ?? 0;
  }
}
