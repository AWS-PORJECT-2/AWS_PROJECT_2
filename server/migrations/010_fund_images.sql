-- 펀드(공동구매) 개설 시 옷 디자인 사진 + AI 모델 피팅 사진 저장.
-- base64 data URL 이 들어오므로 TEXT (VARCHAR 길이 초과 방지 — user.picture 와 동일 이유).
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS design_image_url TEXT; -- 업로드한 옷 디자인 사진
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS tryon_image_url  TEXT; -- AI 모델 피팅 결과 사진
