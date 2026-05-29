-- 009: 무통장입금(가상계좌) 결제 확장
-- 기존 003_create_business_tables.sql 의 orders 테이블을 ALTER 로 확장.
-- 003 의 kind CHECK ('groupbuy', 'one_off') 를 'deposit' 도 허용하도록 변경.

-- Step 1: 기존 kind CHECK 제약 제거 후 확장된 제약 재생성
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_kind_check;
ALTER TABLE orders ADD CONSTRAINT orders_kind_check
  CHECK (kind IN ('groupbuy', 'one_off', 'deposit'));

-- Step 2: 기존 status CHECK 에 'awaiting_deposit' 추가
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled', 'awaiting_deposit'));

-- Step 3: 무통장입금 전용 컬럼 추가
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_bank VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_account VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_holder VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_due_date TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS depositor_name VARCHAR(50);

-- Step 4: 기존 경로별 필드 일관성 CHECK 를 확장
-- 기존 CHECK 제거 후 deposit 경로 포함하여 재생성
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_check;
ALTER TABLE orders ADD CONSTRAINT orders_route_check CHECK (
  (kind = 'groupbuy' AND participation_id IS NOT NULL AND groupbuy_id IS NOT NULL AND product_ref IS NULL)
  OR
  (kind = 'one_off' AND product_ref IS NOT NULL AND participation_id IS NULL AND groupbuy_id IS NULL)
  OR
  (kind = 'deposit' AND participation_id IS NULL)
);

-- Step 5: 무통장입금 대기 주문 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_orders_deposit_due
  ON orders(deposit_due_date)
  WHERE kind = 'deposit' AND status = 'awaiting_deposit';
