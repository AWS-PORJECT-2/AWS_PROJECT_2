export type GroupBuyStatus = 'pending' | 'pending_review' | 'rejected' | 'open' | 'achieved' | 'failed' | 'executing' | 'completed' | 'cancelled';
export type ParticipationStatus = 'pending' | 'confirmed' | 'cancelled';
export type OrderStatus = 'pending' | 'paid' | 'shipping_ready' | 'shipping' | 'delivered' | 'failed' | 'refunded' | 'cancelled';
export type PaymentStatus = 'requested' | 'paid' | 'failed' | 'cancelled';
export type RefundStatus = 'requested' | 'completed' | 'failed';

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
  targetQuantity: number;
  currentQuantity: number;
  deadline: Date;
  status: GroupBuyStatus;
  designImageUrl?: string | null; // 업로드한 옷 디자인 사진 (base64 data URL)
  tryonImageUrl?: string | null;  // AI 모델 피팅 결과 사진 (base64 data URL)
  contentBlocks?: ContentBlock[] | null; // 게시글 본문 (사용자 작성 텍스트/이미지 블록)
  coverImageUrl?: string | null;  // 대표 이미지(목록 썸네일) — 006_social_features
  mode?: string;                  // 'normal' | 'proxy' (대리 펀딩) — 006_social_features
  createdAt: Date;
  updatedAt: Date;
}

// 게시글 본문 블록 — 텍스트와 이미지를 사용자가 원하는 순서로 섞음
export interface ContentBlock {
  type: 'text' | 'image';
  value: string; // text: 본문 문자열 / image: data URL 또는 http URL
}

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

export interface Refund {
  id: string;
  paymentId: string;
  orderId: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  pgRefundId: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

// Request/Response types
export interface ParticipateRequest {
  cardInfo: import('../interfaces/pg-client.js').CardAuthInfo;
  selectedOptions: Record<string, string>;
  quantity: number;
}

export interface ParticipateResult {
  participationId: string;
  billingKeyInfo: { cardName: string; cardNumber: string; cardType: string };
  status: 'confirmed';
}

export interface RefundRequest {
  reason: string;
  amount?: number;
}

export interface RefundResult {
  refundId: string;
  status: RefundStatus;
  amount: number;
}
