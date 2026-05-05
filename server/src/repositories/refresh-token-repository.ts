import type { RefreshToken } from '../types/index.js';

const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/;

export interface RefreshTokenRepository { save(token: RefreshToken): Promise<void>; findByTokenHash(hash: string): Promise<RefreshToken | null>; deleteByTokenHash(hash: string): Promise<void>; deleteByUserId(userId: string): Promise<void>; }
export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly tokens = new Map<string, RefreshToken>();
  async save(token: RefreshToken) {
    if (!SHA256_HEX_REGEX.test(token.token)) {
      throw new Error('RefreshToken.token must be a SHA-256 hash, not a raw token');
    }
    this.tokens.set(token.token, { ...token });
  }
  async findByTokenHash(hash: string) { return this.tokens.get(hash) ?? null; }
  async deleteByTokenHash(hash: string) { this.tokens.delete(hash); }
  async deleteByUserId(userId: string) { for (const [k, v] of this.tokens) { if (v.userId === userId) this.tokens.delete(k); } }
}
