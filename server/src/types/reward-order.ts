export type RewardOrderStatus = 'awaiting_deposit' | 'confirmed' | 'cancelled';

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
}
