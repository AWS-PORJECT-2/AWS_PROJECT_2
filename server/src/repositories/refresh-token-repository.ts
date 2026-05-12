import type { RefreshToken } from '../types/index.js';

export interface RefreshTokenRepository {
  save(token: RefreshToken): Promise<void>;
  findByTokenHash(hash: string): Promise<RefreshToken | null>;
  deleteByTokenHash(hash: string): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
}
