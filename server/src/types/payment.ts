export type GroupBuyStatus = 'open' | 'achieved' | 'failed' | 'executing' | 'completed' | 'cancelled';
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
  createdAt: Date;
  updatedAt: Date;
}

// 게시글 본문 블록 — 텍스트와 이미지를 사용자가 원하는 순서로 섞음
export interface ContentBlock {
  type: 'text' | 'image';
  value: string; // text: 본문 문자열 / image: data URL 또는 http URL
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
