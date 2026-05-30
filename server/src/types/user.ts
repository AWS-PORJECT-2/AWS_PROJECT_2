export type UserRole = 'USER' | 'ADMIN';

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
  createdAt: Date;
  lastLoginAt: Date;
}
