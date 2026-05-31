-- 032: user.cover_url 를 VARCHAR(512) → TEXT 로 확장.
-- 커버 이미지를 data URL(base64, 최대 8MB)로 저장할 수 있어야 하는데 512자 제한이면 22001(value too long)로
-- 커버 업로드가 항상 500 으로 실패한다. user.picture(006_add_tracking_fields) · groupbuys 이미지 컬럼과 동일하게 TEXT 로 통일.
-- 무손실(기존 짧은 URL 값 보존), 신규/기존 DB 모두 안전.
ALTER TABLE "user" ALTER COLUMN cover_url TYPE TEXT;
