-- 주문에 택배 추적 필드 추가
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_id VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100);
