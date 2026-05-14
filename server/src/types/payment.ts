// 무통장 입금 결제 시스템 타입 정의

export type OrderStatus = 'PENDING' | 'WAITING_FOR_CONFIRM' | 'PAID' | 'CANCELLED' | 'REFUNDED';

export interface Order {
  id: number;
  orderNumber: string;
  userId: number;
  fundId: number | null;
  shippingAddressId: number | null;
  totalPrice: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productName: string;
  size: string | null;
  quantity: number;
  price: number;
  createdAt: Date;
}

export interface PaymentProof {
  id: number;
  orderId: number;
  depositorName: string;
  isConfirmed: boolean;
  uploadedAt: Date;
}

export interface PaymentConfirmation {
  id: number;
  orderId: number;
  confirmedBy: number;
  confirmedAt: Date;
  memo: string | null;
}

export interface ShippingAddress {
  id: number;
  userId: number;
  label: string;
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  roadAddress: string;
  jibunAddress: string | null;
  detailAddress: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Request/Response DTOs
export interface CreateOrderRequest {
  fundId: number;
  shippingAddressId: number;
  items: {
    productName: string;
    size?: string;
    quantity: number;
    /** ⚠️ 클라이언트가 보내도 서버에서 무시하고 funds.unit_price 를 사용한다.
     *  타입에서 제거하면 기존 프론트와 호환이 깨지므로 optional 로만 남기되,
     *  서버 로직은 절대 신뢰하지 않음. */
    price?: number;
  }[];
}

export interface CreateOrderResponse {
  orderId: number;
  orderNumber: string;
  totalPrice: number;
  bankInfo: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
  status: OrderStatus;
}

export interface UploadProofRequest {
  depositorName: string;
}

export interface UploadProofResponse {
  proofId: number;
  uploadedAt: Date;
}

export interface ConfirmPaymentRequest {
  memo?: string;
}

export interface ConfirmPaymentResponse {
  orderId: number;
  status: OrderStatus;
  confirmedBy: number;
  confirmedAt: Date;
}

export interface OrderDetailResponse extends Order {
  items: OrderItem[];
  proof: PaymentProof | null;
  confirmation: PaymentConfirmation | null;
  shippingAddress: ShippingAddress | null;
}
