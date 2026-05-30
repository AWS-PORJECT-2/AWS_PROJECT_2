-- 020: 감사로그(audit_logs) — 관리자 콘솔의 "로그/오류" 탭에서 조회.
-- HTTP 5xx 오류, 펀드 승인/반려/삭제, 사용자 권한변경 등을 best-effort 로 기록.
-- 기록 실패가 본 요청을 막아선 안 되므로 헬퍼(services/audit-log.ts)에서 예외를 흡수한다.

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level VARCHAR(10) NOT NULL DEFAULT 'info',
  source VARCHAR(60),
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}',
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_level_created ON audit_logs(level, created_at DESC);

-- 관리자 시드 — 콘솔 접근을 위해 지정 계정을 ADMIN 으로 승격(role 표기는 008 의 'USER'/'ADMIN').
UPDATE "user" SET role = 'ADMIN' WHERE email = '22615jin@kookmin.ac.kr';
