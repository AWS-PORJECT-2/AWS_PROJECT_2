-- 006: 소셜/프로필/댓글 확장 (메이커 공개 프로필, 댓글, 알림설정, 약관동의, 공구 본문)
--
-- 모두 방어적(IF NOT EXISTS / DROP-후-재생성)으로 작성 — 이미 일부 컬럼/테이블이
-- 후속 마이그레이션(010~019)에서 추가되었을 수 있으므로, 중복 적용해도 안전해야 한다.
-- 파일명 번호(006)는 신규 소셜 묶음의 논리적 그룹을 표시할 뿐, 실제 적용 순서는
-- 마이그레이션 러너가 파일명 정렬로 결정한다(이미 적용된 컬럼은 IF NOT EXISTS 로 무해).

-- pgcrypto: gen_random_uuid() 사용 보장 (003 에서 이미 생성되지만 단독 적용 대비)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── "user" 프로필/소셜 컬럼 ───
-- nickname/phone 은 017 에서 이미 추가됨 → IF NOT EXISTS 로 무해. 나머지는 신규.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS nickname VARCHAR(50);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS slug VARCHAR(50);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS intro TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS website VARCHAR(255);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS cover_url VARCHAR(512);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS theme_color VARCHAR(20);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMPTZ;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE;

-- slug 는 공개 프로필 URL 키 — UNIQUE 보장(부분 인덱스로 NULL 다중 허용).
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_slug ON "user"(slug) WHERE slug IS NOT NULL;

-- ─── groupbuys 본문/표시 컬럼 ───
-- category/content_blocks/reward_tiers 는 011~014 에서 이미 추가됨 → IF NOT EXISTS 로 무해.
-- cover_image_url, mode 는 이 묶음에서 신규.
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS category VARCHAR(40);
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS content_blocks JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS reward_tiers JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS mode VARCHAR(16) NOT NULL DEFAULT 'normal';

-- status CHECK 에 'pending_review' 포함 보장. 013 에서 이미 확장됐을 수 있으나,
-- 단독 적용 시에도 안전하도록 기존 status 관련 CHECK 를 모두 제거 후 재생성.
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

-- ─── follows ───
-- 018 에서 (follower_id, creator_id) 스키마로 이미 생성됨. 그 스키마를 정본으로 따른다.
-- (creator_id = 팔로우 당하는 대상 = following_id 와 동일 의미)
CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  creator_id  UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, creator_id),
  CHECK (follower_id <> creator_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_creator ON follows(creator_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);

-- ─── comments (펀딩/프로필 대상 댓글 + 대댓글) ───
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('fund', 'profile')),
  target_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at DESC);
