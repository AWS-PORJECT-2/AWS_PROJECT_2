// 포인트 거래(point_transaction) 엔티티. (045_point_system)
// 적립/사용 내역을 기록하는 추가 전용(append-only) 원장이자 잔액의 진실 공급원.

/** 거래 유형. 'earn'=적립, 'spend'=사용. */
export type PointType = 'earn' | 'spend';

/** 적립 사유. 1회성 적립 이벤트. */
export type EarnReason = 'signup' | 'first_post' | 'first_comment';

/** 사용 사유. AI 기능 사용 시 차감. */
export type SpendReason = 'ai_blueprint' | 'ai_tryon';

/** 전체 거래 사유(적립·사용·환불·관리자 조정). */
export type TransactionReason =
  | EarnReason
  | SpendReason
  | 'refund_ai_blueprint'
  | 'refund_ai_tryon'
  | 'admin_adjust';

export interface PointTransaction {
  id: string;
  userId: string;
  type: PointType;
  reason: TransactionReason;
  amount: number;
  balanceAfter: number;
  requestId: string | null;
  createdAt: Date;
}

/** 적립 사유별 지급 포인트. */
export const EARN_AMOUNTS: Record<EarnReason, number> = {
  signup: 100,
  first_post: 50,
  first_comment: 50,
};

/** 사용 사유별 차감 포인트. */
export const SPEND_COSTS: Record<SpendReason, number> = {
  ai_blueprint: 100,
  ai_tryon: 100,
};

/** 거래 사유 한글 라벨(알림·내역 표시용). */
export const REASON_LABEL: Record<TransactionReason, string> = {
  signup: '회원가입',
  first_post: '첫 게시글 작성',
  first_comment: '첫 댓글 작성',
  ai_blueprint: 'AI 도면 생성',
  ai_tryon: 'AI 가상피팅',
  refund_ai_blueprint: 'AI 도면 생성 환불',
  refund_ai_tryon: 'AI 가상피팅 환불',
  admin_adjust: '관리자 조정',
};
