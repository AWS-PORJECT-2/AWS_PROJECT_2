-- 006: 공지사항 (관리자 게시판)
-- 일반 유저는 GET 만, 관리자(role='ADMIN') 만 POST/PUT/DELETE.
-- 작성자 탈퇴 시 author_id NULL 로 보존 (이력 유지).

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  author_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(title) > 0 AND length(title) <= 200),
  CHECK (length(content) <= 30000),
  CHECK (view_count >= 0)
);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_author ON announcements(author_id);
