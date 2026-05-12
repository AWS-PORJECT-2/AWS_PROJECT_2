import type { User } from '../types/index.js';
/**
 * User repository interface.
 * IMPORTANT: All email lookups and storage MUST use lowercase-normalized values.
 * The DB enforces uniqueness via LOWER() functional index (see migration 002),
 * and the application layer must always pass lowercased emails to stay consistent.
 */
export interface UserRepository {
  create(user: User): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  updateLastLogin(userId: string): Promise<void>;
}
