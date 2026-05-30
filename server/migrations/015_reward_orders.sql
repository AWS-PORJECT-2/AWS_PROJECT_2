-- 015: 리워드 후원(무통장입금) 주문. 항목 12 — 입금 신청 → 관리자 확인 → 참여 확정.
-- 기존 카드 기반 participations/orders 와 분리된 전용 테이블(충돌·복잡도 회피).

CREATE TABLE IF NOT EXISTS reward_orders (
  id UUID PRIMARY KEY,
  fund_id UUID NOT NULL REFERENCES groupbuys(id) ON DELETE CASCADE,
  reward_tier_id VARCHAR(64) NOT NULL,
  reward_title VARCHAR(80) NOT NULL,       -- 주문 시점 스냅샷
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  address_id UUID REFERENCES addresses(id),
  depositor_name VARCHAR(50),              -- 입금자명(보고 후 채워짐)
  amount BIGINT NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'awaiting_deposit'
    CHECK (status IN ('awaiting_deposit', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reward_orders_user ON reward_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_orders_fund ON reward_orders(fund_id);
CREATE INDEX IF NOT EXISTS idx_reward_orders_status ON reward_orders(status, created_at DESC);
