-- 021: groupbuys status CHECK 에 'pending_review' 재포함 보장(방어적).
--
-- 배경: 마이그레이션 러너는 파일명 정렬(.sort())로 적용한다. 그래서 적용 순서는
--   006_social_features.sql  (status CHECK 에 'pending_review' 포함)
--   → 013_groupbuy_review_status.sql (status CHECK 를 'pending_review' 없이 재생성)
-- 가 되어, 최종 제약에는 'pending_review' 가 빠진다.
-- 그런데 대리개설(proxy) 펀드 생성(routes/funds-create.ts buildProxy)은 status='pending_review'
-- 로 INSERT 하므로, 제약 위반으로 대리개설 자체가 실패한다.
--
-- 이 마이그레이션은 기존 status 관련 CHECK 를 모두 제거 후, 'pending_review' 를 포함해
-- 재생성한다. IF EXISTS / 동적 DROP 으로 중복·단독 적용 모두 안전(스키마 컬럼 추가 없음).

ALTER TABLE groupbuys DROP CONSTRAINT IF EXISTS groupbuys_status_check;

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
  CHECK (status IN ('pending', 'pending_review', 'rejected', 'open', 'achieved', 'failed', 'executing', 'completed', 'cancelled'));
