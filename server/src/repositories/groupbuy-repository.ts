import type { GroupBuy, GroupBuyStatus, ContentBlock, CreatorInfo } from '../types/index.js';
import type { PoolClient } from 'pg';

// 관리자 부분 수정에 허용되는 필드(화이트리스트). 모두 선택적 — 제공된 키만 갱신.
// creatorId/status/finalPrice/rewardTiers 등은 의도적으로 제외(다른 전용 메서드/플로우가 담당).
export interface GroupBuyUpdateFields {
  title?: string;
  category?: string;
  description?: string;
  basePrice?: number;
  designFee?: number;
  coverImageUrl?: string | null;
  contentBlocks?: ContentBlock[] | null;
  deadline?: Date;
  targetQuantity?: number;
  plan?: string;                      // 'start'|'run'|'boost' — 022_create_extras
  videoUrl?: string | null;           // 대표 영상 — 022_create_extras
  creatorInfo?: CreatorInfo | null;   // 창작자 정보 — 022_create_extras
  refundPolicy?: string | null;       // 교환·반품 정책(스토리와 분리) — 023_plan_features
  legalNotice?: string | null;        // 정보고시/법적 고지(스토리와 분리) — 023_plan_features
}

export interface GroupBuyListItem extends GroupBuy {
  imageUrl?: string | null;
  authorName?: string | null;
  authorDepartment?: string | null;
  category?: string | null;
}

export interface GroupBuyListOptions {
  category?: string;
  sort?: 'popular' | 'latest';
  limit?: number;
  offset?: number;
  q?: string;
  status?: string;      // 특정 상태만 (예: 'open' 공개목록, 'pending' 관리자 심사목록)
  creatorId?: string;   // 특정 작성자 펀드만 (마이페이지 '제작한 펀딩')
}

// API 계약 <groupbuy 목록 아이템> — 공개 목록/상세 응답의 공통 코어.
export interface GroupBuyCardItem {
  id: string;
  title: string;
  creatorId: string;
  creatorName: string | null;
  creatorSlug: string | null;
  category: string | null;
  coverImageUrl: string | null;
  currentQuantity: number;
  targetQuantity: number;
  achievementRate: number;
  deadline: string;          // ISO
  status: GroupBuyStatus;
  createdAt: string;         // ISO
}

export interface GroupBuyDetail extends GroupBuyCardItem {
  description: string;
  basePrice: number;
  designFee: number;
  platformFee: number;
  finalPrice: number;
  mode: string;
  plan: string;                                  // 'start'|'run'|'boost' — 022_create_extras
  videoUrl: string | null;                       // 대표 영상 — 022_create_extras
  creatorInfo: import('../types/index.js').CreatorInfo | null; // 창작자 정보 — 022_create_extras
  refundPolicy: string | null;                   // 교환·반품 정책(스토리와 분리) — 023_plan_features
  legalNotice: string | null;                    // 정보고시/법적 고지(스토리와 분리) — 023_plan_features
  openAt: string | null;                         // 공개예정 오픈 예정시각 ISO — 023_plan_features
  viewCount: number;                             // 상세 조회수(분석) — 023_plan_features
  isSubscribed: boolean;                         // viewer 의 공개예정 알림 구독 여부 — 023_plan_features
  subscriberCount: number;                       // 공개예정 알림 구독자 수 — 023_plan_features
  contentBlocks: Array<{ type: 'text' | 'image'; text?: string; url?: string }>;
  rewardTiers: Array<{ title: string; price: number; desc: string; soldCount: number; stock?: number | null }>;
  maker: {
    userId: string;
    name: string | null;
    slug: string | null;
    picture: string | null;
    followerCount: number;
    isFollowing: boolean;
  };
}

export interface GroupBuyFindManyOptions {
  sort?: 'popular' | 'latest' | 'ending';
  category?: string;
  creatorId?: string;
  limit?: number;
  offset?: number;
}

export interface GroupBuyRepository {
  create(groupbuy: GroupBuy): Promise<GroupBuy>;
  findById(id: string): Promise<GroupBuy | null>;
  findExpiredOpen(now: Date): Promise<GroupBuy[]>;
  updateStatus(id: string, status: GroupBuyStatus): Promise<void>;
  incrementQuantity(id: string, amount: number, client?: PoolClient | null): Promise<void>;
  decrementQuantity(id: string, amount: number, client?: PoolClient | null): Promise<void>;
  list(options: GroupBuyListOptions): Promise<{ items: GroupBuyListItem[]; total: number }>;
  requestDelete(id: string, userId: string, reason: string): Promise<boolean>;
  listDeleteRequests(): Promise<DeleteRequestItem[]>;
  cancelFund(id: string): Promise<void>;
  updateRewards(id: string, rewardTiers: import('../types/index.js').RewardTier[], finalPrice: number): Promise<void>;
  // 관리자 부분 수정(대리개설 편집 등) — 화이트리스트 필드만 동적 갱신. creator_id 등은 절대 미포함.
  updateFields(id: string, fields: GroupBuyUpdateFields): Promise<GroupBuy | null>;

  // ─── 공개 목록/상세 (006_social_features 계약) ───
  findMany(options: GroupBuyFindManyOptions): Promise<{ total: number; rows: GroupBuyCardItem[] }>;
  findByCreator(creatorId: string): Promise<GroupBuyCardItem[]>;
  // 여러 창작자의 공개(open) 펀드를 최신순으로 — 팔로잉 피드용. creatorIds 가 비면 빈 결과.
  findOpenByCreators(creatorIds: string[], limit?: number, offset?: number): Promise<{ total: number; rows: GroupBuyCardItem[] }>;
  getDetail(id: string, viewerId?: string): Promise<GroupBuyDetail | null>;

  // ─── 요금제 기능 3종 (023_plan_features) ───
  // 공개예정 목록 — status=scheduled AND open_at>now, open_at 오름차순.
  findScheduled(limit?: number, offset?: number): Promise<{ total: number; rows: GroupBuyCardItem[] }>;
  // Boost 배너 — plan='boost' AND status='open' 펀드(최신/달성순) 최대 limit 개.
  findBoostBanners(limit?: number): Promise<Array<{ id: string; title: string; coverImageUrl: string | null; creatorName: string | null }>>;
  // 공개예정 알림 구독/취소(UPSERT/DELETE) → 구독자 수. 본인 펀드 구독 가능(제한 없음).
  subscribe(userId: string, groupbuyId: string): Promise<number>;
  unsubscribe(userId: string, groupbuyId: string): Promise<number>;
  // 상세 조회수 += 1 (best-effort, 비차단). 실패해도 throw 하지 않음.
  incrementViewCount(id: string): Promise<void>;
  // open_at <= now 인 scheduled → open 전환. 전환된 펀드 id 목록 반환(알림 best-effort 용).
  promoteScheduledToOpen(now: Date): Promise<string[]>;
  // 공개예정 알림 구독자(user_id) 목록 — 오픈 시 scheduled_open 알림 발송 대상.
  subscriberUserIds(groupbuyId: string): Promise<string[]>;
  // 본인 펀드 분석 — 본인 소유가 아니면 null. reward_orders 실제 컬럼 집계.
  getAnalytics(id: string, ownerId: string): Promise<GroupBuyAnalytics | null>;
}

// 본인 펀드 분석(GET /api/me/funds/:id/analytics) — 023_plan_features
export interface GroupBuyAnalytics {
  viewCount: number;
  backerCount: number;       // 후원 주문 건수(awaiting_deposit+confirmed)
  confirmedCount: number;    // 입금확정 건수
  totalAmount: number;       // 확정 후원 금액 합
  achievementRate: number;   // current/target %
  subscriberCount: number;   // 공개예정 알림 구독자 수
  daily: Array<{ date: string; backers: number }>; // 최근 14일 일자별 후원 건수
}

export interface DeleteRequestItem {
  id: string;
  title: string;
  creatorId: string;
  authorName: string | null;
  imageUrl: string | null;
  deleteReason: string | null;
  deleteRequestedAt: Date | null;
  status: string;
}

