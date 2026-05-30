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

