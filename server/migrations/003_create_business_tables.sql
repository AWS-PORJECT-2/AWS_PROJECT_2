-- 003: 공동구매·참여·주문·결제·환불 비즈니스 테이블
-- 005(payment_methods_addresses) 의 ALTER TABLE participations 가 동작하려면 이 마이그레이션이 먼저 실행되어야 한다.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 공동구매(펀드 구매 모집)
CREATE TABLE IF NOT EXISTS groupbuys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  fund_id UUID,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  product_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  base_price INTEGER NOT NULL,
  design_fee INTEGER NOT NULL DEFAULT 0,
  platform_fee INTEGER NOT NULL DEFAULT 0,
  final_price INTEGER NOT NULL,
  target_quantity INTEGER NOT NULL,
  current_quantity INTEGER NOT NULL DEFAULT 0,
  deadline TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('open', 'achieved', 'failed', 'executing', 'completed', 'cancelled')),
  CHECK (final_price >= 0),
  CHECK (target_quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_groupbuys_status_deadline ON groupbuys(status, deadline);
CREATE INDEX IF NOT EXISTS idx_groupbuys_creator ON groupbuys(creator_id);

-- 참여 (사용자가 공동구매에 빌링키와 함께 사전 등록)
CREATE TABLE IF NOT EXISTS participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  groupbuy_id UUID NOT NULL REFERENCES groupbuys(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  billing_key TEXT NOT NULL,
  selected_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  quantity INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'failed')),
  CHECK (quantity > 0),
  UNIQUE (user_id, groupbuy_id)
);
CREATE INDEX IF NOT EXISTS idx_participations_groupbuy_status ON participations(groupbuy_id, status);
CREATE INDEX IF NOT EXISTS idx_participations_user ON participations(user_id);

-- 주문
-- id 는 TEXT (UUID + 'DOOTHING_...' 접두 ID 모두 수용).
-- kind 로 결제 경로를 명시 분기. groupbuy 면 participation_id+groupbuy_id 가 채워지고,
-- one_off 면 product_ref(상품 식별자 문자열)만 채워진다. 두 경로가 동일 테이블을 공유하지만
-- CHECK 로 형식 위반을 차단해 silent insert 를 막는다.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  participation_id UUID REFERENCES participations(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  groupbuy_id UUID REFERENCES groupbuys(id) ON DELETE RESTRICT,
  product_ref TEXT,
  amount INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  pg_payment_id TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (kind IN ('groupbuy', 'one_off')),
  CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  CHECK (amount >= 0),
  CHECK (retry_count >= 0),
  -- 결제 경로별 필드 일관성 보장: groupbuy 는 participation_id+groupbuy_id 필수,
  -- one_off 는 product_ref 필수.
  CHECK (
    (kind = 'groupbuy' AND participation_id IS NOT NULL AND groupbuy_id IS NOT NULL AND product_ref IS NULL)
    OR
    (kind = 'one_off' AND product_ref IS NOT NULL AND participation_id IS NULL AND groupbuy_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_kind_status_retry ON orders(kind, status, next_retry_at) WHERE status = 'failed';
-- PG 결제 ID 가 중복으로 두 order 에 매핑되면 안 됨.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_pg_payment_uniq ON orders(pg_payment_id) WHERE pg_payment_id IS NOT NULL;

-- 결제 시도
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  billing_key TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'requested',
  pg_transaction_id TEXT,
  pg_response JSONB,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (status IN ('requested', 'paid', 'failed', 'cancelled')),
  CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id, attempted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_pg_txn ON payments(pg_transaction_id) WHERE pg_transaction_id IS NOT NULL;

-- 결제 이벤트 (감사로그)
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment ON payment_events(payment_id, created_at);

-- 환불
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'requested',
  pg_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (status IN ('requested', 'completed', 'failed')),
  CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);
