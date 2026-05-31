export type RewardOrderStatus =
  | 'awaiting_deposit'  // 입금 대기(후원 신청 직후)
  | 'confirmed'         // 관리자 입금확인 → 참여 확정
  | 'cancel_requested'  // 사용자가 취소 신청(관리자 처리 대기)
  | 'refunded'          // 관리자 환불 후 최종 취소(confirmed 였던 건)
  | 'cancelled';        // 최종 취소(미입금이거나 펀드삭제 일괄취소)

// 리워드 후원(무통장입금) 주문. 입금 신청 → 관리자 확인 시 confirmed.
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
}
