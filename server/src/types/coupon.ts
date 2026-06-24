// 수수료 할인 쿠폰 (045_coupons). 관리자가 사용자에게 발급, 사용자는 프로젝트 개설 시 사용.
export type CouponDiscountType = 'rate_off' | 'waive';
export type CouponStatus = 'unused' | 'used';

export interface Coupon {
  id: string;
  code: string;
  ownerUserId: string;
  discountType: CouponDiscountType; // 'rate_off' = %p 차감 / 'waive' = 전액 면제
  discountValue: number;            // rate_off 일 때 차감 %p (0~100). waive 면 무시.
  label: string;                    // 표시용 "수수료 5%p 할인" 등
  status: CouponStatus;
  usedGroupbuyId?: string | null;
  issuedBy?: string | null;
  note?: string | null;
  expiresAt?: Date | null;
  createdAt: Date;
  usedAt?: Date | null;
}
