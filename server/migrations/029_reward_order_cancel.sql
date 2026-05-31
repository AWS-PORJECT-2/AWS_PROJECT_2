-- 029: 펀딩(주문) 취소 신청 + 관리자 환불·취소 (#4).
-- reward_orders.status 값 확장(cancel_requested / refunded) + 취소사유/취소요청·환불 시각 컬럼 추가.
--
-- 상태 전이:
--   awaiting_deposit → (사용자 취소신청) → cancel_requested → (관리자 취소) → cancelled
--   confirmed        → (사용자 취소신청) → cancel_requested → (관리자 환불표시 refunded_at) → (관리자 취소) → refunded
--   (관리자 펀드삭제/일괄취소는 기존 cancelled 유지)

-- 1) status CHECK 제약 교체 — 015 에서 만든 제약명(reward_orders_status_check)을 드롭하고 값 확장.
--    제약명이 다를 수 있으니 IF EXISTS 로 안전 처리.
ALTER TABLE reward_orders DROP CONSTRAINT IF EXISTS reward_orders_status_check;
ALTER TABLE reward_orders ADD CONSTRAINT reward_orders_status_check
  CHECK (status IN ('awaiting_deposit', 'confirmed', 'cancel_requested', 'refunded', 'cancelled'));

-- 2) 취소/환불 메타 컬럼.
ALTER TABLE reward_orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE reward_orders ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;
ALTER TABLE reward_orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
