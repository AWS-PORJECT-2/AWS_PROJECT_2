import type pg from 'pg';
import type { PoolClient } from 'pg';
import type { Participation, ParticipationStatus } from '../types/index.js';
import type { ParticipationRepository } from './participation-repository.js';

export class PgParticipationRepository implements ParticipationRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(participation: Participation, client?: PoolClient | null): Promise<Participation> {
    const queryable = client ?? this.pool;
    const result = await queryable.query(
      `INSERT INTO participations (id, groupbuy_id, user_id, billing_key, selected_options, quantity, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        participation.id, participation.groupbuyId, participation.userId,
        participation.billingKey, JSON.stringify(participation.selectedOptions),
        participation.quantity, participation.status, participation.createdAt, participation.updatedAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findByUserAndGroupBuy(userId: string, groupbuyId: string): Promise<Participation | null> {
    const result = await this.pool.query(
      'SELECT * FROM participations WHERE user_id = $1 AND groupbuy_id = $2',
      [userId, groupbuyId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findConfirmedByGroupBuy(groupbuyId: string): Promise<Participation[]> {
    const result = await this.pool.query(
      `SELECT * FROM participations WHERE groupbuy_id = $1 AND status = 'confirmed'`,
      [groupbuyId],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async updateStatus(id: string, status: ParticipationStatus, client?: PoolClient | null): Promise<void> {
    const queryable = client ?? this.pool;
    await queryable.query(
      'UPDATE participations SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id],
    );
  }

  async cancelAllByGroupBuy(groupbuyId: string): Promise<void> {
    await this.pool.query(
      `UPDATE participations SET status = 'cancelled', updated_at = NOW() WHERE groupbuy_id = $1 AND status != 'cancelled'`,
      [groupbuyId],
    );
  }

  private mapRow(row: Record<string, unknown>): Participation {
    return {
      id: row.id as string,
      groupbuyId: row.groupbuy_id as string,
      userId: row.user_id as string,
      billingKey: row.billing_key as string,
      selectedOptions: (typeof row.selected_options === 'string'
        ? JSON.parse(row.selected_options)
        : row.selected_options) as Record<string, string>,
      quantity: row.quantity as number,
      status: row.status as ParticipationStatus,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
