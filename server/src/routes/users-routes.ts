import type { Request, Response } from 'express';
import type { UserRepository } from '../repositories/user-repository.js';
import type { FollowRepository } from '../repositories/follow-repository.js';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import { notify } from '../services/notify.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/users/search?q= — 이름/닉네임 부분일치, 최대 20. */
export function createUserSearchHandler(userRepo: UserRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const q = String(req.query.q ?? '').trim();
    if (q.length === 0) { res.json([]); return; }
    try {
      const items = await userRepo.searchByNameOrNickname(q.slice(0, 50), req.userId);
      res.json(items);
    } catch (err) {
      logger.error({ err }, '유저 검색 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/users/:idOrSlug — 공개 프로필. soft-auth(viewer 로 isFollowing/isMe 채움). */
export function createPublicProfileHandler(userRepo: UserRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const idOrSlug = req.params.idOrSlug;
    try {
      const profile = await userRepo.getPublicProfile(idOrSlug, req.userId);
      if (!profile) { res.status(404).json({ error: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다' }); return; }
      res.json(profile);
    } catch (err) {
      logger.error({ err, idOrSlug }, '공개 프로필 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/users/:idOrSlug/funds — 그 메이커가 올린 공구 목록. */
export function createUserFundsHandler(userRepo: UserRepository, groupBuyRepo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const idOrSlug = req.params.idOrSlug;
    try {
      let creatorId = idOrSlug;
      if (!UUID_RE.test(idOrSlug)) {
        const u = await userRepo.findBySlug(idOrSlug);
        if (!u) { res.status(404).json({ error: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다' }); return; }
        creatorId = u.id;
      }
      // 본인 메이커 페이지면 전체(rejected 제외), 타인(또는 비로그인)이면 비공개 상태(심사대기/대리의뢰/반려) 숨김.
      const isOwner = !!req.userId && req.userId === creatorId;
      const items = await groupBuyRepo.findByCreator(creatorId, { publicOnly: !isOwner });
      res.json({ items });
    } catch (err) {
      logger.error({ err, idOrSlug }, '메이커 공구 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/users/:id/follow — 팔로우(인증 필수). */
export function createFollowHandler(followRepo: FollowRepository, notificationRepo?: NotificationRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const targetId = req.params.id;
    if (!UUID_RE.test(targetId)) { res.status(400).json({ error: 'INVALID', message: '잘못된 대상입니다' }); return; }
    if (targetId === req.userId) { res.status(400).json({ error: 'SELF', message: '자기 자신은 팔로우할 수 없습니다' }); return; }
    try {
      if (await followRepo.isBlocked(targetId, req.userId)) { res.status(403).json({ error: 'BLOCKED', message: '차단되어 팔로우할 수 없습니다' }); return; }
      // 이미 팔로우 중이면(재시도·멀티탭·중복요청) follow() 는 멱등이지만 알림은 매번 가므로, 신규 팔로우일 때만 알림.
      const alreadyFollowing = await followRepo.isFollowing(req.userId, targetId);
      await followRepo.follow(req.userId, targetId);
      if (notificationRepo && !alreadyFollowing) {
        await notify(notificationRepo, { userId: targetId, type: 'new_follower', title: '새 팔로워', body: `${req.userName ?? '회원'}님이 회원님을 팔로우했어요` });
      }
      res.json({ following: true, followerCount: await followRepo.countFollowers(targetId) });
    } catch (err) {
      logger.error({ err, targetId }, '팔로우 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** DELETE /api/users/:id/follow — 언팔로우(인증 필수). */
export function createUnfollowHandler(followRepo: FollowRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const targetId = req.params.id;
    if (!UUID_RE.test(targetId)) { res.status(400).json({ error: 'INVALID', message: '잘못된 대상입니다' }); return; }
    try {
      await followRepo.unfollow(req.userId, targetId);
      res.json({ following: false, followerCount: await followRepo.countFollowers(targetId) });
    } catch (err) {
      logger.error({ err, targetId }, '언팔로우 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/users/:id/followers — 팔로워 목록. soft-auth. */
export function createFollowersHandler(followRepo: FollowRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const targetId = req.params.id;
    if (!UUID_RE.test(targetId)) { res.json([]); return; }
    try {
      res.json(await followRepo.listFollowers(targetId, req.userId));
    } catch (err) {
      logger.error({ err, targetId }, '팔로워 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/users/:id/following — 팔로잉 목록. soft-auth. */
export function createFollowingHandler(followRepo: FollowRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const targetId = req.params.id;
    if (!UUID_RE.test(targetId)) { res.json([]); return; }
    try {
      res.json(await followRepo.listFollowing(targetId, req.userId));
    } catch (err) {
      logger.error({ err, targetId }, '팔로잉 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

// ─── 프렌드십 (상호 수락) — 047_friendship ───

/** 관계 상태 계산: none | requested(내가 보냄) | incoming(상대가 보냄) | friends. */
async function friendState(followRepo: FollowRepository, meId: string, otherId: string): Promise<'none' | 'requested' | 'incoming' | 'friends'> {
  if (await followRepo.areFriends(meId, otherId)) return 'friends';
  const mine = await followRepo.getStatus(meId, otherId);   // 나→상대
  const theirs = await followRepo.getStatus(otherId, meId); // 상대→나
  if (mine === 'pending') return 'requested';
  if (theirs === 'pending') return 'incoming';
  return 'none';
}

/** GET /api/users/:id/friend — 관계 상태 조회(인증 선택). */
export function createFriendStatusHandler(followRepo: FollowRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const targetId = req.params.id;
    if (!UUID_RE.test(targetId)) { res.json({ state: 'none' }); return; }
    if (!req.userId || req.userId === targetId) { res.json({ state: 'none' }); return; }
    try {
      res.json({ state: await friendState(followRepo, req.userId, targetId) });
    } catch (err) {
      logger.error({ err, targetId }, '프렌드십 상태 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/users/:id/friend — 친구 요청(pending). 인증 필수. */
export function createFriendRequestHandler(followRepo: FollowRepository, notificationRepo?: NotificationRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const targetId = req.params.id;
    if (!UUID_RE.test(targetId)) { res.status(400).json({ error: 'INVALID', message: '잘못된 대상입니다' }); return; }
    if (targetId === req.userId) { res.status(400).json({ error: 'SELF', message: '자기 자신에게 친구 요청할 수 없습니다' }); return; }
    try {
      if (await followRepo.isBlocked(targetId, req.userId)) { res.status(403).json({ error: 'BLOCKED', message: '차단되어 요청할 수 없습니다' }); return; }
      // 상대가 이미 나에게 pending 을 보냈다면 → 요청이 아니라 즉시 수락 처리(양방향 accepted).
      const theirs = await followRepo.getStatus(targetId, req.userId);
      if (theirs === 'pending') {
        await followRepo.setStatus(targetId, req.userId, 'accepted');
        await followRepo.upsertFollow(req.userId, targetId, 'accepted');
        if (notificationRepo) await notify(notificationRepo, { userId: targetId, type: 'new_follower', title: '친구 수락', body: `${req.userName ?? '회원'}님과 친구가 되었어요` });
        res.json({ state: 'friends' });
        return;
      }
      await followRepo.upsertFollow(req.userId, targetId, 'pending');
      if (notificationRepo) await notify(notificationRepo, { userId: targetId, type: 'new_follower', title: '친구 요청', body: `${req.userName ?? '회원'}님이 친구 요청을 보냈어요` });
      res.json({ state: 'requested' });
    } catch (err) {
      logger.error({ err, targetId }, '친구 요청 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/users/:id/friend/accept — 상대(:id)의 요청 수락 → 양방향 accepted. 인증 필수. */
export function createFriendAcceptHandler(followRepo: FollowRepository, notificationRepo?: NotificationRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const requesterId = req.params.id;
    if (!UUID_RE.test(requesterId)) { res.status(400).json({ error: 'INVALID', message: '잘못된 대상입니다' }); return; }
    if (requesterId === req.userId) { res.status(400).json({ error: 'SELF', message: '잘못된 요청입니다' }); return; }
    try {
      // 상대→나 pending 이 있어야 수락 가능.
      const theirs = await followRepo.getStatus(requesterId, req.userId);
      if (theirs !== 'pending') { res.status(409).json({ error: 'NO_REQUEST', message: '수락할 친구 요청이 없습니다' }); return; }
      await followRepo.setStatus(requesterId, req.userId, 'accepted');
      await followRepo.upsertFollow(req.userId, requesterId, 'accepted');
      if (notificationRepo) await notify(notificationRepo, { userId: requesterId, type: 'new_follower', title: '친구 수락', body: `${req.userName ?? '회원'}님이 친구 요청을 수락했어요` });
      res.json({ state: 'friends' });
    } catch (err) {
      logger.error({ err, requesterId }, '친구 수락 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/me/friend-requests — 나에게 온 크루 요청 목록(incoming pending). 인증 필수. */
export function createIncomingFriendRequestsHandler(followRepo: FollowRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.json([]); return; }
    try {
      // 나를 향한 follows 중 status='pending' 인 요청자 목록.
      const followers = await followRepo.listFollowers(req.userId);
      const incoming: typeof followers = [];
      for (const f of followers) {
        const st = await followRepo.getStatus(f.userId, req.userId);
        if (st === 'pending') incoming.push(f);
      }
      res.json(incoming);
    } catch (err) {
      logger.error({ err }, '크루 요청 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** DELETE /api/users/:id/friend — 요청 취소 / 거절 / 친구 끊기(양방향 관계 해제). 인증 필수. */
export function createFriendRemoveHandler(followRepo: FollowRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const targetId = req.params.id;
    if (!UUID_RE.test(targetId)) { res.status(400).json({ error: 'INVALID', message: '잘못된 대상입니다' }); return; }
    try {
      // 양방향 모두 해제 — 요청취소(나→상대 pending), 거절(상대→나 pending), 친구끊기(양쪽 accepted) 모두 커버.
      await followRepo.unfollow(req.userId, targetId);
      await followRepo.unfollow(targetId, req.userId);
      res.json({ state: 'none' });
    } catch (err) {
      logger.error({ err, targetId }, '프렌드십 해제 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/users/:id/block — 차단(인증 필수). req.userId 가 :id 를 차단. */
export function createBlockHandler(followRepo: FollowRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const targetId = req.params.id;
    if (!UUID_RE.test(targetId)) { res.status(400).json({ error: 'INVALID', message: '잘못된 대상입니다' }); return; }
    if (targetId === req.userId) { res.status(400).json({ error: 'SELF', message: '자기 자신은 차단할 수 없습니다' }); return; }
    try {
      await followRepo.block(req.userId, targetId);
      res.json({ blocked: true });
    } catch (err) {
      logger.error({ err, targetId }, '차단 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** DELETE /api/users/:id/block — 차단 해제(인증 필수). */
export function createUnblockHandler(followRepo: FollowRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const targetId = req.params.id;
    if (!UUID_RE.test(targetId)) { res.status(400).json({ error: 'INVALID', message: '잘못된 대상입니다' }); return; }
    try {
      await followRepo.unblock(req.userId, targetId);
      res.json({ blocked: false });
    } catch (err) {
      logger.error({ err, targetId }, '차단 해제 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/me/blocks — 내가 차단한 유저 목록(인증 필수). */
export function createBlocksListHandler(followRepo: FollowRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      res.json(await followRepo.listBlocked(req.userId));
    } catch (err) {
      logger.error({ err }, '차단 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
