-- 012: groupbuys 에 카테고리 컬럼 추가
-- 대학교 굿즈 펀딩 카테고리(jacket/ecobag/keyring/... /etc). 생성 시 저장, 목록/필터에서 사용.
-- 기존엔 product_options->>'category' 로 읽었으나 생성 시 저장되지 않아(빈 배열) 항상 NULL 이었음 → 전용 컬럼으로 정리.

ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS category VARCHAR(32);
CREATE INDEX IF NOT EXISTS idx_groupbuys_category ON groupbuys(category);
