import type { FollowUser } from '../types/index.js';

/**
 * 팔로우 저장소 인터페이스. follower(후원자)가 creator(메이커)를 팔로우.
 * DB 스키마는 follows(follower_id, creator_id) — creator_id 가 "팔로우 당하는 대상".
 */
export interface FollowRepository {
  follow(followerId: string, creatorId: string): Promise<void>;
  unfollow(followerId: string, creatorId: string): Promise<void>;
  isFollowing(followerId: string, creatorId: string): Promise<boolean>;
  /** creatorId 를 팔로우하는 사람들. viewerId 가 있으면 각 행의 isFollowing 채움. */
  listFollowers(creatorId: string, viewerId?: string): Promise<FollowUser[]>;
  /** userId 가 팔로우하는 메이커들. viewerId 기준 isFollowing 채움. */
  listFollowing(userId: string, viewerId?: string): Promise<FollowUser[]>;
  countFollowers(creatorId: string): Promise<number>;
  countFollowing(userId: string): Promise<number>;
  /** blockerId 가 blockedId 를 차단(팔로우 금지) — 기존 양방향 팔로우도 해제. */
  block(blockerId: string, blockedId: string): Promise<void>;
  unblock(blockerId: string, blockedId: string): Promise<void>;
  isBlocked(blockerId: string, blockedId: string): Promise<boolean>;
  listBlocked(blockerId: string): Promise<FollowUser[]>;
}
