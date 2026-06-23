-- 045: 포인트/리워드 시스템 — "user" 테이블에 포인트 잔액 컬럼을 더하고, 적립/사용 내역을
--   기록하는 원장(point_transaction) 테이블을 만든다.
--   방어적: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
--           및 제약조건 존재검사(DO 블록)로 중복·단독 적용 모두 안전.
--   point_transaction 은 append-only(추가 전용) 원장으로 잔액의 진실 공급원(source of truth)이며,
--   "user".points 는 빠른 조회를 위한 캐시 컬럼이다.

-- 사용자 포인트 잔액(캐시). 음수 불가.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;

-- points >= 0 제약을 멱등하게 추가(이미 있으면 건너뜀).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_points_nonneg') THEN ALTER TABLE "user" ADD CONSTRAINT user_points_nonneg CHECK (points >= 0); END IF; END $$;

-- 포인트 적립/사용 원장(추가 전용). 모든 잔액 변동의 근거가 되는 진실 공급원.
--   type        : 'earn'(적립) 또는 'spend'(사용)
--   reason       : 변동 사유(signup, first_post, ai_blueprint, refund_*, admin_adjust 등)
--   amount       : 변동 금액(항상 양수)
--   balance_after: 해당 변동 직후의 잔액(0 이상)
--   request_id   : 멱등 처리/환불 연결용 식별자(없을 수 있음)
CREATE TABLE IF NOT EXISTS point_transaction (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type          VARCHAR(10) NOT NULL CHECK (type IN ('earn','spend')),
  reason        VARCHAR(40) NOT NULL,
  amount        INTEGER NOT NULL CHECK (amount > 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  request_id    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 사용자별 내역 조회(최신순) 인덱스.
CREATE INDEX IF NOT EXISTS idx_point_tx_user_created ON point_transaction(user_id, created_at DESC);
-- 1회성 적립(가입/첫 게시글/첫 댓글)은 사용자당 한 번만 — 부분 유니크 인덱스로 중복 적립 방지.
CREATE UNIQUE INDEX IF NOT EXISTS uq_point_tx_one_time_earn ON point_transaction(user_id, reason) WHERE type='earn' AND reason IN ('signup','first_post','first_comment');
-- request_id 가 있는 거래는 멱등 보장(동일 요청 중복 적립/차감 방지).
CREATE UNIQUE INDEX IF NOT EXISTS uq_point_tx_request_id ON point_transaction(request_id) WHERE request_id IS NOT NULL;
