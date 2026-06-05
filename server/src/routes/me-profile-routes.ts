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
const NICK_MAX = 40;  // DB 컬럼 nickname VARCHAR(40)과 일치(초과 시 22001 → 500 방지).
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
      if (v.length === 0 || v.length > NICK_MAX) { bad('닉네임은 1~40자입니다'); return; }
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
      // '마케팅 메일' 토글은 실제 수신동의(marketing_opt_in)와 단일화 — 토글 변경 시 동의 플래그도 동기화(약관 재동의는 없음).
      //  (과거엔 토글이 notification_prefs.marketing 에만 저장돼 아무것도 게이트하지 못하고 marketing_opt_in 과 어긋났다.)
      if (typeof prefs.marketing === 'boolean') await userRepo.setMarketingOptIn(userId, prefs.marketing);
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

      // 사전 점검 3 — 본인이 마지막 활동 관리자이면 차단(관리자 0명 락아웃 방지). 다른 관리자 지정 후 탈퇴.
      const meUser = await userRepo.findById(userId);
      if (meUser && meUser.role === 'ADMIN' && (meUser.status ?? 'ACTIVE') === 'ACTIVE' && (await userRepo.countActiveAdmins()) <= 1) {
        res.status(409).json({ error: 'LAST_ADMIN', message: '마지막 관리자는 탈퇴할 수 없어요. 다른 관리자를 먼저 지정해 주세요.' });
        return;
      }

      // refresh 세션 우선 정리(있으면). user 삭제는 CASCADE 로 정리되지만 명시적으로 먼저 시도.
      if (refreshTokenRepo) {
        try { await refreshTokenRepo.deleteByUserId(userId); } catch { /* best-effort */ }
      }
      await userRepo.delete(userId);
      // 쿠키 path 를 발급 시점과 일치시켜야 실제로 삭제됨(refreshToken 은 '/api/auth' path 로 발급).
      res.clearCookie('accessToken', { path: '/' });
      res.clearCookie('refreshToken', { path: '/api/auth' });
      res.clearCookie('access_token', { path: '/' });   // 레거시 쿠키명 호환
      res.clearCookie('refresh_token', { path: '/' });
      logger.info({ userId }, '회원 탈퇴 완료');
      res.status(204).end();
    } catch (err) {
      // 사전 점검을 통과해도 남은 FK RESTRICT 류가 있으면 안전 메시지로 흡수(500 회피).
      // 23503=foreign_key_violation, 23001=restrict_violation(소프트삭제 펀드/레거시 참조 등).
      const code = (err as { code?: string })?.code;
      if (code === '23503' || code === '23001') {
        // 어떤 제약/참조가 막았는지 진단 로그(조용한 fail-close 방지) — 추후 연쇄삭제 보강 지점 파악용.
        logger.warn({ userId, code, constraint: (err as { constraint?: string }).constraint, detail: (err as { detail?: string }).detail }, '회원 탈퇴 FK 제약으로 차단');
        res.status(409).json({ error: 'HAS_ACTIVITY', message: '진행했던 펀드·주문 정리가 필요해 바로 탈퇴할 수 없어요. 고객지원(1:1 문의)으로 요청해 주세요.' });
        return;
      }
      logger.error({ err, userId }, '회원 탈퇴 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
