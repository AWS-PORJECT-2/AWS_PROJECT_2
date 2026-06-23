export type PointType = 'earn' | 'spend';

// 일회성 적립 사유 (요구사항 1, 2, 3)
export type EarnReason = 'signup' | 'first_post' | 'first_comment';

// 소모 사유 (요구사항 4, 5) — 기존 AI 라우트명과 정렬
export type SpendReason = 'ai_blueprint' | 'ai_tryon';

// 원장에 저장되는 reason 전체 (환불 사유 포함)
export type TransactionReason =
  | EarnReason
  | SpendReason
  | 'refund_ai_blueprint'
  | 'refund_ai_tryon';

export interface PointTransaction {
  id: string;
  userId: string;
  type: PointType;
  reason: TransactionReason;
  amount: number; // 양수 크기
  balanceAfter: number; // 거래 직후 잔액 (>= 0)
  requestId: string | null;
  createdAt: Date;
}

// 일회성 적립 금액 (서버 고정 상수, 클라이언트 값 미신뢰)
export const EARN_AMOUNTS: Record<EarnReason, number> = {
  signup: 100, // 요구사항 1.1
  first_post: 50, // 요구사항 2.1
  first_comment: 50, // 요구사항 3.1
};

// 소모 금액 (서버 고정 상수)
export const SPEND_COSTS: Record<SpendReason, number> = {
  ai_blueprint: 100, // 요구사항 4.1
  ai_tryon: 100, // 요구사항 5.1
};

// 사유별 한국어 표시 라벨 (알림/내역용)
export const REASON_LABEL: Record<TransactionReason, string> = {
  signup: '회원가입',
  first_post: '첫 게시글 작성',
  first_comment: '첫 댓글 작성',
  ai_blueprint: 'AI 도면 생성',
  ai_tryon: 'AI 가상피팅',
  refund_ai_blueprint: 'AI 도면 생성 환불',
  refund_ai_tryon: 'AI 가상피팅 환불',
};
