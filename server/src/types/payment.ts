export type GroupBuyStatus = 'pending' | 'pending_review' | 'rejected' | 'open' | 'scheduled' | 'achieved' | 'failed' | 'executing' | 'completed' | 'cancelled';
export type ParticipationStatus = 'pending' | 'confirmed' | 'cancelled';
export type OrderStatus = 'pending' | 'paid' | 'shipping_ready' | 'shipping' | 'delivered' | 'failed' | 'refunded' | 'cancelled';
export type PaymentStatus = 'requested' | 'paid' | 'failed' | 'cancelled';

export interface ProductOption {
  size: string;
  color: string;
  stock?: number;
}

export interface GroupBuy {
  id: string;
  creatorId: string;
  fundId: string | null;
  title: string;
  description: string;
  productOptions: ProductOption[];
  category?: string | null; // 카테고리 slug (jacket/ecobag/.../etc) — categories 단일소스 기준
  rewardTiers?: RewardTier[] | null; // 리워드(선물) 구성 — 창작자가 직접 정의
  delegated?: boolean;      // 대리 펀딩(플랫폼 위임) 여부 — 관리자가 리워드/가격 설정
  feeRate?: number;         // 플랫폼 수수료율(%) — 대리 20, 직접 5
  basePrice: number;
  designFee: number;
  platformFee: number;
  finalPrice: number;
  // 펀딩 목표 금액(원) — 와디즈/텀블벅식 금액 기준 목표. 신규 개설의 필수 입력 — 031_groupbuy_amount_funding.
  //   NULL/0 이면 표시 시 폴백으로 (targetQuantity × finalPrice) 사용(기존 펀드 호환).
  targetAmount?: number | null;
  // 활성 후원 금액 합계 캐시(원) — 후원/취소 시 amount 만큼 증감 — 031_groupbuy_amount_funding.
  currentAmount?: number;
  // 목표 수량 — 유지하되 선택/파생(개설폼에서 안 받으면 NULL). "N명 참여"의 분모는 아님.
  targetQuantity: number | null;
  currentQuantity: number;
  deadline: Date;
  status: GroupBuyStatus;
  designImageUrl?: string | null; // 업로드한 옷 디자인 사진 (base64 data URL)
  tryonImageUrl?: string | null;  // AI 모델 피팅 결과 사진 (base64 data URL)
  contentBlocks?: ContentBlock[] | null; // 게시글 본문 (사용자 작성 텍스트/이미지 블록)
  coverImageUrl?: string | null;  // 대표 이미지(목록 썸네일) — 006_social_features
  mode?: string;                  // 'normal' | 'proxy' (대리 펀딩) — 006_social_features
  plan?: string;                  // 직접개설 요금제 'start'|'run'|'boost' (수수료율 5/9/15%) — 022_create_extras
  videoUrl?: string | null;       // 대표 영상(데이터 URL 또는 http) — 022_create_extras
  creatorInfo?: CreatorInfo | null; // 창작자 정보 {name,image,intro,sido,sigungu} — 022_create_extras
  openAt?: Date | null;           // 공개예정(scheduled) 오픈 예정시각 — 023_plan_features
  refundPolicy?: string | null;   // 교환·반품 정책(스토리와 분리) — 023_plan_features
  legalNotice?: string | null;    // 정보고시/법적 고지(스토리와 분리) — 023_plan_features
  viewCount?: number;             // 상세 조회수(분석) — 023_plan_features
  createdAt: Date;
  updatedAt: Date;
}

// 창작자 정보(프로젝트 단위) — 022_create_extras. groupbuys.creator_info JSONB 에 저장.
export interface CreatorInfo {
  name?: string;        // 창작자/팀명 (<=20)
  image?: string | null; // 창작자 이미지 (data URL 또는 http)
  intro?: string;       // 소개 (<=300)
  sido?: string;        // 시/도
  sigungu?: string;     // 시/군/구
}

// 스토리 본문 블록 스타일 enum — 알 수 없는 값은 파서가 기본값으로 강등(아래 기본값 주석 참고).
export type ContentTextVariant = 'heading' | 'subheading' | 'body' | 'quote'; // 기본 'body'
export type ContentAlign = 'left' | 'center' | 'right';                       // 텍스트 기본 'left', 이미지 기본 'center'
export type ContentImageWidth = 'sm' | 'md' | 'lg' | 'full';                  // sm≈40 / md≈60 / lg≈80 / full=100%. 기본 'full'
export type ContentImageSide = 'left' | 'right';                              // 분할 블록 이미지 위치. 기본 'right'

// 게시글 본문 블록 — 텍스트/이미지/분할(글+이미지 2열)을 사용자가 원하는 순서로 섞음.
// 리치 스키마(스타일/정렬/크기/좌우배치)를 보존. 하위호환: 기존 {type:'text'|'image', value} 도 유효(스타일 미지정 → 기본값).
// html 블록은 WYSIWYG(임의 HTML)용. 신규 펀드는 보통 html 블록 1개로 스토리를 표현. text/image/split 은 구버전 펀드 하위호환용으로 유지.
export type ContentBlock = ContentTextBlock | ContentImageBlock | ContentSplitBlock | ContentHtmlBlock;

// 텍스트 블록 — value: 본문 문자열(≤5000). variant: 글자 스타일(기본 body). align: 정렬(기본 left).
export interface ContentTextBlock {
  type: 'text';
  value: string;
  variant?: ContentTextVariant;
  align?: ContentAlign;
}

// 이미지 블록 — value: data URL 또는 http(s) URL. width: 표시 너비(기본 full). align: 블록 내 가로 정렬(기본 center).
export interface ContentImageBlock {
  type: 'image';
  value: string;
  width?: ContentImageWidth;
  align?: ContentAlign;
}

// 분할 블록 — 글(text, ≤5000) + 이미지(image URL) 좌우 2열. imageSide=right → 글 왼쪽/사진 오른쪽(기본).
// align: 텍스트 정렬(기본 left). 모바일에선 1열 스택(이미지가 위).
export interface ContentSplitBlock {
  type: 'split';
  text: string;
  image: string;
  imageSide?: ContentImageSide;
  align?: ContentAlign;
}

// html 블록 — WYSIWYG가 생성한 새니타이즈된 HTML 한 덩어리. 새 펀드는 보통 이 블록 1개로 스토리를 표현.
export interface ContentHtmlBlock { type: 'html'; html: string; }

// 리워드(선물) 티어 — 후원 옵션. 가격은 창작자 설정, 재고(stockLimit) 선택.
export interface RewardTier {
  id: string;
  title: string;            // 선물명 (예: "[얼리버드] 네이비 과잠")
  price: number;            // 후원 금액(원)
  description?: string;     // 제공 내용 설명
  stockLimit?: number | null; // 한정 수량(null = 무제한)
  soldCount?: number;       // 판매(확정)된 수 — Phase 4 결제확정에서 증가
}

export interface Participation {
  id: string;
  groupbuyId: string;
  userId: string;
  billingKey: string;
  selectedOptions: Record<string, string>;
  quantity: number;
  status: ParticipationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type OrderKind = 'groupbuy' | 'one_off';

export interface Order {
  id: string;
  /** 결제 경로 구분. groupbuy=공동구매(participation 보유), one_off=단건결제(orders-prepare). */
  kind: OrderKind;
  /** groupbuy 일 때만 유효. one_off 면 null. */
  participationId: string | null;
  userId: string;
  /** groupbuy 일 때만 UUID. one_off 는 productId 문자열을 보관 (참조무결성 없음). */
  groupbuyId: string | null;
  /** one_off 일 때만 의미있음 (productId 문자열). groupbuy 는 null. */
  productRef: string | null;
  amount: number;
  status: OrderStatus;
  pgPaymentId: string | null;
  /** 택배사 코드 (예: 'kr.cjlogistics', 'kr.logen') */
  carrierId: string | null;
  /** 운송장 번호 */
  trackingNumber: string | null;
  retryCount: number;
  nextRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  orderId: string;
  billingKey: string;
  amount: number;
  status: PaymentStatus;
  pgTransactionId: string | null;
  pgResponse: Record<string, unknown> | null;
  attemptedAt: Date;
  completedAt: Date | null;
}

export interface PaymentEvent {
  id: string;
  paymentId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

