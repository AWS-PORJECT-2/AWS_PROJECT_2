import type { EarnReason, PointTransaction, SpendReason } from '../types/index.js';

/** 1회성 적립 결과(서비스). */
export interface PointEarnResult {
  balanceAfter: number;
}

/** 포인트 사용 결과(서비스). ok=false 면 잔액 부족. */
export interface PointSpendResult {
  ok: boolean;
  balanceAfter: number;
  transaction?: PointTransaction;
}

/** 환불 결과(서비스). */
export interface PointRefundResult {
  balanceAfter: number;
  transaction: PointTransaction;
}

/** 관리자 조정 결과(서비스). ok=false 면 음수 잔액이 되어 거부됨. */
export interface PointAdminResult {
  ok: boolean;
  balanceAfter: number;
  transaction?: PointTransaction;
}

/**
 * 포인트 서비스. (045_point_system)
 * 저장소 트랜잭션으로 잔액을 변동시킨 뒤, best-effort 로 알림을 발송한다(알림 실패는 흐름을 막지 않음).
 */
export interface PointService {
  /** 1회성 적립. 실제 적립이 일어난 경우에만 알림 발송. */
  earnOnce(userId: string, reason: EarnReason): Promise<PointEarnResult>;

  /** 포인트 사용. cost 는 SPEND_COSTS 와 일치해야 함(불일치 시 PRICE_MISMATCH). */
  spend(userId: string, reason: SpendReason, cost: number, requestId?: string): Promise<PointSpendResult>;

  /** 환불 — refund_* 사유로 적립하고 알림 발송. */
  refund(userId: string, reason: SpendReason, amount: number): Promise<PointRefundResult>;

  /** 관리자 가감(delta). 실제 변동 시 알림 발송. */
  adminAdjust(userId: string, delta: number, note: string): Promise<PointAdminResult>;

  /** 관리자 잔액 지정(target). 실제 변동 시 알림 발송. */
  adminSetBalance(userId: string, target: number, note: string): Promise<PointAdminResult>;

  /** 현재 잔액. */
  getBalance(userId: string): Promise<number>;

  /** 거래 내역(최신순). */
  getTransactions(userId: string, limit: number, offset: number): Promise<PointTransaction[]>;
}
