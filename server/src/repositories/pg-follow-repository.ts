import type pg from 'pg';

/** 팔로우 저장소 — 후원자(follower)가 창작자(creator)를 팔로우. */
export class PgFollowRepository {
  constructor(private readonly pool: pg.Pool) {}

  async follow(followerId: string, creatorId: string): Promise<void> {
    if (followerId === creatorId) return;
    await this.pool.query(
      `INSERT INTO follows (follower_id, creator_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [followerId, creatorId],
    );
  }

  async unfollow(followerId: string, creatorId: string): Promise<void> {
    await this.pool.query('DELETE FROM follows WHERE follower_id = $1 AND creator_id = $2', [followerId, creatorId]);
  }

  async isFollowing(followerId: string, creatorId: string): Promise<boolean> {
    const r = await this.pool.query('SELECT 1 FROM follows WHERE follower_id = $1 AND creator_id = $2', [followerId, creatorId]);
    return r.rows.length > 0;
  }

  async followerCount(creatorId: string): Promise<number> {
    const r = await this.pool.query('SELECT COUNT(*)::int c FROM follows WHERE creator_id = $1', [creatorId]);
    return r.rows[0]?.c ?? 0;
  }

  async followingCount(followerId: string): Promise<number> {
    const r = await this.pool.query('SELECT COUNT(*)::int c FROM follows WHERE follower_id = $1', [followerId]);
    return r.rows[0]?.c ?? 0;
  }
}
