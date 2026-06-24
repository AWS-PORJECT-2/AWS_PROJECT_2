import type { Coupon, CouponDiscountType } from '../types/index.js';

export interface CouponCreate {
  code: string;
  ownerUserId: string;
  discountType: CouponDiscountType;
  discountValue: number;
  label: string;
  issuedBy?: string | null;
  note?: string | null;
  expiresAt?: Date | null;
}

export interface CouponRepository {
  create(input: CouponCreate): Promise<Coupon>;
  findByCode(code: string): Promise<Coupon | null>;
  /** 소유자별 쿠폰함 — 미사용 우선, 최신순. */
  listByOwner(ownerId: string): Promise<Coupon[]>;
  /** 관리자 발급 내역(최근). */
  listRecent(limit: number): Promise<Coupon[]>;
  /**
   * 원자적 사용 처리 — 소유자 본인 + 미사용 + (만료 없음 or 미만료)일 때만 used 로 전이.
   * 조건 불충족(이미 사용/만료/타인 소유/없음)이면 null. 이중 사용 방지의 핵심.
   */
  markUsed(code: string, ownerId: string, groupbuyId: string): Promise<Coupon | null>;
}
