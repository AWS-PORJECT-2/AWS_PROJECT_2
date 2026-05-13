import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export interface AppUser {
  id: number;
  username: string;
  name: string;
  role: 'USER' | 'ADMIN';
}

export interface MySQLUserRepository {
  findById(id: number): Promise<AppUser | null>;
  findByUsername(username: string): Promise<AppUser | null>;
  create(username: string, name: string, role: 'USER' | 'ADMIN'): Promise<AppUser>;
}

export class MySQLUserRepositoryImpl implements MySQLUserRepository {
  constructor(private pool: Pool) {}

  async findById(id: number): Promise<AppUser | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT id, username, name, role FROM users WHERE id = ?',
      [id]
    );
    if (rows.length === 0) return null;
    return this.mapToUser(rows[0]);
  }

  async findByUsername(username: string): Promise<AppUser | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT id, username, name, role FROM users WHERE username = ?',
      [username]
    );
    if (rows.length === 0) return null;
    return this.mapToUser(rows[0]);
  }

  async create(username: string, name: string, role: 'USER' | 'ADMIN'): Promise<AppUser> {
    const [result] = await this.pool.query<ResultSetHeader>(
      'INSERT INTO users (username, name, role) VALUES (?, ?, ?)',
      [username, name, role]
    );
    return {
      id: result.insertId,
      username,
      name,
      role,
    };
  }

  private mapToUser(row: RowDataPacket): AppUser {
    return {
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
    };
  }
}
