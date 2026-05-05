import type pg from 'pg';
import type { RefreshToken } from '../types/index.js';
import type { RefreshTokenRepository } from './refresh-token-repository.js';

export class PgRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly pool: pg.Pool) {}

  async save(token: RefreshToken): Promise<void> {
    await this.pool.query(
      `INSERT INTO refresh_token (id, user_id, token, remember_me, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (token) DO NOTHING`,
      [token.id, token.userId, token.token, token.rememberMe, token.expiresAt, token.createdAt],
    );
  }

  async findByTokenHash(hash: string): Promise<RefreshToken | null> {
    const result = await this.pool.query(
      `SELECT * FROM refresh_token WHERE token = $1`,
      [hash],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id as string,
      userId: row.user_id as string,
      token: row.token as string,
      rememberMe: row.remember_me as boolean,
      expiresAt: new Date(row.expires_at as string),
      createdAt: new Date(row.created_at as string),
    };
  }

  async deleteByTokenHash(hash: string): Promise<void> {
    await this.pool.query(`DELETE FROM refresh_token WHERE token = $1`, [hash]);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.pool.query(`DELETE FROM refresh_token WHERE user_id = $1`, [userId]);
  }
}
