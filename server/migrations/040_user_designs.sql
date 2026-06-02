-- 040: 사용자 디자인 저장소 — 디자인하기 에디터 결과를 개인 프로필에 저장(이어서/불러오기/다운로드).
-- design(JSONB): { product, layers:[{type:'image'|'text', ...위치/크기/내용}], canvas:{w,h} }.
-- preview(TEXT): 합성 미리보기 data URL(목록 썸네일). aiImage(TEXT): 완성 시 AI 생성 결과(선택).
CREATE TABLE IF NOT EXISTS user_designs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category    VARCHAR(40),
  product     VARCHAR(80),
  title       VARCHAR(120),
  design      JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview     TEXT,
  ai_image    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_designs_user ON user_designs(user_id, updated_at DESC);
