-- 018: 팔로우 (항목 6) — 후원자가 창작자(펀드 개설자)를 팔로우.
CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  creator_id  UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, creator_id),
  CHECK (follower_id <> creator_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_creator ON follows(creator_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
