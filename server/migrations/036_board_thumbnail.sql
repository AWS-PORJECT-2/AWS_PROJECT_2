-- 036: 게시판 글 목록 카드용 경량 썸네일.
-- 목록(GET /api/board/posts)은 content_blocks/media(수 MB)를 싣지 않으므로(035 의도) 카드에 쓸
-- 작은 썸네일을 별도 컬럼에 둔다. 클라가 첫 이미지(또는 유튜브 썸네일)를 320px JPEG 로 줄여 보냄.
-- (data:image 작은 URL 또는 https URL. 서버 sanitizeThumbnail 로 형식·크기 재검증.)
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS thumbnail TEXT;
