import type {
  GroupBuy, GroupBuyStatus, ContentBlock, CreatorInfo,
  ContentTextVariant, ContentAlign, ContentImageWidth, ContentImageSide,
} from '../types/index.js';

// 공개 상세 응답의 스토리 블록 계약(리치 스키마 보존). 내부 ContentBlock 을 계약 키로 옮긴 형태.
// text: {type:'text', text, variant, align} / image: {type:'image', url, width, align}
// split: {type:'split', text, url, imageSide, align} — image 는 계약상 url 키로 노출.
// html: {type:'html', html} — WYSIWYG 새니타이즈된 HTML(서버에서 한 번 더 새니타이즈됨). 프론트는 렌더 시 DOMPurify 로 1차 방어.
export type ContentBlockContract =
  | { type: 'text'; text: string; variant: ContentTextVariant; align: ContentAlign }
  | { type: 'image'; url: string; width: ContentImageWidth; align: ContentAlign }
  | { type: 'split'; text: string; url: string; imageSide: ContentImageSide; align: ContentAlign }
  | { type: 'html'; html: string };

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
  targetAmount?: number;              // 펀딩 목표 금액(원) — 031_groupbuy_amount_funding
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
  hidden?: boolean;     // true 면 관리자 숨김(hidden) 펀드만 (관리자 '숨김' 탭). 미지정이면 숨김 여부 무관 — 044
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
  currentQuantity: number;   // 참여 인원/건수 — "N명 참여" 표시용(목표 분모 아님)
  targetQuantity: number | null; // 목표 수량 — 선택/파생(없으면 null)
  // ─── 금액 기준 펀딩(와디즈/텀블벅식) — 031_groupbuy_amount_funding ───
  targetAmount: number;      // 펀딩 목표 금액(원). target_amount 폴백: (target_quantity × final_price)
  achievedAmount: number;    // 활성 후원 금액 합계(원) — groupbuys.current_amount 캐시
  achievementRate: number;   // 금액 기준 round(achievedAmount/targetAmount*100). 목표 0이면 수량기준 폴백
  deadline: string;          // ISO
  status: GroupBuyStatus;
  createdAt: string;         // ISO
  likeCount: number;         // 찜(좋아요) 수 — 모든 사용자 공통(026_project_likes)
  isLiked: boolean;          // viewer 의 찜 여부 — 비로그인/미찜이면 false
  subscriberCount?: number;  // 공개예정 알림 구독자 수 — scheduled 카드에서만 채워짐(그 외 0)
  openAt?: string | null;    // 공개예정 오픈 예정시각 ISO — scheduled 카드 D-day 배지용(그 외 null)
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
  hidden?: boolean;                              // 관리자 숨김 상태(관리자만 의미 — 상세 숨기기/표시 토글) — 044
  isSubscribed: boolean;                         // viewer 의 공개예정 알림 구독 여부 — 023_plan_features
  subscriberCount: number;                       // 공개예정 알림 구독자 수 — 023_plan_features
  contentBlocks: ContentBlockContract[];
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
  sort?: 'popular' | 'latest' | 'ending' | 'ended';
  category?: string;
  creatorId?: string;
  limit?: number;
  offset?: number;
  // creatorId 조회 시 true 면 비공개 상태(pending/pending_review/rejected)를 숨김(비소유자 공개 메이커 페이지용).
  publicOnly?: boolean;
}

export interface GroupBuyRepository {
  create(groupbuy: GroupBuy): Promise<GroupBuy>;
  findById(id: string): Promise<GroupBuy | null>;
  findExpiredOpen(now: Date): Promise<GroupBuy[]>;
  updateStatus(id: string, status: GroupBuyStatus): Promise<void>;
  // 관리자 게시글 숨김/표시 — 044. status 와 독립.
  setHidden(id: string, hidden: boolean): Promise<boolean>;
  list(options: GroupBuyListOptions): Promise<{ items: GroupBuyListItem[]; total: number }>;
  requestDelete(id: string, userId: string, reason: string): Promise<boolean>;
  // 회원 탈퇴 가드(#3) — 해당 창작자가 개설한 살아있는(deleted_at IS NULL) 펀드 수.
  countActiveByCreator(creatorId: string): Promise<number>;
  listDeleteRequests(): Promise<DeleteRequestItem[]>;
  cancelFund(id: string): Promise<void>;
  updateRewards(id: string, rewardTiers: import('../types/index.js').RewardTier[], finalPrice: number): Promise<void>;
  // 관리자 부분 수정(대리개설 편집 등) — 화이트리스트 필드만 동적 갱신. creator_id 등은 절대 미포함.
  updateFields(id: string, fields: GroupBuyUpdateFields): Promise<GroupBuy | null>;

  // ─── 공개 목록/상세 (006_social_features 계약) ───
  // viewerId 가 있으면 각 카드의 isLiked 를 한 번의 IN 조회로 채운다(목록 N+1 방지). likeCount 는 서브쿼리.
  findMany(options: GroupBuyFindManyOptions, viewerId?: string): Promise<{ total: number; rows: GroupBuyCardItem[] }>;
  // publicOnly=true(비소유자)면 비공개 상태(pending/pending_review/rejected) 제외. 소유자는 전체(rejected만 제외).
  findByCreator(creatorId: string, opts?: { publicOnly?: boolean }): Promise<GroupBuyCardItem[]>;
  // 여러 창작자의 공개(open) 펀드를 최신순으로 — 팔로잉 피드용. creatorIds 가 비면 빈 결과.
  findOpenByCreators(creatorIds: string[], limit?: number, offset?: number, viewerId?: string): Promise<{ total: number; rows: GroupBuyCardItem[] }>;
  // viewerIsAdmin/소유자가 아니면 비공개 상태(pending/pending_review/rejected) 상세는 null(→404)로 가린다.
  getDetail(id: string, viewerId?: string, viewerIsAdmin?: boolean): Promise<GroupBuyDetail | null>;

  // ─── 찜(좋아요) — 026_project_likes ───
  // 찜 추가(UPSERT, ON CONFLICT DO NOTHING) → 펀드 존재 시 좋아요 수, 없으면 null(404).
  like(userId: string, fundId: string): Promise<number | null>;
  // 찜 취소(DELETE) → 펀드 존재 시 좋아요 수, 없으면 null(404).
  unlike(userId: string, fundId: string): Promise<number | null>;
  // 펀드의 좋아요 수.
  countLikes(fundId: string): Promise<number>;
  // 사용자가 찜한 펀드 id 목록(최신 찜 순).
  likedIdsByUser(userId: string): Promise<string[]>;
  // 사용자가 특정 펀드를 찜했는지.
  isLiked(userId: string, fundId: string): Promise<boolean>;

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

// 본인 펀드 분석(GET /api/me/funds/:id/analytics) — 023_plan_features + 요금제 게이팅
// 요금제(plan)별로 채워지는 필드가 다르다. basic=요약+리워드분포만, plus=+추이/입금현황+서포터 일부,
// pro=전부. 잠긴 기능은 lockedFeatures 키 배열로 알려 프론트가 자물쇠 UI 를 표시한다.
export type AnalyticsTier = 'basic' | 'plus' | 'pro';

/** 잠금 기능 키 — 프론트 자물쇠 UI 매핑용. */
export type LockedFeature =
  | 'fundingTimeline'
  | 'likeTimeline'
  | 'depositStatus'
  | 'supporters'
  | 'supporters_full';

export interface RewardBreakdownItem { rewardLabel: string; count: number; amount: number }
export interface FundingTimelinePoint { date: string; backerCount: number; amount: number }
export interface LikeTimelinePoint { date: string; count: number }
export interface DepositStatusSummary {
  confirmedCount: number; pendingCount: number; confirmedAmount: number; pendingAmount: number;
}
export interface SupporterItem {
  nickname: string;          // 닉네임만(없으면 '익명 서포터') — 이메일/실명/전화 절대 미포함
  amount: number;
  rewardLabel: string;
  status: string;            // 'confirmed' | 'awaiting_deposit'
  backedAt: string;          // ISO
}

export interface AnalyticsSummary {
  backerCount: number;       // 유효 후원 건수(pledged/paid/payment_failed + 구 awaiting_deposit/confirmed)
  totalAmount: number;       // 확정(실결제/입금) 후원 금액 합
  targetAmount: number;      // 펀딩 목표 금액(원) — target_amount, 폴백 (target_quantity × final_price) — 031
  achievedAmount: number;    // 활성 후원 금액 합계(원) — groupbuys.current_amount 캐시 — 031
  achievementRate: number;   // 금액 기준 round(achievedAmount/targetAmount*100), 목표 0이면 수량 기준 폴백 — 031
  likeCount: number;         // 찜(좋아요) 수
  daysLeft: number | null;   // 마감까지 남은 일수(마감 지났으면 0, 산정 불가 시 null)
  status: string;            // 펀드 상태
  soldQuantity: number;      // 확정(입금완료) 수량 = current_quantity
  viewCount: number;         // 상세 조회수
  subscriberCount: number;   // 공개예정 알림 구독자 수
}

export interface GroupBuyAnalytics {
  plan: string;              // 'start' | 'run' | 'boost'
  planLabel: string;         // 'Basic' | 'Plus' | 'Professional'
  tier: AnalyticsTier;       // 'basic' | 'plus' | 'pro'
  summary: AnalyticsSummary;
  rewardBreakdown: RewardBreakdownItem[];
  fundingTimeline: FundingTimelinePoint[]; // plus/pro 만 채움(basic=[])
  likeTimeline: LikeTimelinePoint[];        // plus/pro 만 채움(basic=[])
  depositStatus: DepositStatusSummary | null; // plus/pro 만 채움(basic=null)
  supporters: SupporterItem[];              // pro=전체, plus=최근 일부, basic=[]
  lockedFeatures: LockedFeature[];          // 이 티어에서 잠긴 기능 키
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

