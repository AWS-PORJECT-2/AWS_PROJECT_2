-- 035: 게시판 본문을 리치 HTML 콘텐츠블록으로 전환(평문 textarea → WYSIWYG, funds 스토리와 동일 모델).
--      body(평문)는 목록 스니펫/검색/하위호환용으로 유지. content_blocks 가 비면 body 로 폴백 렌더.
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS content_blocks JSONB NOT NULL DEFAULT '[]';
