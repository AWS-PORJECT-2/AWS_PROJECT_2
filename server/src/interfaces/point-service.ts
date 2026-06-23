import type { PointTransaction, EarnReason, SpendReason } from '../types/index.js';

export interface PointBalance {
  userId: string;
  points: number; // 0 이상의 정수
}

export interface SpendResult {
  ok: boolean; // true=차감 성공, false=잔액 부족으로 차단
  balanceAfter: number; // 차감 후(또는 미변동) 잔액
  transaction?: PointTransaction;
}

export interface PointService {
  /**
   * 일회성 적립. 동일 (userId, reason) 이 이미 지급됐다면 아무 일도 하지 않고 기존 잔액 유지(멱등).
   * 요구사항 1, 2, 3.
   */
  earnOnce(userId: string, reason: EarnReason): Promise<PointBalance>;

  /**
   * 원자적 차감. 잔액 >= cost 이면 차감하고 거래·알림 기록, 아니면 변화 없이 ok=false.
   * requestId 가 주어지면 동일 requestId 의 중복 차감을 방지(멱등).
   * 요구사항 4, 5, 6.
   */
  spend(userId: string, reason: SpendReason, cost: number, requestId?: string): Promise<SpendResult>;

  /**
   * 보상(환불) 적립. spend 가 성공했으나 후속 AI 작업이 실패한 경우 차감분을 환원.
   * 요구사항 4.4 흐름의 보상 트랜잭션.
   */
  refund(userId: string, reason: SpendReason, amount: number, originalTransactionId: string): Promise<PointBalance>;

  /** 현재 잔액 조회. 요구사항 7.3. */
  getBalance(userId: string): Promise<PointBalance>;

  /** 거래 내역 최신순 조회. 요구사항 7.1, 7.2. */
  getTransactions(userId: string, limit?: number, offset?: number): Promise<PointTransaction[]>;
}
