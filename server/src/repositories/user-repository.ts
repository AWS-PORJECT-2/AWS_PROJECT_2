import type { User } from '../types/index.js';
/**
 * User repository interface.
 * IMPORTANT: All email lookups and storage MUST use lowercase-normalized values.
 * The DB enforces uniqueness via LOWER() functional index (see migration 002),
 * and the application layer must always pass lowercased emails to stay consistent.
 */
export interface UserRepository { create(user: User): Promise<User>; findByEmail(email: string): Promise<User | null>; updateLastLogin(userId: string): Promise<void>; }
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();
  async create(user: User) {
    const normalized = { ...user, email: user.email.toLowerCase() };
    this.users.set(normalized.email, { ...normalized });
    return { ...normalized };
  }
  async findByEmail(email: string) {
    const user = this.users.get(email.toLowerCase());
    return user ? { ...user } : null;
  }
  async updateLastLogin(userId: string) { for (const u of this.users.values()) { if (u.id === userId) { u.lastLoginAt = new Date(); return; } } }
}
