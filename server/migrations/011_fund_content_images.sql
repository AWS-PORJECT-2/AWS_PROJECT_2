-- 게시글 본문: 사용자가 직접 작성한 텍스트/이미지 블록들 (JSON 배열).
-- 예: [{"type":"text","value":"..."},{"type":"image","value":"data:image/..."}]
-- 목록(GET /api/groupbuys)에서는 조회하지 않고 상세(GET /api/groupbuys/:id)에서만 사용.
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS content_blocks TEXT;
