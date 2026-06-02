-- 034: 커뮤니티 게시판 — 누구나(로그인) 글 작성, 본인/관리자 삭제. 카테고리(일반·홍보 등),
--      본문은 평문(렌더 시 escape+자동링크), 미디어는 구조화 JSON(image/video/youtube/link)으로 XSS 면적 최소화.
CREATE TABLE IF NOT EXISTS board_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     UUID NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  category      VARCHAR(20) NOT NULL DEFAULT 'general',
  title         VARCHAR(120) NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  media         JSONB NOT NULL DEFAULT '[]',
  comment_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_posts_created     ON board_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_posts_cat_created ON board_posts (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_posts_author      ON board_posts (author_id);

CREATE TABLE IF NOT EXISTS board_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES board_posts (id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_comments_post ON board_comments (post_id, created_at);
