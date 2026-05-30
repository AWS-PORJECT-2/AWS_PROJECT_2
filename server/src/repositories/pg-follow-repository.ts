import type pg from 'pg';
import type { FollowUser } from '../types/index.js';
import type { FollowRepository } from './follow-repository.js';

/** 팔로우 저장소 — 후원자(follower)가 창작자(creator)를 팔로우. */
export class PgFollowRepository implements FollowRepository {
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

  // 기존 호출부(follows.ts 라우트) 호환용 별칭.
  async followerCount(creatorId: string): Promise<number> {
    return this.countFollowers(creatorId);
  }

  async followingCount(followerId: string): Promise<number> {
    return this.countFollowing(followerId);
  }

  async countFollowers(creatorId: string): Promise<number> {
    const r = await this.pool.query('SELECT COUNT(*)::int c FROM follows WHERE creator_id = $1', [creatorId]);
    return r.rows[0]?.c ?? 0;
  }

  async countFollowing(followerId: string): Promise<number> {
    const r = await this.pool.query('SELECT COUNT(*)::int c FROM follows WHERE follower_id = $1', [followerId]);
    return r.rows[0]?.c ?? 0;
  }

  /** creatorId 를 팔로우하는 유저 목록. viewerId 기준 isFollowing 계산. */
  async listFollowers(creatorId: string, viewerId?: string): Promise<FollowUser[]> {
    const r = await this.pool.query(
      `SELECT u.id, u.name, u.nickname, u.slug, u.picture,
              CASE WHEN $2::uuid IS NULL THEN FALSE
                   ELSE EXISTS (SELECT 1 FROM follows vf WHERE vf.creator_id = u.id AND vf.follower_id = $2::uuid)
              END AS is_following
         FROM follows f
         JOIN "user" u ON u.id = f.follower_id
        WHERE f.creator_id = $1
        ORDER BY f.created_at DESC`,
      [creatorId, viewerId ?? null],
    );
    return r.rows.map(mapFollowUser);
  }

  /** userId 가 팔로우하는 메이커 목록. viewerId 기준 isFollowing 계산. */
  async listFollowing(userId: string, viewerId?: string): Promise<FollowUser[]> {
    const r = await this.pool.query(
      `SELECT u.id, u.name, u.nickname, u.slug, u.picture,
              CASE WHEN $2::uuid IS NULL THEN FALSE
                   ELSE EXISTS (SELECT 1 FROM follows vf WHERE vf.creator_id = u.id AND vf.follower_id = $2::uuid)
              END AS is_following
         FROM follows f
         JOIN "user" u ON u.id = f.creator_id
        WHERE f.follower_id = $1
        ORDER BY f.created_at DESC`,
      [userId, viewerId ?? null],
    );
    return r.rows.map(mapFollowUser);
  }
}

function mapFollowUser(row: Record<string, unknown>): FollowUser {
  return {
    userId: row.id as string,
    name: row.name as string,
    nickname: (row.nickname as string | null) ?? null,
    slug: (row.slug as string | null) ?? null,
    picture: (row.picture as string | null) ?? null,
    isFollowing: Boolean(row.is_following),
  };
}
