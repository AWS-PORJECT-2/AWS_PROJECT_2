-- 025: groupbuys.content_blocks / reward_tiers 의 NOT NULL 제약 해제.
-- 배경: 006_social_features.sql 은 두 컬럼을 'JSONB NOT NULL DEFAULT ''[]''' 로,
--   011/014 는 같은 컬럼을 'TEXT'(nullable)로 IF NOT EXISTS 정의한다. 파일명 정렬상 006 이 먼저 적용되는
--   "처음부터 새로 마이그레이션하는 환경"에서는 JSONB NOT NULL 로 생기고, 코드(pg-groupbuy-repository.create)는
--   스토리 블록이 없으면 content_blocks 에 NULL 을 INSERT 하므로 not-null 위반으로 펀드 개설이 실패한다.
-- 조치: 두 컬럼의 NOT NULL 을 제거해 운영(TEXT nullable)·신규(JSONB) 환경 동작을 일치시킨다.
--   (라이브 DB 는 컬럼이 TEXT nullable 이라 DROP NOT NULL 이 무해한 no-op. 코드는 string/JSON 양쪽을 모두 처리.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'groupbuys' AND column_name = 'content_blocks') THEN
    ALTER TABLE groupbuys ALTER COLUMN content_blocks DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'groupbuys' AND column_name = 'reward_tiers') THEN
    ALTER TABLE groupbuys ALTER COLUMN reward_tiers DROP NOT NULL;
  END IF;
END $$;
