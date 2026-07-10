-- 048: 스토리 & 투표 (24시간 휘발성) — 크루십(상호 수락) 유저끼리 공유.
--  created_at 기준 24시간 후 만료. TTL 은 조회 쿼리에서 expires_at 필터 + 스케줄러 정리.
CREATE TABLE IF NOT EXISTS stories (
  id          UUID PRIMARY KEY,
  author_id   UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  media_url   TEXT NOT NULL,               -- 이미지/영상 data URL 또는 http URL
  media_type  VARCHAR(10) NOT NULL DEFAULT 'image', -- image | video
  -- 투표 스티커(선택): { q, a, b, x, y } — 질문/옵션2개/스티커 위치(%)
  vote        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_stories_author ON stories(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);

-- 투표 기록 — 스토리별 1인 1표. option: 0(A) | 1(B).
CREATE TABLE IF NOT EXISTS story_votes (
  story_id  UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  voter_id  UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  option    SMALLINT NOT NULL CHECK (option IN (0, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, voter_id)
);
CREATE INDEX IF NOT EXISTS idx_story_votes_story ON story_votes(story_id);
