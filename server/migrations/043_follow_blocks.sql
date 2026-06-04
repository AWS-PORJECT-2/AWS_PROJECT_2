-- 043: 팔로우 차단 — blocker 가 blocked 를 차단하면 blocked 는 blocker 를 팔로우할 수 없다.
CREATE TABLE IF NOT EXISTS follow_blocks (
  blocker_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_follow_blocks_blocker ON follow_blocks(blocker_id);
