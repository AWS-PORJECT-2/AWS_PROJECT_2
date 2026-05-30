-- 016: 펀드 삭제 요청 (항목 11) — 작성자가 삭제 요청 → 관리자가 삭제 + 후원자 환불.
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS delete_requested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS delete_reason TEXT;
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS delete_requested_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_groupbuys_delete_req ON groupbuys(delete_requested) WHERE delete_requested = TRUE;
