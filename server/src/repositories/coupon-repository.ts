import type { Coupon, CouponCode, CouponDiscountType } from '../types/index.js';

// (A) 관리자 직접 발급 — 코드 없음, 특정 사용자 소유로 바로 생성.
export interface CouponCreate {
  ownerUserId: string;
  discountType: CouponDiscountType;
  discountValue: number;
  label: string;
  issuedBy?: string | null;
  note?: string | null;
  expiresAt?: Date | null;
}

// (B) 관리자 쿠폰 코드 생성 — 공유 코드.
export interface CouponCodeCreate {
  code: string;
  label: string;
  discountType: CouponDiscountType;
  discountValue: number;
  maxRegistrations?: number | null;
  codeExpiresAt?: Date | null;
  couponValidDays?: number | null;
  createdBy?: string | null;
}

export type RegisterResult =
  | { ok: true; coupon: Coupon }
  | { ok: false; reason: 'NOT_FOUND' | 'INACTIVE' | 'EXPIRED' | 'FULL' | 'ALREADY' };

export interface CouponRepository {
  // 사용자 보유 쿠폰 인스턴스
  create(input: CouponCreate): Promise<Coupon>;          // 직접 발급
  findById(id: string): Promise<Coupon | null>;
  listByOwner(ownerId: string): Promise<Coupon[]>;
  /** 원자적 사용 처리 — 본인 + 미사용 + 미만료일 때만. */
  markUsedById(id: string, ownerId: string, groupbuyId: string): Promise<Coupon | null>;
  /** 심사 반려 등으로 펀드가 무효화될 때 그 펀드에 사용된 쿠폰을 미사용으로 되돌림. 되돌린 수 반환. */
  reactivateByGroupbuy(groupbuyId: string): Promise<number>;

  // 공유 쿠폰 코드 (Mode B)
  createCode(input: CouponCodeCreate): Promise<CouponCode>;
  findCodeByCode(code: string): Promise<CouponCode | null>;
  listCodes(limit: number): Promise<CouponCode[]>;
  /** 코드 등록(원자적) — 성공 시 새 보유 쿠폰, 실패 시 사유. */
  registerCode(code: string, ownerId: string): Promise<RegisterResult>;
}
