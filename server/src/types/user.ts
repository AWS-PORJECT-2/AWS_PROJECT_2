export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  schoolDomain: string;
  picture?: string;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date;
}
