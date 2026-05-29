import type pg from 'pg';
import type { User, UserRole } from '../types/index.js';
import type { UserRepository } from './user-repository.js';

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(user: User): Promise<User> {
    const result = await this.pool.query(
      `INSERT INTO "user" (id, email, name, school_domain, picture, role, created_at, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        user.id,
        user.email.toLowerCase(),
        user.name,
        user.schoolDomain,
        user.picture ?? null,
        user.role ?? 'USER',
        user.createdAt,
        user.lastLoginAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query(
      `SELECT * FROM "user" WHERE email = $1`,
      [email.toLowerCase()],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query(
      `SELECT * FROM "user" WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE "user" SET last_login_at = NOW() WHERE id = $1`,
      [userId],
    );
  }

  async updateProfile(userId: string, data: { name?: string; picture?: string }): Promise<User | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { fields.push('name = $' + idx++); values.push(data.name); }
    if (data.picture !== undefined) { fields.push('picture = $' + idx++); values.push(data.picture); }

    if (fields.length === 0) return this.findById(userId);

    values.push(userId);
    const result = await this.pool.query(
      'UPDATE "user" SET ' + fields.join(', ') + ' WHERE id = $' + idx + ' RETURNING *',
      values,
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      email: row.email as string,
      name: row.name as string,
      schoolDomain: row.school_domain as string,
      picture: row.picture as string | undefined,
      role: (row.role as UserRole | undefined) ?? 'USER',
      createdAt: new Date(row.created_at as string),
      lastLoginAt: new Date(row.last_login_at as string),
    };
  }
}
