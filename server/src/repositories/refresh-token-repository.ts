import type { RefreshToken } from '../types/index.js';
export interface RefreshTokenRepository { save(token: RefreshToken): Promise<void>; findByTokenHash(hash: string): Promise<RefreshToken | null>; deleteByUserId(userId: string): Promise<void>; }
export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly tokens = new Map<string, RefreshToken>();
  async save(token: RefreshToken) { this.tokens.set(token.token, { ...token }); }
  async findByTokenHash(hash: string) { return this.tokens.get(hash) ?? null; }
  async deleteByUserId(userId: string) { for (const [k, v] of this.tokens) { if (v.userId === userId) this.tokens.delete(k); } }
}
