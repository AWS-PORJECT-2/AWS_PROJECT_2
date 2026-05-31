export type RewardOrderStatus =
  // ── 텀블벅식 예약/모의결제 흐름(030) ──
  | 'pledged'           // 예약(캠페인 중) — 청구하지 않음. 수량에는 즉시 반영.
  | 'paid'              // 모의결제 성공(마감 성공 후 순차 결제 완료)
  | 'payment_failed'    // 결제 시도 실패(다음날 재시도 예약)
  // ── 구 무통장입금 흐름(015/029, 구주문 호환) ──
  | 'awaiting_deposit'  // 입금 대기(후원 신청 직후)
  | 'confirmed'         // 관리자 입금확인 → 참여 확정
  | 'cancel_requested'  // 사용자가 취소 신청(관리자 처리 대기)
  | 'refunded'          // 관리자 환불 후 최종 취소(confirmed/paid 였던 건)
  | 'cancelled';        // 최종 취소(미입금/예약 해제/펀드삭제 일괄취소)

// 리워드 후원 주문. 텀블벅식: 후원 신청 = 예약(pledged) → 마감 성공 시 자동(모의)결제(paid).
export interface RewardOrder {
  id: string;
  fundId: string;
  rewardTierId: string;
  rewardTitle: string;
  userId: string;
  addressId: string | null;
  depositorName: string | null;
  amount: number;
  status: RewardOrderStatus;
  createdAt: Date;
  confirmedAt: Date | null;
  // 취소/환불(029)
  cancelReason?: string | null;
  cancelRequestedAt?: Date | null;
  refundedAt?: Date | null;
  // 모의결제/재시도(030)
  chargeAttempts?: number;       // 결제 시도 횟수(3회 실패 시 자동취소)
  nextChargeAt?: Date | null;    // 다음 결제 시도 예정 시각(마감+1일, 실패 시 +1일)
  failReason?: string | null;    // 마지막 결제 실패 사유
  paidAt?: Date | null;          // 모의결제 성공 시각
}
