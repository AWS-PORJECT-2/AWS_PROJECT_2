import type { User, NotificationPrefs } from '../types/index.js';

// 알림설정 기본값 — 신규 가입/미설정 사용자에게 적용. 마케팅만 기본 false.
const DEFAULT_PREFS: Required<NotificationPrefs> = {
  message: true,
  projectUpdate: true,
  subscribedOpen: true,
  likedDeadline: true,
  follow: true,
  marketing: false,
};

export function resolvePrefs(prefs: NotificationPrefs | null | undefined): Required<NotificationPrefs> {
  return { ...DEFAULT_PREFS, ...(prefs ?? {}) };
}

/**
 * GET /api/auth/me · PATCH /api/me 공통 응답 직렬화.
 * 계약(소셜) 필드 + 기존 프론트가 쓰던 필드(role/realName/onboarded)를 superset 으로 반환해
 * 어느 클라이언트도 깨지지 않게 한다.
 */
export function serializeMe(user: User) {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    schoolDomain: user.schoolDomain,
    picture: user.picture ?? null,
    nickname: user.nickname ?? null,
    slug: user.slug ?? null,
    intro: user.intro ?? null,
    website: user.website ?? null,
    coverUrl: user.coverUrl ?? null,
    themeColor: user.themeColor ?? null,
    phone: user.phone ?? null,
    notificationPrefs: resolvePrefs(user.notificationPrefs),
    termsAgreedAt: user.termsAgreedAt ? user.termsAgreedAt.toISOString() : null,
    marketingOptIn: user.marketingOptIn ?? false,
    // ─── 하위호환(기존 프론트) ───
    role: user.role ?? 'USER',
    realName: user.realName ?? null,
    onboarded: user.onboarded ?? false,
  };
}
