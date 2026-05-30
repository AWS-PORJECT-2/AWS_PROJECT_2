-- 019: 대리 펀딩 (항목 7·8) — 창작자가 비용·리워드 설정을 플랫폼에 위임.
-- delegated=TRUE 면 관리자가 리워드/가격을 설정 후 승인. 수수료율(fee_rate)은 대리 20%, 직접 5%.
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS delegated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS fee_rate INT NOT NULL DEFAULT 5;
