export type UserRole = 'USER' | 'ADMIN';
// 계정 상태(관리자 제재). ACTIVE 정상 / SUSPENDED 기간정지 / BANNED 영구정지 / WITHDRAWN 강제탈퇴.
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'WITHDRAWN';

/** 알림 설정 — 전 항목 boolean. 미설정 시 프론트 기본값으로 처리. */
export interface NotificationPrefs {
  message?: boolean;
  projectUpdate?: boolean;
  subscribedOpen?: boolean;
  likedDeadline?: boolean;
  follow?: boolean;
  marketing?: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  schoolDomain: string;
  picture?: string;
  role: UserRole;
  nickname?: string | null;
  phone?: string | null;
  realName?: string | null;
  onboarded?: boolean;
  // 소셜/공개 프로필 확장 (006_social_features)
  slug?: string | null;
  intro?: string | null;
  website?: string | null;
  coverUrl?: string | null;
  themeColor?: string | null;
  notificationPrefs?: NotificationPrefs | null;
  termsAgreedAt?: Date | null;
  marketingOptIn?: boolean;
  // 관리자 제재(037_user_moderation)
  status?: UserStatus;
  suspendedUntil?: Date | null;
  suspensionReason?: string | null;
  createdAt: Date;
  lastLoginAt: Date;
}
