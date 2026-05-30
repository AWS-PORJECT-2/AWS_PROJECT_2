-- 022: 추가 컬럼/테이블 (방어적 IF NOT EXISTS).
--   1) groupbuys.plan        — 직접개설 요금제 (start|run|boost → 플랫폼 수수료율 5/9/15%)
--   2) groupbuys.video_url   — 대표 영상(데이터 URL 또는 http(s), 선택)
--   3) groupbuys.creator_info— 창작자 정보 JSONB {name,image,intro,sido,sigungu}
--   4) project_drafts        — 만들기 폼 임시저장(본인 것만 조회/수정)

ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS plan VARCHAR(10) NOT NULL DEFAULT 'start';  -- start|run|boost
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS video_url TEXT;        -- 대표 영상(데이터 URL 또는 http, 선택)
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS creator_info JSONB;     -- {name,image,intro,sido,sigungu}

CREATE TABLE IF NOT EXISTS project_drafts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  title      TEXT,
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_drafts_user ON project_drafts(user_id, updated_at DESC);
