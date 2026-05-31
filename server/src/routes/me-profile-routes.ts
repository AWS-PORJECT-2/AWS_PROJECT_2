import type { Request, Response } from 'express';
import type { UserRepository, ProfilePatch } from '../repositories/user-repository.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token-repository.js';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { PgRewardOrderRepository } from '../repositories/pg-reward-order-repository.js';
import type { NotificationPrefs } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';
import { serializeMe, resolvePrefs } from './profile-serializer.js';

const NAME_MAX = 40;
const NICK_MAX = 50;
const INTRO_MAX = 500;
const WEBSITE_MAX = 255;
const SLUG_MAX = 50;
const PHONE_RE = /^[0-9\-+ ]{7,20}$/;
const SLUG_RE = /^[가-힣a-z0-9](?:[가-힣a-z0-9-]{0,48}[가-힣a-z0-9])?$/; // 닉네임: 한글/소문자/숫자/하이픈, 1~50자, 양끝 한글·영숫자
const THEME_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MAX_PICTURE_CHARS = 4_000_000;  // 프로필 이미지 data URL 약 3MB
const MAX_COVER_CHARS = 8_000_000;    // 커버 이미지 data URL 약 6MB

const PREF_KEYS = ['message', 'projectUpdate', 'subscribedOpen', 'likedDeadline', 'follow', 'marketing'] as const;

function isImage(v: string): boolean {
  return /^https?:\/\//.test(v) || /^data:image\/(png|jpe?g|webp);base64,/.test(v);
}

/**
 * PATCH /api/me — 프로필 일부 수정.
 * body 일부: {name,nickname,intro,website,picture,coverUrl,themeColor,slug,phone}
 */
export function createUpdateMeHandler(userRepo: UserRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: ProfilePatch = {};
    const bad = (msg: string) => res.status(400).json({ error: 'INVALID', message: msg });

    if (typeof body.name === 'string') {
      const v = body.name.trim();
      if (v.length === 0 || v.length > NAME_MAX) { bad('이름은 1~40자입니다'); return; }
      patch.name = v;
    }
    if (typeof body.nickname === 'string') {
      const v = body.nickname.trim();
      if (v.length === 0 || v.length > NICK_MAX) { bad('닉네임은 1~50자입니다'); return; }
      patch.nickname = v;
      patch.onboarded = true; // 닉네임 설정 = 온보딩 완료(기존 동작 유지)
    }
    if (typeof body.intro === 'string') {
      const v = body.intro.trim();
      if (v.length > INTRO_MAX) { bad('소개가 너무 깁니다(500자 이하)'); return; }
      patch.intro = v;
    }
    if (typeof body.website === 'string') {
      const v = body.website.trim();
      if (v && (!/^https?:\/\//.test(v) || v.length > WEBSITE_MAX)) { bad('웹사이트는 http(s) URL 이어야 합니다'); return; }
      patch.website = v;
    }
    if (typeof body.themeColor === 'string') {
      const v = body.themeColor.trim();
      if (v && !THEME_RE.test(v)) { bad('테마색은 hex 색상이어야 합니다'); return; }
      patch.themeColor = v;
    }
    if (typeof body.phone === 'string') {
      const v = body.phone.trim();
      if (v && !PHONE_RE.test(v)) { bad('전화번호 형식이 올바르지 않습니다'); return; }
      patch.phone = v;
    }
    if (typeof body.slug === 'string') {
      // 닉네임(프로필 주소). 영문은 소문자로 정규화하되 한글은 그대로 허용.
      const v = body.slug.trim().toLowerCase();
      if (!SLUG_RE.test(v) || v.length > SLUG_MAX) { bad('닉네임은 한글/영문/숫자/하이픈 2~50자입니다'); return; }
      patch.slug = v;
    }
    if (typeof body.picture === 'string') {
      const v = body.picture;
      if (v.length > MAX_PICTURE_CHARS || !isImage(v)) { bad('프로필 이미지 형식/용량이 올바르지 않습니다'); return; }
      patch.picture = v;
    }
    if (typeof body.coverUrl === 'string') {
      const v = body.coverUrl;
      if (v && (v.length > MAX_COVER_CHARS || !isImage(v))) { bad('커버 이미지 형식/용량이 올바르지 않습니다'); return; }
      patch.coverUrl = v;
    }

    if (Object.keys(patch).length === 0) { res.status(400).json({ error: 'EMPTY', message: '변경할 내용이 없습니다' }); return; }

    try {
      const updated = await userRepo.updateProfile(userId, patch);
      if (!updated) { res.status(404).json({ error: 'USER_NOT_FOUND', message: '계정을 찾을 수 없습니다' }); return; }
      res.json(serializeMe(updated));
    } catch (err) {
      // slug 부분 유니크 인덱스 위반
      if ((err as { code?: string })?.code === '23505') {
        res.status(409).json({ error: 'SLUG_TAKEN', message: '이미 사용 중인 슬러그입니다' });
        return;
      }
      logger.error({ err, userId }, '프로필 수정 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** PATCH /api/me/notifications — 알림 설정 일부 갱신. */
export function createUpdateNotificationsHandler(userRepo: UserRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const prefs: NotificationPrefs = {};
    for (const k of PREF_KEYS) {
      if (typeof body[k] === 'boolean') prefs[k] = body[k] as boolean;
    }
    if (Object.keys(prefs).length === 0) {
      res.status(400).json({ error: 'EMPTY', message: '변경할 알림 설정이 없습니다' });
      return;
    }
    try {
      const merged = await userRepo.updateNotificationPrefs(userId, prefs);
      res.json(resolvePrefs(merged));
    } catch (err) {
      logger.error({ err, userId }, '알림 설정 갱신 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/me/consent — 약관/개인정보/만14세 동의 + 마케팅 수신 여부. */
export function createConsentHandler(userRepo: UserRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.terms !== true || body.privacy !== true || body.age14 !== true) {
      res.status(400).json({ error: 'CONSENT_REQUIRED', message: '필수 약관에 모두 동의해야 합니다' });
      return;
    }
    const marketingOptIn = body.marketing === true;
    try {
      const result = await userRepo.setConsent(userId, { marketingOptIn });
      res.json({ ok: true, termsAgreedAt: result.termsAgreedAt.toISOString(), marketingOptIn: result.marketingOptIn });
    } catch (err) {
      logger.error({ err, userId }, '약관 동의 처리 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * DELETE /api/me — 회원 탈퇴 (#3).
 * 사전 점검: 개설한 펀드(살아있는 것)나 활성 주문(입금대기/확정/취소요청)이 있으면 바로 탈퇴 불가(409).
 *  - 둘 다 없으면 refresh 세션 정리 후 user 삭제(204).
 *  - 사전 점검으로 FK RESTRICT 류 500 을 회피하되, 그래도 23503 이 나면 안전 메시지로 흡수.
 */
export function createDeleteMeHandler(
  userRepo: UserRepository,
  refreshTokenRepo?: RefreshTokenRepository,
  groupBuyRepo?: GroupBuyRepository,
  rewardOrderRepo?: PgRewardOrderRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      // 사전 점검 1 — 본인이 개설한 살아있는 펀드가 있으면 차단.
      if (groupBuyRepo) {
        const funds = await groupBuyRepo.countActiveByCreator(userId);
        if (funds > 0) {
          res.status(409).json({
            error: 'HAS_FUNDS',
            message: '개설한 프로젝트가 있어 바로 탈퇴할 수 없어요. 프로젝트 삭제 요청 후 처리되면 탈퇴할 수 있어요.',
            funds,
          });
          return;
        }
      }
      // 사전 점검 2 — 활성 주문(입금대기/확정/취소요청)이 있으면 차단.
      if (rewardOrderRepo) {
        const orders = await rewardOrderRepo.countActiveByUser(userId);
        if (orders > 0) {
          res.status(409).json({
            error: 'HAS_ORDERS',
            message: '참여 중인 펀딩이 있어 바로 탈퇴할 수 없어요. 펀딩 취소 후 탈퇴해 주세요.',
            orders,
          });
          return;
        }
      }

      // refresh 세션 우선 정리(있으면). user 삭제는 CASCADE 로 정리되지만 명시적으로 먼저 시도.
      if (refreshTokenRepo) {
        try { await refreshTokenRepo.deleteByUserId(userId); } catch { /* best-effort */ }
      }
      await userRepo.delete(userId);
      ['access_token', 'refresh_token', 'accessToken', 'refreshToken'].forEach((c) => res.clearCookie(c));
      logger.info({ userId }, '회원 탈퇴 완료');
      res.status(204).end();
    } catch (err) {
      // 사전 점검을 통과해도 남은 FK RESTRICT 류가 있으면 안전 메시지로 흡수(500 회피).
      if ((err as { code?: string })?.code === '23503') {
        res.status(409).json({ error: 'HAS_ACTIVITY', message: '진행 중인 펀드·주문 내역이 있어 바로 탈퇴할 수 없습니다. 고객지원(1:1 문의)으로 요청해 주세요.' });
        return;
      }
      logger.error({ err, userId }, '회원 탈퇴 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
