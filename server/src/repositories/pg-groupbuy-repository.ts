import type pg from 'pg';
import type { GroupBuy, GroupBuyStatus, ContentBlock, RewardTier, CreatorInfo } from '../types/index.js';
import type {
  GroupBuyRepository, GroupBuyListItem, GroupBuyListOptions,
  GroupBuyCardItem, GroupBuyDetail, GroupBuyFindManyOptions, GroupBuyUpdateFields, GroupBuyAnalytics,
  AnalyticsTier, ContentBlockContract,
} from './groupbuy-repository.js';
import { normalizeContentBlocks } from '../utils/content-blocks.js';
import { logger } from '../logger.js';

// content_blocks (TEXT/JSON) → ContentBlock[] 안전 파싱.
// 리치 스키마(text/image/split + variant/align/width/imageSide)를 그대로 복원·재검증.
// DB 는 내부 ContentBlock 형태(JSON)로 저장하므로 normalizeContentBlocks 가 그대로 수용.
function parseContentBlocks(raw: unknown): ContentBlock[] | null {
  if (raw == null) return null;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const blocks = normalizeContentBlocks(arr);
    return blocks.length ? blocks : null;
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

// creator_info (JSONB/TEXT) → CreatorInfo 안전 파싱. 알 수 없는 키는 버리고 5개 필드만 추린다.
function parseCreatorInfo(raw: unknown): CreatorInfo | null {
  if (raw == null) return null;
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
  const result: CreatorInfo = {};
  if (str(o.name) !== undefined) result.name = str(o.name);
  if (typeof o.image === 'string') result.image = o.image;
  else if (o.image === null) result.image = null;
  if (str(o.intro) !== undefined) result.intro = str(o.intro);
  if (str(o.sido) !== undefined) result.sido = str(o.sido);
  if (str(o.sigungu) !== undefined) result.sigungu = str(o.sigungu);
  return Object.keys(result).length ? result : null;
}

function achievementRate(current: number, target: number): number {
  return target > 0 ? Math.round((current / target) * 100) : 0;
}

// 펀딩 목표 금액 결정 — target_amount(금액 기준)가 있으면 그것, 없으면(NULL/0) 폴백으로
// (target_quantity × final_price) 를 목표로 사용(기존 수량기준 펀드 호환).
function resolveTargetAmount(row: Record<string, unknown>): number {
  const ta = Number(row.target_amount);
  if (Number.isFinite(ta) && ta > 0) return ta;
  const tq = Number(row.target_quantity) || 0;
  const fp = Number(row.final_price) || 0;
  return tq * fp;
}

// 달성 금액 — current_amount 캐시(활성 후원 금액 합계). 없으면 0.
function resolveAchievedAmount(row: Record<string, unknown>): number {
  return Number(row.current_amount) || 0;
}

// 달성률(금액 기준) — round(achieved/target*100). 목표가 0(폴백도 0)이면 수량 기준으로 폴백.
function amountAchievementRate(achievedAmount: number, targetAmount: number, currentQty: number, targetQty: number): number {
  if (targetAmount > 0) return Math.round((achievedAmount / targetAmount) * 100);
  return achievementRate(currentQty, targetQty); // 폴백: 수량 기준
}

// plus 요금제의 서포터 미리보기 개수(최근 N명). pro 는 전체(LIMIT 없음).
const SUPPORTER_PREVIEW_LIMIT = 10;

// 요금제(plan) → 분석 티어/라벨 매핑. start=Basic, run=Plus, boost=Professional.
// 알 수 없는 값은 안전하게 basic 으로 폴백.
function planToTier(plan: string): { tier: AnalyticsTier; planLabel: string } {
  switch (plan) {
    case 'run': return { tier: 'plus', planLabel: 'Plus' };
    case 'boost': return { tier: 'pro', planLabel: 'Professional' };
    case 'start':
    default: return { tier: 'basic', planLabel: 'Basic' };
  }
}

// DB row → 계약 <groupbuy 목록 아이템>
function toCardItem(row: Record<string, unknown>): GroupBuyCardItem {
  const current = Number(row.current_quantity) || 0;
  const target = row.target_quantity == null ? null : (Number(row.target_quantity) || 0);
  // 금액 기준 달성(와디즈/텀블벅식). 목표 금액이 0이면(폴백도 0) achievementRate 는 수량 기준으로 폴백.
  const targetAmount = resolveTargetAmount(row);
  const achievedAmount = resolveAchievedAmount(row);
  return {
    id: row.id as string,
    title: row.title as string,
    creatorId: row.creator_id as string,
    creatorName: (row.creator_name as string | null) ?? null,
    creatorSlug: (row.creator_slug as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    coverImageUrl: (row.cover_image_url as string | null) ?? null,
    currentQuantity: current,
    targetQuantity: target,
    targetAmount,
    achievedAmount,
    achievementRate: amountAchievementRate(achievedAmount, targetAmount, current, target ?? 0),
    deadline: new Date(row.deadline as string).toISOString(),
    status: row.status as GroupBuyStatus,
    createdAt: new Date(row.created_at as string).toISOString(),
    // 찜(좋아요) — like_count 서브쿼리/집계, is_liked 는 viewer IN/조인 결과(없으면 0/false).
    likeCount: Number(row.like_count) || 0,
    isLiked: Boolean(row.is_liked),
    subscriberCount: Number(row.subscriber_count) || 0,
    openAt: row.open_at ? new Date(row.open_at as string).toISOString() : null,  // 공개예정 D-day 배지용(scheduled 목록)
  };
}

// 내부 ContentBlock → 공개 상세 계약(ContentBlockContract). 리치 필드(스타일/정렬/크기/좌우배치)를 보존.
// 스타일 미지정(하위호환 원본)이면 스키마 기본값(text body/left, image full/center, split right/left)으로 채운다.
function contentBlocksToContract(blocks: ContentBlock[] | null): ContentBlockContract[] {
  if (!blocks) return [];
  return blocks.map((b): ContentBlockContract => {
    if (b.type === 'text') {
      return { type: 'text', text: b.value, variant: b.variant ?? 'body', align: b.align ?? 'left' };
    }
    if (b.type === 'image') {
      return { type: 'image', url: b.value, width: b.width ?? 'full', align: b.align ?? 'center' };
    }
    if (b.type === 'html') {
      return { type: 'html', html: b.html };
    }
    // split
    return { type: 'split', text: b.text, url: b.image, imageSide: b.imageSide ?? 'right', align: b.align ?? 'left' };
  });
}

// 내부 RewardTier → 계약 형태({title, price, desc, soldCount, stock?})
function rewardTiersToContract(tiers: RewardTier[] | null): Array<{ title: string; price: number; desc: string; soldCount: number; stock?: number | null }> {
  if (!tiers) return [];
  return tiers.map((t) => ({
    title: t.title,
    price: t.price,
    desc: t.description ?? '',
    soldCount: t.soldCount ?? 0,
    stock: t.stockLimit ?? null,
  }));
}

export class PgGroupBuyRepository implements GroupBuyRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(groupbuy: GroupBuy): Promise<GroupBuy> {
    const result = await this.pool.query(
      `INSERT INTO groupbuys (id, creator_id, fund_id, title, description, product_options, base_price, design_fee, platform_fee, final_price, target_quantity, current_quantity, deadline, status, design_image_url, tryon_image_url, content_blocks, category, reward_tiers, delegated, fee_rate, cover_image_url, mode, plan, video_url, creator_info, open_at, refund_policy, legal_notice, target_amount, current_amount, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
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
        groupbuy.coverImageUrl ?? null, groupbuy.mode ?? 'normal',
        groupbuy.plan ?? 'start', groupbuy.videoUrl ?? null,
        groupbuy.creatorInfo ? JSON.stringify(groupbuy.creatorInfo) : null,
        groupbuy.openAt ?? null, groupbuy.refundPolicy ?? null, groupbuy.legalNotice ?? null,
        // 펀딩 목표 금액(원). 신규 개설의 핵심 입력. 활성 후원 금액 합계 캐시는 개설 시 0.
        groupbuy.targetAmount ?? null, groupbuy.currentAmount ?? 0,
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

  // 관리자 게시글 숨김/표시 토글 — 삭제(deleted_at)된 건 제외. 실제 변경된 행이 있으면 true.
  async setHidden(id: string, hidden: boolean): Promise<boolean> {
    const res = await this.pool.query(
      'UPDATE groupbuys SET hidden = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL',
      [hidden, id],
    );
    return (res.rowCount ?? 0) > 0;
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

  // 회원 탈퇴 가드(#3) — 본인이 개설한 살아있는 펀드 수(soft-delete 제외).
  async countActiveByCreator(creatorId: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM groupbuys WHERE creator_id = $1 AND deleted_at IS NULL`,
      [creatorId],
    );
    return Number(res.rows[0]?.cnt) || 0;
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
    // platform_fee 도 새 final_price × 보관된 fee_rate(%) 로 재계산 — 대리(proxy) 펀드는 개설 시 0/미확정으로
    // 두고 여기서 확정(funds-create buildProxy 주석의 "관리자 가격 설정 시 재계산" 이행). fee_rate NULL 은 0 처리.
    await this.pool.query(
      `UPDATE groupbuys
         SET reward_tiers = $1, final_price = $2,
             platform_fee = ROUND($2::numeric * COALESCE(fee_rate, 0) / 100.0),
             updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(rewardTiers), finalPrice, id],
    );
  }

  // 관리자 부분 수정 — 화이트리스트 컬럼만 동적 SET. creator_id/status 는 절대 포함 안 함.
  async updateFields(id: string, fields: GroupBuyUpdateFields): Promise<GroupBuy | null> {
    // 키 → 컬럼 매핑(화이트리스트). 여기 없는 키는 무시 → SQL 인젝션·권한밖 컬럼 변경 차단.
    const COLUMN: Record<string, string> = {
      title: 'title',
      category: 'category',
      description: 'description',
      basePrice: 'base_price',
      designFee: 'design_fee',
      coverImageUrl: 'cover_image_url',
      contentBlocks: 'content_blocks',
      deadline: 'deadline',
      targetQuantity: 'target_quantity',
      targetAmount: 'target_amount',
      plan: 'plan',
      videoUrl: 'video_url',
      creatorInfo: 'creator_info',
      refundPolicy: 'refund_policy',
      legalNotice: 'legal_notice',
    };

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(COLUMN)) {
      if (!(key in fields)) continue; // 제공된 필드만 갱신
      const raw = (fields as Record<string, unknown>)[key];
      // content_blocks / creator_info 는 JSON 직렬화해서 저장(컬럼은 JSONB). 나머지는 값 그대로.
      const value = (key === 'contentBlocks' || key === 'creatorInfo')
        ? (raw == null ? null : JSON.stringify(raw))
        : raw;
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }

    if (sets.length === 0) {
      // 갱신할 필드가 없으면 현재 상태 그대로 반환.
      return this.findById(id);
    }

    params.push(id);
    const result = await this.pool.query(
      `UPDATE groupbuys SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  // 관리자 펀드 삭제(soft delete) — status cancelled + deleted_at 타임스탬프 + 삭제요청 플래그 해제.
  // deleted_at 을 찍어 상세/목록/검색/피드/추천 등 모든 사용자 조회에서 제외한다(404).
  // status='cancelled' 는 목표 미달 종료 등에도 쓰일 수 있으나, 이 메서드는 관리자 삭제 전용 경로이므로
  // deleted_at 을 함께 기록해 "정상 종료된 펀드"와 "관리자가 삭제한 펀드"를 구분한다.
  async cancelFund(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE groupbuys SET status = 'cancelled', deleted_at = NOW(), delete_requested = FALSE, updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  async list(options: GroupBuyListOptions): Promise<{ items: GroupBuyListItem[]; total: number }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    // 삭제(soft delete)된 펀드는 모든 목록에서 제외.
    const where: string[] = ['g.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (options.category && options.category !== 'all') {
      params.push(options.category);
      where.push(`g.category = $${params.length}`);
    }
    if (options.status) {
      params.push(options.status);
      where.push(`g.status = $${params.length}`);
    }
    // 관리자 "숨김" 탭 — hidden=TRUE 만. (지정 안 하면 숨김 여부 무관하게 전부 — 소유자/관리자 목록은 숨긴 것도 보임)
    if (options.hidden === true) {
      where.push('g.hidden = TRUE');
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
             g.target_quantity, g.current_quantity, g.target_amount, g.current_amount,
             g.deadline, g.status, g.hidden, g.category,
             g.delegated, g.mode, g.reward_tiers,
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

  // ─── 공개 목록/상세 (계약 형태) ───

  async findMany(options: GroupBuyFindManyOptions, viewerId?: string): Promise<{ total: number; rows: GroupBuyCardItem[] }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    // 삭제(soft delete)된 펀드 + 관리자 숨김(hidden) 펀드는 공개 목록/검색/메이커 페이지에서 모두 제외.
    // (소유자라도 공개 메이커 페이지엔 안 나옴 — 본인 관리용 '내 펀드'(list())에서는 숨긴 것도 보임)
    const where: string[] = ['g.deleted_at IS NULL', 'g.hidden = FALSE'];
    const params: unknown[] = [];

    // 특정 메이커 페이지(creatorId)면: 비소유자 공개조회(publicOnly)는 비공개 상태(심사대기/대리의뢰/반려) 숨김,
    // 소유자(본인)는 rejected 만 제외한 전체. creatorId 없으면 공개(open)만.
    if (options.creatorId) {
      params.push(options.creatorId);
      where.push(`g.creator_id = $${params.length}`);
      if (options.publicOnly) where.push(`g.status NOT IN ('pending','pending_review','rejected')`);
      else where.push(`g.status <> 'rejected'`);
    } else if (options.sort === 'ended') {
      // 마감 탭 — 마감일이 지난(또는 종료 상태) 공개 프로젝트. 비공개/예정 상태는 제외.
      where.push(`g.status NOT IN ('pending','pending_review','rejected','scheduled')`);
      where.push(`(g.deadline < NOW() OR g.status IN ('achieved','failed','executing','completed','cancelled'))`);
    } else {
      where.push(`g.status = 'open'`);
    }
    if (options.category && options.category !== 'all') {
      params.push(options.category);
      where.push(`g.category = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    let orderSql: string;
    if (options.sort === 'latest') orderSql = 'ORDER BY g.created_at DESC';
    else if (options.sort === 'ending') orderSql = 'ORDER BY g.deadline ASC';
    else if (options.sort === 'ended') orderSql = 'ORDER BY g.deadline DESC'; // 최근 마감 먼저
    else orderSql = 'ORDER BY g.current_quantity DESC, g.created_at DESC'; // popular

    // viewer 의 isLiked — 로그인 시 LEFT JOIN 한 번으로 채움(목록 N+1 방지). 비로그인이면 NULL → false.
    params.push(viewerId ?? null);
    const viewerParam = params.length;

    params.push(limit);
    params.push(offset);

    const listQuery = `
      SELECT g.id, g.title, g.creator_id, g.category, g.current_quantity, g.target_quantity,
             g.target_amount, g.current_amount, g.final_price,
             g.deadline, g.status, g.created_at,
             COALESCE(g.cover_image_url, g.tryon_image_url, g.design_image_url) AS cover_image_url,
             u.name AS creator_name, u.slug AS creator_slug,
             (SELECT COUNT(*)::int FROM project_likes pl WHERE pl.groupbuy_id = g.id) AS like_count,
             (vl.user_id IS NOT NULL) AS is_liked
        FROM groupbuys g
        LEFT JOIN "user" u ON u.id = g.creator_id
        LEFT JOIN project_likes vl ON vl.groupbuy_id = g.id AND vl.user_id = $${viewerParam}::uuid
        ${whereSql}
        ${orderSql}
        LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    // count 는 whereSql 의 필터 파라미터만 사용 — viewer/limit/offset 3개는 제외(불일치 시 pg 오류).
    const countQuery = `SELECT COUNT(*)::int AS cnt FROM groupbuys g ${whereSql}`;
    const countParams = params.slice(0, params.length - 3);

    const [listRes, countRes] = await Promise.all([
      this.pool.query(listQuery, params),
      this.pool.query(countQuery, countParams),
    ]);

    return {
      total: Number(countRes.rows[0].cnt) || 0,
      rows: listRes.rows.map(toCardItem),
    };
  }

  async findByCreator(creatorId: string, opts?: { publicOnly?: boolean }): Promise<GroupBuyCardItem[]> {
    const { rows } = await this.findMany({ creatorId, publicOnly: opts?.publicOnly, sort: 'latest', limit: 100, offset: 0 });
    return rows;
  }

  // 팔로잉 피드 — 여러 창작자의 공개(open) 펀드만 최신순. creatorIds 가 비면 DB 조회 없이 빈 결과.
  async findOpenByCreators(
    creatorIds: string[],
    limit = 50,
    offset = 0,
    viewerId?: string,
  ): Promise<{ total: number; rows: GroupBuyCardItem[] }> {
    if (creatorIds.length === 0) return { total: 0, rows: [] };
    const lim = Math.min(Math.max(limit, 1), 100);
    const off = Math.max(offset, 0);

    // creator_id = ANY($1) — 파라미터화로 SQL 인젝션 차단. 공개(open)만, 최신순.
    // 찜: like_count 서브쿼리 + viewer($4) LEFT JOIN 으로 isLiked(목록 N+1 방지). 비로그인이면 false.
    const listQuery = `
      SELECT g.id, g.title, g.creator_id, g.category, g.current_quantity, g.target_quantity,
             g.target_amount, g.current_amount, g.final_price,
             g.deadline, g.status, g.created_at,
             COALESCE(g.cover_image_url, g.tryon_image_url, g.design_image_url) AS cover_image_url,
             u.name AS creator_name, u.slug AS creator_slug,
             (SELECT COUNT(*)::int FROM project_likes pl WHERE pl.groupbuy_id = g.id) AS like_count,
             (vl.user_id IS NOT NULL) AS is_liked
        FROM groupbuys g
        LEFT JOIN "user" u ON u.id = g.creator_id
        LEFT JOIN project_likes vl ON vl.groupbuy_id = g.id AND vl.user_id = $4::uuid
       WHERE g.status = 'open' AND g.deleted_at IS NULL AND g.hidden = FALSE AND g.creator_id = ANY($1::uuid[])
       ORDER BY g.created_at DESC
       LIMIT $2 OFFSET $3
    `;
    const countQuery = `
      SELECT COUNT(*)::int AS cnt FROM groupbuys g
       WHERE g.status = 'open' AND g.deleted_at IS NULL AND g.hidden = FALSE AND g.creator_id = ANY($1::uuid[])
    `;

    const [listRes, countRes] = await Promise.all([
      this.pool.query(listQuery, [creatorIds, lim, off, viewerId ?? null]),
      this.pool.query(countQuery, [creatorIds]),
    ]);

    return {
      total: Number(countRes.rows[0].cnt) || 0,
      rows: listRes.rows.map(toCardItem),
    };
  }

  async getDetail(id: string, viewerId?: string, viewerIsAdmin?: boolean): Promise<GroupBuyDetail | null> {
    const res = await this.pool.query(
      `SELECT g.*,
              COALESCE(g.cover_image_url, g.tryon_image_url, g.design_image_url) AS cover_image_url_resolved,
              u.id AS maker_id, u.name AS maker_name, u.slug AS maker_slug, u.picture AS maker_picture,
              (SELECT COUNT(*)::int FROM follows f WHERE f.creator_id = g.creator_id) AS maker_follower_count,
              CASE WHEN $2::uuid IS NULL THEN FALSE
                   ELSE EXISTS (SELECT 1 FROM follows f WHERE f.creator_id = g.creator_id AND f.follower_id = $2::uuid)
              END AS maker_is_following,
              (SELECT COUNT(*)::int FROM project_subscriptions ps WHERE ps.groupbuy_id = g.id) AS subscriber_count,
              CASE WHEN $2::uuid IS NULL THEN FALSE
                   ELSE EXISTS (SELECT 1 FROM project_subscriptions ps WHERE ps.groupbuy_id = g.id AND ps.user_id = $2::uuid)
              END AS is_subscribed,
              (SELECT COUNT(*)::int FROM project_likes pl WHERE pl.groupbuy_id = g.id) AS like_count,
              CASE WHEN $2::uuid IS NULL THEN FALSE
                   ELSE EXISTS (SELECT 1 FROM project_likes pl WHERE pl.groupbuy_id = g.id AND pl.user_id = $2::uuid)
              END AS is_liked
         FROM groupbuys g
         LEFT JOIN "user" u ON u.id = g.creator_id
        WHERE g.id = $1 AND g.deleted_at IS NULL`,
      [id, viewerId ?? null],
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];

    // 비공개 상태(심사대기/대리의뢰/반려) 또는 관리자 숨김(hidden) 상세는 소유자 또는 관리자만 열람 가능 — 그 외엔 null(→404).
    //  (scheduled/open/achieved/failed/executing/completed/cancelled 는 공개. scheduled 는 '공개예정' 노출 설계.)
    const PRIVATE_STATUSES = new Set(['pending', 'pending_review', 'rejected']);
    if (PRIVATE_STATUSES.has(r.status as string) || r.hidden === true) {
      const isOwner = !!viewerId && viewerId === (r.creator_id as string);
      if (!isOwner && !viewerIsAdmin) return null;
    }

    // 방어적: open_at 이 지난 scheduled 는 상세에서 open 으로 노출(스케줄러 전환 전 표시 보정).
    const openAt = r.open_at ? new Date(r.open_at as string) : null;
    const effectiveStatus = (r.status === 'scheduled' && openAt && openAt.getTime() <= Date.now())
      ? 'open'
      : (r.status as GroupBuyStatus);

    const card: GroupBuyCardItem = toCardItem({
      id: r.id,
      title: r.title,
      creator_id: r.creator_id,
      category: r.category,
      current_quantity: r.current_quantity,
      target_quantity: r.target_quantity,
      target_amount: r.target_amount,
      current_amount: r.current_amount,
      final_price: r.final_price,
      deadline: r.deadline,
      status: effectiveStatus,
      created_at: r.created_at,
      cover_image_url: r.cover_image_url_resolved,
      creator_name: r.maker_name,
      creator_slug: r.maker_slug,
      like_count: r.like_count,
      is_liked: r.is_liked,
    });

    return {
      ...card,
      description: (r.description as string) ?? '',
      basePrice: Number(r.base_price) || 0,
      designFee: Number(r.design_fee) || 0,
      platformFee: Number(r.platform_fee) || 0,
      finalPrice: Number(r.final_price) || 0,
      mode: (r.mode as string) ?? 'normal',
      plan: (r.plan as string) ?? 'start',
      videoUrl: (r.video_url as string | null) ?? null,
      creatorInfo: parseCreatorInfo(r.creator_info),
      refundPolicy: (r.refund_policy as string | null) ?? null,
      legalNotice: (r.legal_notice as string | null) ?? null,
      openAt: openAt ? openAt.toISOString() : null,
      viewCount: Number(r.view_count) || 0,
      hidden: r.hidden === true,   // 관리자 숨김 상태 — 상세에서 관리자 숨기기/표시 토글 노출용
      isSubscribed: Boolean(r.is_subscribed),
      subscriberCount: Number(r.subscriber_count) || 0,
      contentBlocks: contentBlocksToContract(parseContentBlocks(r.content_blocks)),
      rewardTiers: rewardTiersToContract(parseRewardTiers(r.reward_tiers)),
      maker: {
        userId: (r.maker_id as string) ?? (r.creator_id as string),
        name: (r.maker_name as string | null) ?? null,
        slug: (r.maker_slug as string | null) ?? null,
        picture: (r.maker_picture as string | null) ?? null,
        followerCount: Number(r.maker_follower_count) || 0,
        isFollowing: Boolean(r.maker_is_following) && viewerId !== (r.creator_id as string),
      },
    };
  }

  // ─── 요금제 기능 3종 (023_plan_features) ───

  // 공개예정 목록 — status=scheduled AND open_at>now, open_at 오름차순.
  async findScheduled(limit = 20, offset = 0): Promise<{ total: number; rows: GroupBuyCardItem[] }> {
    const lim = Math.min(Math.max(limit, 1), 100);
    const off = Math.max(offset, 0);
    const listQuery = `
      SELECT g.id, g.title, g.creator_id, g.category, g.current_quantity, g.target_quantity,
             g.target_amount, g.current_amount, g.final_price,
             g.deadline, g.status, g.created_at, g.open_at,
             COALESCE(g.cover_image_url, g.tryon_image_url, g.design_image_url) AS cover_image_url,
             u.name AS creator_name, u.slug AS creator_slug,
             (SELECT COUNT(*)::int FROM project_subscriptions ps WHERE ps.groupbuy_id = g.id) AS subscriber_count
        FROM groupbuys g
        LEFT JOIN "user" u ON u.id = g.creator_id
       WHERE g.status = 'scheduled' AND g.deleted_at IS NULL AND g.hidden = FALSE AND g.open_at IS NOT NULL AND g.open_at > NOW()
       ORDER BY g.open_at ASC
       LIMIT $1 OFFSET $2
    `;
    const countQuery = `
      SELECT COUNT(*)::int AS cnt FROM groupbuys g
       WHERE g.status = 'scheduled' AND g.deleted_at IS NULL AND g.hidden = FALSE AND g.open_at IS NOT NULL AND g.open_at > NOW()
    `;
    const [listRes, countRes] = await Promise.all([
      this.pool.query(listQuery, [lim, off]),
      this.pool.query(countQuery),
    ]);
    return { total: Number(countRes.rows[0].cnt) || 0, rows: listRes.rows.map(toCardItem) };
  }

  // Boost 배너 — plan='boost' AND status='open' 펀드. 달성순(현재수량) → 최신순.
  async findBoostBanners(limit = 5): Promise<Array<{ id: string; title: string; coverImageUrl: string | null; creatorName: string | null }>> {
    const lim = Math.min(Math.max(limit, 1), 20);
    const res = await this.pool.query(
      `SELECT g.id, g.title,
              COALESCE(g.cover_image_url, g.tryon_image_url, g.design_image_url) AS cover_image_url,
              u.name AS creator_name
         FROM groupbuys g
         LEFT JOIN "user" u ON u.id = g.creator_id
        WHERE g.plan = 'boost' AND g.status = 'open' AND g.deleted_at IS NULL AND g.hidden = FALSE
        ORDER BY g.current_quantity DESC, g.created_at DESC
        LIMIT $1`,
      [lim],
    );
    return res.rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      coverImageUrl: (r.cover_image_url as string | null) ?? null,
      creatorName: (r.creator_name as string | null) ?? null,
    }));
  }

  // 공개예정 알림 구독(UPSERT) → 구독자 수.
  async subscribe(userId: string, groupbuyId: string): Promise<number> {
    await this.pool.query(
      `INSERT INTO project_subscriptions (user_id, groupbuy_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, groupbuyId],
    );
    return this.subscriberCount(groupbuyId);
  }

  // 공개예정 알림 구독 취소 → 구독자 수.
  async unsubscribe(userId: string, groupbuyId: string): Promise<number> {
    await this.pool.query(
      `DELETE FROM project_subscriptions WHERE user_id = $1 AND groupbuy_id = $2`,
      [userId, groupbuyId],
    );
    return this.subscriberCount(groupbuyId);
  }

  // 공개예정 알림 구독자(user_id) 목록 — 오픈 시 scheduled_open 알림 발송 대상.
  async subscriberUserIds(groupbuyId: string): Promise<string[]> {
    const r = await this.pool.query(
      'SELECT user_id FROM project_subscriptions WHERE groupbuy_id = $1',
      [groupbuyId],
    );
    return r.rows.map((row) => row.user_id as string);
  }

  private async subscriberCount(groupbuyId: string): Promise<number> {
    const r = await this.pool.query(
      'SELECT COUNT(*)::int AS c FROM project_subscriptions WHERE groupbuy_id = $1',
      [groupbuyId],
    );
    return r.rows[0]?.c ?? 0;
  }

  // ─── 찜(좋아요) — 026_project_likes ───

  // 찜 추가(UPSERT). 펀드가 없거나 삭제됐으면 null(404). 있으면 추가 후 최신 좋아요 수.
  async like(userId: string, fundId: string): Promise<number | null> {
    const exists = await this.pool.query('SELECT 1 FROM groupbuys WHERE id = $1 AND deleted_at IS NULL', [fundId]);
    if (exists.rows.length === 0) return null;
    await this.pool.query(
      `INSERT INTO project_likes (user_id, groupbuy_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, fundId],
    );
    return this.countLikes(fundId);
  }

  // 찜 취소(DELETE). 펀드가 없거나 삭제됐으면 null(404). 있으면 삭제 후 최신 좋아요 수.
  async unlike(userId: string, fundId: string): Promise<number | null> {
    const exists = await this.pool.query('SELECT 1 FROM groupbuys WHERE id = $1 AND deleted_at IS NULL', [fundId]);
    if (exists.rows.length === 0) return null;
    await this.pool.query(
      `DELETE FROM project_likes WHERE user_id = $1 AND groupbuy_id = $2`,
      [userId, fundId],
    );
    return this.countLikes(fundId);
  }

  async countLikes(fundId: string): Promise<number> {
    const r = await this.pool.query(
      'SELECT COUNT(*)::int AS c FROM project_likes WHERE groupbuy_id = $1',
      [fundId],
    );
    return r.rows[0]?.c ?? 0;
  }

  // 사용자가 찜한 펀드 id 목록 — 최신 찜 순. 삭제(soft delete)된 펀드는 제외.
  async likedIdsByUser(userId: string): Promise<string[]> {
    const r = await this.pool.query(
      `SELECT pl.groupbuy_id FROM project_likes pl
         JOIN groupbuys g ON g.id = pl.groupbuy_id AND g.deleted_at IS NULL AND g.hidden = FALSE
        WHERE pl.user_id = $1 ORDER BY pl.created_at DESC`,
      [userId],
    );
    return r.rows.map((row) => row.groupbuy_id as string);
  }

  async isLiked(userId: string, fundId: string): Promise<boolean> {
    const r = await this.pool.query(
      'SELECT 1 FROM project_likes WHERE user_id = $1 AND groupbuy_id = $2',
      [userId, fundId],
    );
    return r.rows.length > 0;
  }

  // 상세 조회수 += 1 (best-effort, 비차단). 실패해도 throw 하지 않음.
  async incrementViewCount(id: string): Promise<void> {
    try {
      await this.pool.query('UPDATE groupbuys SET view_count = view_count + 1 WHERE id = $1', [id]);
    } catch (err) {
      logger.warn({ err, id }, '조회수 증가 실패(무시)');
    }
  }

  // open_at <= now 인 scheduled → open 전환. 전환된 펀드 id 목록 반환.
  async promoteScheduledToOpen(now: Date): Promise<string[]> {
    const res = await this.pool.query(
      `UPDATE groupbuys
          SET status = 'open', updated_at = NOW()
        WHERE status = 'scheduled' AND open_at IS NOT NULL AND open_at <= $1
        RETURNING id`,
      [now],
    );
    return res.rows.map((r) => r.id as string);
  }

  // 본인 펀드 분석 — 본인 소유가 아니면 null. reward_orders 실제 컬럼 집계 + 요금제(plan) 게이팅.
  // basic(start): summary + rewardBreakdown 만. plus(run): +추이/입금현황 + 서포터 최근 일부.
  // pro(boost): 전부 + 서포터 전체. 잠긴 기능은 lockedFeatures 로 알린다.
  // 추적 안 되는 지표는 만들어내지 않고 null/빈배열로 정직하게 둔다.
  async getAnalytics(id: string, ownerId: string): Promise<GroupBuyAnalytics | null> {
    const gRes = await this.pool.query(
      `SELECT view_count, current_quantity, target_quantity, target_amount, current_amount, final_price, status, deadline, plan
         FROM groupbuys WHERE id = $1 AND creator_id = $2`,
      [id, ownerId],
    );
    if (gRes.rows.length === 0) return null; // 없거나 본인 소유 아님 → 404
    const g = gRes.rows[0];
    const target = Number(g.target_quantity) || 0;
    const current = Number(g.current_quantity) || 0;
    // 금액 기준 펀딩(031) — 목표 금액(폴백: 수량×대표가), 달성 금액(current_amount 캐시).
    const targetAmount = resolveTargetAmount(g);
    const achievedAmount = resolveAchievedAmount(g);
    const status = String(g.status ?? '');
    const plan = String(g.plan ?? 'start');
    const { tier, planLabel } = planToTier(plan);

    // 마감까지 남은 일수 — 한국시간(KST, UTC+9) 캘린더 날짜 기준(프론트 WZ.dday 와 동일 공식).
    // 서버가 버지니아(UTC)라도 항상 KST 로 계산. 지났으면 0, 없으면 null.
    let daysLeft: number | null = null;
    if (g.deadline) {
      const t = new Date(g.deadline as string).getTime();
      if (Number.isFinite(t)) {
        const KST = 9 * 3_600_000;
        const dayOf = (ms: number): number => Math.floor((ms + KST) / 86_400_000);
        daysLeft = Math.max(0, dayOf(t) - dayOf(Date.now()));
      }
    }

    // 후원 집계 — 유효 후원: 예약(pledged)/결제완료(paid)/재시도중(payment_failed) + 구 무통장(awaiting_deposit/confirmed).
    //   실현 금액(total_amount): 실제 결제·입금된 건만 = paid(모의결제) + confirmed(구 무통장).
    const aggRes = await this.pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE status IN ('pledged','paid','payment_failed','awaiting_deposit','confirmed'))::int AS backer_count,
          COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','confirmed')), 0)::bigint AS total_amount
         FROM reward_orders WHERE fund_id = $1`,
      [id],
    );
    const agg = aggRes.rows[0] ?? {};

    const likeCount = await this.countLikes(id);

    const summary: GroupBuyAnalytics['summary'] = {
      backerCount: Number(agg.backer_count) || 0,
      totalAmount: Number(agg.total_amount) || 0,
      // 금액 기준 펀딩(031) — 목표/달성 금액 + 금액 기준 달성률(목표 0이면 수량 기준 폴백).
      targetAmount,
      achievedAmount,
      achievementRate: amountAchievementRate(achievedAmount, targetAmount, current, target),
      likeCount,
      daysLeft,
      status,
      soldQuantity: current,
      viewCount: Number(g.view_count) || 0,
      subscriberCount: await this.subscriberCount(id),
    };

    // 리워드(tier)별 후원 분포 — 주문 시점 스냅샷(reward_title)으로 그룹. 전 티어 공통(basic 포함).
    const breakdownRes = await this.pool.query(
      `SELECT reward_title, COUNT(*)::int AS count,
              COALESCE(SUM(amount), 0)::bigint AS amount
         FROM reward_orders
        WHERE fund_id = $1 AND status IN ('pledged','paid','payment_failed','awaiting_deposit','confirmed')
        GROUP BY reward_title
        ORDER BY count DESC, reward_title ASC`,
      [id],
    );
    const rewardBreakdown = breakdownRes.rows.map((r) => ({
      rewardLabel: (r.reward_title as string) || '리워드',
      count: Number(r.count) || 0,
      amount: Number(r.amount) || 0,
    }));

    // ── basic 기본값: 풍부한 지표는 비우고 lockedFeatures 로 잠금 표시 ──
    const result: GroupBuyAnalytics = {
      plan, planLabel, tier,
      summary,
      rewardBreakdown,
      fundingTimeline: [],
      likeTimeline: [],
      depositStatus: null,
      supporters: [],
      lockedFeatures: [],
    };

    if (tier === 'basic') {
      result.lockedFeatures = ['fundingTimeline', 'likeTimeline', 'depositStatus', 'supporters'];
      return result;
    }

    // ── plus/pro 공통: 일자별 후원 추이 / 좋아요 추이 / 입금 현황 ──
    const fundingRes = await this.pool.query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
              COUNT(*)::int AS backer_count,
              COALESCE(SUM(amount), 0)::bigint AS amount
         FROM reward_orders
        WHERE fund_id = $1 AND status IN ('pledged','paid','payment_failed','awaiting_deposit','confirmed')
        GROUP BY 1 ORDER BY 1 ASC`,
      [id],
    );
    result.fundingTimeline = fundingRes.rows.map((d) => ({
      date: d.date as string,
      backerCount: Number(d.backer_count) || 0,
      amount: Number(d.amount) || 0,
    }));

    const likeTlRes = await this.pool.query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
         FROM project_likes
        WHERE groupbuy_id = $1
        GROUP BY 1 ORDER BY 1 ASC`,
      [id],
    );
    result.likeTimeline = likeTlRes.rows.map((d) => ({ date: d.date as string, count: Number(d.count) || 0 }));

    // 결제 현황 — confirmed(완료): 실결제된 paid + 구 무통장 confirmed. pending(대기): 예약 pledged/재시도 payment_failed + 구 awaiting_deposit.
    const depRes = await this.pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE status IN ('paid','confirmed'))::int AS confirmed_count,
          COUNT(*) FILTER (WHERE status IN ('pledged','payment_failed','awaiting_deposit'))::int AS pending_count,
          COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','confirmed')), 0)::bigint AS confirmed_amount,
          COALESCE(SUM(amount) FILTER (WHERE status IN ('pledged','payment_failed','awaiting_deposit')), 0)::bigint AS pending_amount
         FROM reward_orders WHERE fund_id = $1`,
      [id],
    );
    const dep = depRes.rows[0] ?? {};
    result.depositStatus = {
      confirmedCount: Number(dep.confirmed_count) || 0,
      pendingCount: Number(dep.pending_count) || 0,
      confirmedAmount: Number(dep.confirmed_amount) || 0,
      pendingAmount: Number(dep.pending_amount) || 0,
    };

    // ── 서포터: 닉네임만(없으면 '익명 서포터'). 이메일/실명/전화 절대 미포함.
    //    pro=전체, plus=최근 일부(SUPPORTER_PREVIEW_LIMIT)만 + supporters_full 잠금.
    const supporterLimit = tier === 'pro' ? null : SUPPORTER_PREVIEW_LIMIT;
    const supRes = await this.pool.query(
      `SELECT COALESCE(NULLIF(TRIM(u.nickname), ''), '익명 서포터') AS nickname,
              o.amount, o.reward_title, o.status, o.created_at
         FROM reward_orders o
         LEFT JOIN "user" u ON u.id = o.user_id
        WHERE o.fund_id = $1 AND o.status IN ('pledged','paid','payment_failed','awaiting_deposit','confirmed')
        ORDER BY o.created_at DESC
        ${supporterLimit != null ? 'LIMIT $2' : ''}`,
      supporterLimit != null ? [id, supporterLimit] : [id],
    );
    result.supporters = supRes.rows.map((r) => ({
      nickname: (r.nickname as string) || '익명 서포터',
      amount: Number(r.amount) || 0,
      rewardLabel: (r.reward_title as string) || '리워드',
      status: r.status as string,
      backedAt: new Date(r.created_at as string).toISOString(),
    }));

    if (tier === 'plus') {
      result.lockedFeatures = ['supporters_full'];
    }

    return result;
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
      // 금액 기준 펀딩(031) — target_amount 가 핵심 목표, current_amount 는 활성 후원 합계 캐시.
      targetAmount: row.target_amount == null ? null : (Number(row.target_amount) || 0),
      currentAmount: Number(row.current_amount) || 0,
      targetQuantity: row.target_quantity == null ? null : (Number(row.target_quantity) || 0),
      currentQuantity: row.current_quantity as number,
      deadline: new Date(row.deadline as string),
      status: row.status as GroupBuyStatus,
      hidden: (row.hidden as boolean | undefined) ?? false,
      designImageUrl: (row.design_image_url as string | null) ?? null,
      tryonImageUrl: (row.tryon_image_url as string | null) ?? null,
      contentBlocks: parseContentBlocks(row.content_blocks),
      coverImageUrl: (row.cover_image_url as string | null) ?? null,
      mode: (row.mode as string | undefined) ?? 'normal',
      plan: (row.plan as string | undefined) ?? 'start',
      videoUrl: (row.video_url as string | null) ?? null,
      creatorInfo: parseCreatorInfo(row.creator_info),
      openAt: row.open_at ? new Date(row.open_at as string) : null,
      refundPolicy: (row.refund_policy as string | null) ?? null,
      legalNotice: (row.legal_notice as string | null) ?? null,
      viewCount: Number(row.view_count) || 0,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
