-- 013: 펀드(groupbuys) 관리자 승인 워크플로우용 상태 추가
-- 생성 시 'pending'(심사중) → 관리자 승인 시 'open'(공개) / 반려 시 'rejected'.
-- 기존 003 의 status CHECK 를 확장.

ALTER TABLE groupbuys DROP CONSTRAINT IF EXISTS groupbuys_status_check;
-- 003 에서는 인라인 CHECK(이름 자동부여)일 수 있어, 가능한 이름들 정리 후 신규 명명 제약 추가.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'groupbuys'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE groupbuys DROP CONSTRAINT ' || quote_ident(c.conname);
  END LOOP;
END $$;

ALTER TABLE groupbuys ADD CONSTRAINT groupbuys_status_check
  CHECK (status IN ('pending', 'rejected', 'open', 'achieved', 'failed', 'executing', 'completed', 'cancelled'));
