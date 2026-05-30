import type { User, NotificationPrefs, PublicProfile, UserSearchItem } from '../types/index.js';
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
  setRole(userId: string, role: User['role']): Promise<void>;
  listAll(limit?: number): Promise<User[]>;
  delete(userId: string): Promise<void>;

  // ─── 소셜/공개 프로필 (006_social_features) ───
  findBySlug(slug: string): Promise<User | null>;
  searchByNameOrNickname(q: string): Promise<UserSearchItem[]>;
  updateNotificationPrefs(userId: string, prefs: NotificationPrefs): Promise<NotificationPrefs>;
  setConsent(userId: string, data: { marketingOptIn: boolean }): Promise<{ termsAgreedAt: Date; marketingOptIn: boolean }>;
  getPublicProfile(idOrSlug: string, viewerId?: string): Promise<PublicProfile | null>;
}
