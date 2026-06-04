-- 044_groupbuy_hidden.sql
-- 관리자 "게시글 숨기기" — 펀드(groupbuy)를 삭제하지 않고 공개에서만 가린다.
-- 상태(status)와 독립된 boolean. 기본 FALSE(노출). 숨기면 공개 목록/검색/공개예정/배너/공개상세에서 제외,
-- 소유자·관리자만 상세 열람 가능. 관리자가 언제든 다시 보이게(unhide) 전환 가능.
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- 공개 목록 쿼리(g.hidden = FALSE) 가속 — 부분 인덱스(숨긴 건 소수).
CREATE INDEX IF NOT EXISTS idx_groupbuys_hidden ON groupbuys (hidden) WHERE hidden = TRUE;
