-- 주문에 택배 추적 필드 추가
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_id VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100);

-- 프로필 사진(base64 data URL 또는 외부 URL) 저장 위해 picture 컬럼 확장
ALTER TABLE "user" ALTER COLUMN picture TYPE TEXT;
