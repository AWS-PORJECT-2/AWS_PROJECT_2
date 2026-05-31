-- 030: 결제 모델 전환 — 무통장입금 → 텀블벅식(예약 후 마감 성공 시 자동결제).
--   실제 청구는 추후 PG 연동(모의결제). 실패/재시도/3진아웃 상태·컬럼을 미리 마련.
--
-- 새 status:
--   pledged        — 예약(캠페인 중, 청구 안 함). createBackingHandler 가 생성.
--   paid           — 모의결제 성공(마감 성공 후 순차 결제).
--   payment_failed — 결제 시도 실패(다음날 재시도 예약).
-- 기존 awaiting_deposit/confirmed/cancel_requested/refunded/cancelled 는 구주문 호환 위해 유지.
--
-- 상태 전이(신규):
--   pledged → (마감 성공) next_charge_at 설정 → (모의결제 성공) paid
--                                            └ (실패) payment_failed → (재시도)... → 3회 실패 시 cancelled
--   pledged → (사용자 취소/마감 실패) cancelled
--   paid    → (사용자 취소신청) cancel_requested → (관리자 환불표시) → (관리자 취소) refunded

-- 1) status CHECK 제약 교체 — 029 의 제약을 드롭하고 신규 값 포함해 재생성.
ALTER TABLE reward_orders DROP CONSTRAINT IF EXISTS reward_orders_status_check;
ALTER TABLE reward_orders ADD CONSTRAINT reward_orders_status_check
  CHECK (status IN (
    'awaiting_deposit', 'confirmed', 'cancel_requested', 'refunded', 'cancelled',
    'pledged', 'paid', 'payment_failed'
  ));

-- 2) 모의결제/재시도 메타 컬럼.
ALTER TABLE reward_orders ADD COLUMN IF NOT EXISTS charge_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE reward_orders ADD COLUMN IF NOT EXISTS next_charge_at TIMESTAMPTZ;
ALTER TABLE reward_orders ADD COLUMN IF NOT EXISTS fail_reason TEXT;
ALTER TABLE reward_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 3) 모의결제 잡 조회용 인덱스 — status='pledged' AND next_charge_at <= now 스캔.
CREATE INDEX IF NOT EXISTS idx_reward_orders_charge_due
  ON reward_orders (status, next_charge_at)
  WHERE status IN ('pledged', 'payment_failed') AND next_charge_at IS NOT NULL;
