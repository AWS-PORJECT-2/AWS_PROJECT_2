-- 008: user 테이블에 role 컬럼 추가
-- 공지사항/관리자 채팅 등 권한 분기를 위해 필요.
-- 기본값 USER, 환경변수 ADMIN_EMAILS (콤마 구분) 에 포함된 이메일은 별도 스크립트로 ADMIN 승격.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role VARCHAR(8) NOT NULL DEFAULT 'USER';
ALTER TABLE "user" ADD CONSTRAINT user_role_chk CHECK (role IN ('USER', 'ADMIN'));
CREATE INDEX IF NOT EXISTS idx_user_role ON "user"(role);
