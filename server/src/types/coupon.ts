// 수수료 할인 쿠폰 (045_coupons). 관리자가 사용자에게 발급, 사용자는 프로젝트 개설 시 사용.
export type CouponDiscountType = 'rate_off' | 'waive';
export type CouponStatus = 'unused' | 'used';

export interface Coupon {
  id: string;
  code?: string | null;             // 공유 코드(코드 등록분) 또는 null(관리자 직접 발급)
  ownerUserId: string;
  discountType: CouponDiscountType; // 'rate_off' = %p 차감 / 'waive' = 전액 면제
  discountValue: number;            // rate_off 일 때 차감 %p (0~100). waive 면 무시.
  label: string;                    // 표시용 "수수료 5%p 할인" 등
  status: CouponStatus;
  usedGroupbuyId?: string | null;
  sourceCodeId?: string | null;     // 코드 등록분이면 coupon_codes.id
  issuedBy?: string | null;
  note?: string | null;
  expiresAt?: Date | null;
  createdAt: Date;
  usedAt?: Date | null;
}

// (B) 관리자가 만든 공유 쿠폰 코드 — 사용자가 코드 입력으로 등록.
export interface CouponCode {
  id: string;
  code: string;
  label: string;
  discountType: CouponDiscountType;
  discountValue: number;
  maxRegistrations?: number | null; // null = 무제한
  registeredCount: number;
  codeExpiresAt?: Date | null;      // 등록 마감
  couponValidDays?: number | null;  // 등록된 쿠폰 유효기간(일)
  active: boolean;
  createdBy?: string | null;
  createdAt: Date;
}
