import type { User } from '../types';
export interface UserRepository { create(user: User): Promise<User>; findByEmail(email: string): Promise<User | null>; updateLastLogin(userId: string): Promise<void>; }
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();
  async create(user: User) { this.users.set(user.email.toLowerCase(), { ...user }); return { ...user }; }
  async findByEmail(email: string) { return this.users.get(email.toLowerCase()) ?? null; }
  async updateLastLogin(userId: string) { for (const u of this.users.values()) { if (u.id === userId) { u.lastLoginAt = new Date(); return; } } }
}
