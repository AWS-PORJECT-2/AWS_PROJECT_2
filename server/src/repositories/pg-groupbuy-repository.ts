import type pg from 'pg';
import type { PoolClient } from 'pg';
import type { GroupBuy, GroupBuyStatus, ContentBlock, RewardTier } from '../types/index.js';
import type { GroupBuyRepository, GroupBuyListItem, GroupBuyListOptions } from './groupbuy-repository.js';

// content_blocks (TEXT/JSON) → ContentBlock[] 안전 파싱
function parseContentBlocks(raw: unknown): ContentBlock[] | null {
  if (raw == null) return null;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((b) => b && (b.type === 'text' || b.type === 'image') && typeof b.value === 'string')
      .map((b) => ({ type: b.type, value: b.value }));
  } catch {
    return null;
  }
}

// reward_tiers (TEXT/JSON) → RewardTier[] 안전 파싱
function parseRewardTiers(raw: unknown): RewardTier[] | null {
  if (raw == null) return null;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((t) => t && typeof t.title === 'string' && typeof t.price === 'number')
      .map((t) => ({
        id: String(t.id ?? ''),
        title: t.title,
        price: Number(t.price) || 0,
        description: typeof t.description === 'string' ? t.description : '',
        stockLimit: (t.stockLimit == null ? null : Number(t.stockLimit)),
        soldCount: Number(t.soldCount) || 0,
      }));
  } catch {
    return null;
  }
}

export class PgGroupBuyRepository implements GroupBuyRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(groupbuy: GroupBuy): Promise<GroupBuy> {
    const result = await this.pool.query(
      `INSERT INTO groupbuys (id, creator_id, fund_id, title, description, product_options, base_price, design_fee, platform_fee, final_price, target_quantity, current_quantity, deadline, status, design_image_url, tryon_image_url, content_blocks, category, reward_tiers, delegated, fee_rate, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
       RETURNING *`,
      [
        groupbuy.id, groupbuy.creatorId, groupbuy.fundId, groupbuy.title, groupbuy.description,
        JSON.stringify(groupbuy.productOptions), groupbuy.basePrice, groupbuy.designFee,
        groupbuy.platformFee, groupbuy.finalPrice, groupbuy.targetQuantity, groupbuy.currentQuantity,
        groupbuy.deadline, groupbuy.status, groupbuy.designImageUrl ?? null, groupbuy.tryonImageUrl ?? null,
        groupbuy.contentBlocks ? JSON.stringify(groupbuy.contentBlocks) : null,
        groupbuy.category ?? null,
        groupbuy.rewardTiers ? JSON.stringify(groupbuy.rewardTiers) : null,
        groupbuy.delegated ?? false, groupbuy.feeRate ?? 5,
        groupbuy.createdAt, groupbuy.updatedAt,
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

  // 작성자 본인 펀드에 삭제 요청 플래그 설정
  async requestDelete(id: string, userId: string, reason: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE groupbuys SET delete_requested = TRUE, delete_reason = $1, delete_requested_at = NOW()
        WHERE id = $2 AND creator_id = $3`,
      [reason || null, id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async listDeleteRequests() {
    const res = await this.pool.query(
      `SELECT g.id, g.title, g.creator_id, g.status, g.delete_reason, g.delete_requested_at,
              COALESCE(g.tryon_image_url, g.design_image_url) AS image_url, u.name AS author_name
         FROM groupbuys g LEFT JOIN "user" u ON u.id = g.creator_id
        WHERE g.delete_requested = TRUE ORDER BY g.delete_requested_at DESC`,
    );
    return res.rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      creatorId: r.creator_id as string,
      authorName: (r.author_name as string | null) ?? null,
      imageUrl: (r.image_url as string | null) ?? null,
      deleteReason: (r.delete_reason as string | null) ?? null,
      deleteRequestedAt: r.delete_requested_at ? new Date(r.delete_requested_at as string) : null,
      status: r.status as string,
    }));
  }

  // 관리자가 대리 펀드의 리워드/대표가격 설정
  async updateRewards(id: string, rewardTiers: RewardTier[], finalPrice: number): Promise<void> {
    await this.pool.query(
      `UPDATE groupbuys SET reward_tiers = $1, final_price = $2, updated_at = NOW() WHERE id = $3`,
      [JSON.stringify(rewardTiers), finalPrice, id],
    );
  }

  // 펀드 취소(삭제 처리) — status cancelled + 삭제요청 플래그 해제
  async cancelFund(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE groupbuys SET status = 'cancelled', delete_requested = FALSE, updated_at = NOW() WHERE id = $1`,
      [id],
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

  async list(options: GroupBuyListOptions): Promise<{ items: GroupBuyListItem[]; total: number }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    const where: string[] = [];
    const params: unknown[] = [];

    if (options.category && options.category !== 'all') {
      params.push(options.category);
      where.push(`g.category = $${params.length}`);
    }
    if (options.status) {
      params.push(options.status);
      where.push(`g.status = $${params.length}`);
    }
    if (options.creatorId) {
      params.push(options.creatorId);
      where.push(`g.creator_id = $${params.length}`);
    }
    if (options.q) {
      params.push(`%${options.q}%`);
      where.push(`g.title ILIKE $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderSql = options.sort === 'latest'
      ? 'ORDER BY g.created_at DESC'
      : 'ORDER BY g.current_quantity DESC, g.created_at DESC';

    params.push(limit);
    params.push(offset);

    // 목록은 가볍게: 큰 base64 컬럼(design_image_url/tryon_image_url)은 통째로 안 가져오고
    // 썸네일 한 장만 COALESCE 로 뽑는다. (상세 페이지는 findById 에서 전체 컬럼 조회)
    const listQuery = `
      SELECT g.id, g.creator_id, g.fund_id, g.title, g.description, g.product_options,
             g.base_price, g.design_fee, g.platform_fee, g.final_price,
             g.target_quantity, g.current_quantity, g.deadline, g.status, g.category,
             g.created_at, g.updated_at,
             COALESCE(g.tryon_image_url, g.design_image_url) AS image_url,
             u.name AS author_name, u.school_domain AS author_department
        FROM groupbuys g
        LEFT JOIN "user" u ON u.id = g.creator_id
        ${whereSql}
        ${orderSql}
        LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countQuery = `SELECT COUNT(*)::int AS cnt FROM groupbuys g ${whereSql}`;
    const countParams = params.slice(0, params.length - 2);

    const [listRes, countRes] = await Promise.all([
      this.pool.query(listQuery, params),
      this.pool.query(countQuery, countParams),
    ]);

    const items = listRes.rows.map((row) => {
      const base = this.mapRow(row);
      return {
        ...base,
        // 썸네일: 모델 피팅 우선, 없으면 디자인 사진 (list SELECT 의 COALESCE image_url),
        // 그래도 없으면 product_options.imageUrl (구 mock/외부 URL 호환)
        imageUrl: (row.image_url as string | null)
          ?? ((row.product_options && typeof row.product_options === 'object'
            ? (row.product_options as Record<string, unknown>).imageUrl as string | null
            : null) ?? null),
        authorName: (row.author_name as string | null) ?? null,
        authorDepartment: (row.author_department as string | null) ?? null,
        // category 는 base(mapRow)가 row.category 로 채움
      } as GroupBuyListItem;
    });

    return { items, total: Number(countRes.rows[0].cnt) };
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
      category: (row.category as string | null) ?? null,
      rewardTiers: parseRewardTiers(row.reward_tiers),
      delegated: (row.delegated as boolean | undefined) ?? false,
      feeRate: (row.fee_rate as number | undefined) ?? 5,
      basePrice: row.base_price as number,
      designFee: row.design_fee as number,
      platformFee: row.platform_fee as number,
      finalPrice: row.final_price as number,
      targetQuantity: row.target_quantity as number,
      currentQuantity: row.current_quantity as number,
      deadline: new Date(row.deadline as string),
      status: row.status as GroupBuyStatus,
      designImageUrl: (row.design_image_url as string | null) ?? null,
      tryonImageUrl: (row.tryon_image_url as string | null) ?? null,
      contentBlocks: parseContentBlocks(row.content_blocks),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
