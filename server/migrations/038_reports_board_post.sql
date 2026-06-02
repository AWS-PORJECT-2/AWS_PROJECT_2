-- 038: 신고 대상에 커뮤니티 게시글(board_post) 추가.
-- 기존 CHECK(target_type IN ('maker','project'))를 교체해 게시판 글 신고를 허용한다.
-- 027 의 인라인 CHECK 는 자동명 reports_target_type_check 로 생성됨.
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'reports'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%target_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE reports DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IN ('maker', 'project', 'board_post'));
END $$;
