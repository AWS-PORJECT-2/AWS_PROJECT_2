export type UserRole = 'USER' | 'ADMIN';

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
  createdAt: Date;
  lastLoginAt: Date;
}
