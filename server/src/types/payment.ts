export type GroupBuyStatus = 'open' | 'achieved' | 'failed' | 'executing' | 'completed' | 'cancelled';
export type ParticipationStatus = 'pending' | 'confirmed' | 'cancelled';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
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
  basePrice: number;
  designFee: number;
  platformFee: number;
  finalPrice: number;
  targetQuantity: number;
  currentQuantity: number;
  deadline: Date;
  status: GroupBuyStatus;
  createdAt: Date;
  updatedAt: Date;
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

export interface Order {
  id: string;
  participationId: string;
  userId: string;
  groupbuyId: string;
  amount: number;
  status: OrderStatus;
  pgPaymentId: string | null;
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
