-- 033: audit_logs 확인(acknowledge) — 관리자가 오류 로그를 직접 확인하면
--      "로그·오류" 탭 배지(logsNew)에서 제외하고, 목록에서 확인됨 표시(다른 색)로 보여준다.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS acknowledged_by UUID;
-- 미확인 에러 카운트(level=error AND acknowledged_at IS NULL)를 빠르게 집계.
CREATE INDEX IF NOT EXISTS idx_audit_logs_ack ON audit_logs(level, acknowledged_at, created_at DESC);
