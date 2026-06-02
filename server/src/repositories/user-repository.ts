import type { User, UserStatus, NotificationPrefs, PublicProfile, UserSearchItem } from '../types/index.js';

/** 관리자 계정 상태 변경 입력. status=SUSPENDED 면 until 필수(기간정지). */
export interface StatusPatch {
  status: UserStatus;
  suspendedUntil?: Date | null;
  reason?: string | null;
  adminId?: string | null;
}
/**
 * User repository interface.
 * IMPORTANT: All email lookups and storage MUST use lowercase-normalized values.
 * The DB enforces uniqueness via LOWER() functional index (see migration 002),
 * and the application layer must always pass lowercased emails to stay consistent.
 */
export interface ProfilePatch {
  name?: string;
  picture?: string;
  nickname?: string;
  phone?: string;
  realName?: string;
  onboarded?: boolean;
  intro?: string;
  website?: string;
  coverUrl?: string;
  themeColor?: string;
  slug?: string;
}

export interface UserRepository {
  create(user: User): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  updateLastLogin(userId: string): Promise<void>;
  updateProfile(userId: string, data: ProfilePatch): Promise<User | null>;
  /** 권한 변경. 강등(USER)은 마지막 활동관리자 보호 가드를 거치며 위반 시 AppError('LAST_ADMIN'). */
  setRole(userId: string, role: User['role']): Promise<void>;
  /** 로그인 가능한 관리자 수(role=ADMIN AND status=ACTIVE) — 본인 탈퇴 시 마지막 관리자 락아웃 방지용. */
  countActiveAdmins(): Promise<number>;
  listAll(limit?: number): Promise<User[]>;
  delete(userId: string): Promise<void>;

  // ─── 관리자 제재(037_user_moderation) ───
  /** 계정 상태 변경(정지/차단/탈퇴/복구). 파괴적 변경이 마지막 활동관리자면 AppError('LAST_ADMIN'). 반환 = 갱신된 사용자. */
  setStatus(userId: string, patch: StatusPatch): Promise<User | null>;
  /** 기간정지가 만료됐으면 ACTIVE 로 자동 복구(best-effort, 멱등). */
  clearExpiredSuspension(userId: string): Promise<void>;

  // ─── 소셜/공개 프로필 (006_social_features) ───
  findBySlug(slug: string): Promise<User | null>;
  searchByNameOrNickname(q: string): Promise<UserSearchItem[]>;
  updateNotificationPrefs(userId: string, prefs: NotificationPrefs): Promise<NotificationPrefs>;
  setConsent(userId: string, data: { marketingOptIn: boolean }): Promise<{ termsAgreedAt: Date; marketingOptIn: boolean }>;
  getPublicProfile(idOrSlug: string, viewerId?: string): Promise<PublicProfile | null>;
}
