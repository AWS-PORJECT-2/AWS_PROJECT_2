import type pg from 'pg';
import type { OAuthState } from '../types/index.js';
import type { OAuthStateRepository } from './oauth-state-repository.js';

export class PgOAuthStateRepository implements OAuthStateRepository {
  constructor(private readonly pool: pg.Pool) {}

  async save(state: OAuthState): Promise<void> {
    await this.pool.query(
      `INSERT INTO oauth_state (state, remember_me, created_at, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (state) DO UPDATE SET remember_me = $2, expires_at = $4`,
      [state.state, state.rememberMe, state.createdAt, state.expiresAt],
    );
  }

  async findByState(state: string): Promise<OAuthState | null> {
    const result = await this.pool.query(
      `SELECT * FROM oauth_state WHERE state = $1`,
      [state],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      state: row.state as string,
      rememberMe: row.remember_me as boolean,
      createdAt: new Date(row.created_at as string),
      expiresAt: new Date(row.expires_at as string),
    };
  }

  async delete(state: string): Promise<void> {
    await this.pool.query(`DELETE FROM oauth_state WHERE state = $1`, [state]);
  }

  async deleteExpired(): Promise<void> {
    await this.pool.query(`DELETE FROM oauth_state WHERE expires_at <= NOW()`);
  }
}
