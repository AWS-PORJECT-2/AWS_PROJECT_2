import type pg from 'pg';
import type { PoolClient } from 'pg';
import type { GroupBuy, GroupBuyStatus } from '../types/index.js';
import type { GroupBuyRepository } from './groupbuy-repository.js';

export class PgGroupBuyRepository implements GroupBuyRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(groupbuy: GroupBuy): Promise<GroupBuy> {
    const result = await this.pool.query(
      `INSERT INTO groupbuys (id, creator_id, fund_id, title, description, product_options, base_price, design_fee, platform_fee, final_price, target_quantity, current_quantity, deadline, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        groupbuy.id, groupbuy.creatorId, groupbuy.fundId, groupbuy.title, groupbuy.description,
        JSON.stringify(groupbuy.productOptions), groupbuy.basePrice, groupbuy.designFee,
        groupbuy.platformFee, groupbuy.finalPrice, groupbuy.targetQuantity, groupbuy.currentQuantity,
        groupbuy.deadline, groupbuy.status, groupbuy.createdAt, groupbuy.updatedAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<GroupBuy | null> {
    const result = await this.pool.query('SELECT * FROM groupbuys WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findExpiredOpen(now: Date): Promise<GroupBuy[]> {
    const result = await this.pool.query(
      `SELECT * FROM groupbuys WHERE status = 'open' AND deadline <= $1`,
      [now],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async updateStatus(id: string, status: GroupBuyStatus): Promise<void> {
    await this.pool.query(
      'UPDATE groupbuys SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id],
    );
  }

  async incrementQuantity(id: string, amount: number, client?: PoolClient | null): Promise<void> {
    const queryable = client ?? this.pool;
    await queryable.query(
      'UPDATE groupbuys SET current_quantity = current_quantity + $1, updated_at = NOW() WHERE id = $2',
      [amount, id],
    );
  }

  async decrementQuantity(id: string, amount: number, client?: PoolClient | null): Promise<void> {
    const queryable = client ?? this.pool;
    await queryable.query(
      'UPDATE groupbuys SET current_quantity = current_quantity - $1, updated_at = NOW() WHERE id = $2',
      [amount, id],
    );
  }

  private mapRow(row: Record<string, unknown>): GroupBuy {
    return {
      id: row.id as string,
      creatorId: row.creator_id as string,
      fundId: (row.fund_id as string) ?? null,
      title: row.title as string,
      description: row.description as string,
      productOptions: (typeof row.product_options === 'string'
        ? JSON.parse(row.product_options)
        : row.product_options) as GroupBuy['productOptions'],
      basePrice: row.base_price as number,
      designFee: row.design_fee as number,
      platformFee: row.platform_fee as number,
      finalPrice: row.final_price as number,
      targetQuantity: row.target_quantity as number,
      currentQuantity: row.current_quantity as number,
      deadline: new Date(row.deadline as string),
      status: row.status as GroupBuyStatus,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
