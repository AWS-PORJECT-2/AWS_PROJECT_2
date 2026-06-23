import type { EarnReason, PointTransaction, SpendReason } from '../types/index.js';

/** 1회성 적립 결과. created=false 면 이미 적립된 상태(멱등). */
export interface EarnResult {
  balanceAfter: number;
  created: boolean;
  transaction?: PointTransaction;
}

/** 포인트 사용 결과. ok=false 면 잔액 부족으로 변동 없음. */
export interface SpendResult {
  ok: boolean;
  balanceAfter: number;
  transaction?: PointTransaction;
  // 이번 호출에서 실제 차감이 일어났는지. requestId 멱등 재요청이면 false(기존 거래 반환).
  //  서비스가 새 차감일 때만 알림을 보내도록 구분하는 데 사용(earnOnce 의 created 와 동일한 역할).
  created?: boolean;
}

/** 환불 결과 — 항상 적립이 일어나므로 transaction 은 필수. */
export interface RefundResult {
  balanceAfter: number;
  transaction: PointTransaction;
}

/** 관리자 조정 결과. ok=false 면 음수 잔액이 되어 거부됨(변동 없음). */
export interface AdminAdjustResult {
  ok: boolean;
  balanceAfter: number;
  transaction?: PointTransaction;
}

/**
 * 포인트 저장소. (045_point_system)
 * 잔액의 진실 공급원은 point_transaction 원장이며, "user".points 는 같은 트랜잭션에서 갱신되는 캐시다.
 * 모든 잔액 변동은 단일 트랜잭션에서 사용자 행을 `SELECT points ... FOR UPDATE` 로 잠근 뒤
 *   원장 INSERT + "user".points UPDATE 를 함께 수행해 동시성 경합을 제거한다.
 */
export interface PointRepository {
  /**
   * 1회성 적립(가입/첫 게시글/첫 댓글). 멱등 — 이미 적립됐으면 created=false 로 현재 잔액만 반환.
   * 부분 유니크 인덱스(uq_point_tx_one_time_earn) 충돌(23505)도 이미 적립된 것으로 처리.
   */
  earnOnce(userId: string, reason: EarnReason): Promise<EarnResult>;

  /**
   * 포인트 사용(AI 기능 차감). requestId 가 있으면 멱등(동일 요청 중복 차감 방지).
   * 잔액이 cost 미만이면 ok=false 로 변동 없이 반환.
   */
  spend(userId: string, reason: SpendReason, cost: number, requestId?: string): Promise<SpendResult>;

  /** 환불 — 사용 사유에 대응하는 refund_* 사유로 적립한다. */
  refund(userId: string, reason: SpendReason, amount: number): Promise<RefundResult>;

  /** 관리자 가감(delta 만큼 증감). 결과 잔액이 음수면 ok=false. delta=0 은 no-op. */
  adminAdjust(userId: string, delta: number): Promise<AdminAdjustResult>;

  /** 관리자 잔액 지정(target 으로 설정). target>=0 보장. 변동 없으면 no-op. */
  adminSetBalance(userId: string, target: number): Promise<AdminAdjustResult>;

  /** 현재 잔액(캐시 컬럼). 사용자가 없으면 0. */
  getBalance(userId: string): Promise<number>;

  /** 사용자별 거래 내역(최신순). */
  getTransactions(userId: string, limit: number, offset: number): Promise<PointTransaction[]>;
}
