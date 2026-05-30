-- 023: 요금제 기능 3종 + 정책 분리 컬럼.
--   1) groupbuys.open_at        — 공개예정(scheduled) 오픈 예정시각 (Run/Boost 요금제)
--   2) groupbuys.refund_policy  — 교환·반품 정책(스토리 contentBlocks 와 분리 저장)
--   3) groupbuys.legal_notice   — 정보고시/법적 고지(스토리와 분리 저장)
--   4) groupbuys.view_count     — 상세 조회수(분석)
--   5) status CHECK 에 'scheduled'(공개예정) 추가 — 동적 DROP 후 재생성(방어적, 021 패턴)
--   6) project_subscriptions    — 공개예정 프로젝트 알림 구독(user_id, groupbuy_id)
-- 모두 IF NOT EXISTS / 동적 DROP 으로 중복·단독 적용 모두 안전.

ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS open_at TIMESTAMPTZ;            -- 공개예정 오픈 예정시각
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS refund_policy TEXT;            -- 교환·반품 정책(스토리와 분리)
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS legal_notice TEXT;            -- 정보고시/법적 고지(스토리와 분리)
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;  -- 상세 조회수(분석)

-- status CHECK 재생성: 기존 status 관련 CHECK 를 모두 제거 후 'scheduled' 포함해 재생성.
-- (021 과 동일한 방어적 동적 DROP 패턴 — 마이그레이션 정렬 순서/중복 적용에 안전.)
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
  CHECK (status IN ('pending', 'pending_review', 'rejected', 'open', 'scheduled', 'achieved', 'failed', 'executing', 'completed', 'cancelled'));

-- 공개예정 프로젝트 알림 구독 — 후원자(user_id)가 오픈 알림을 신청한 프로젝트(groupbuy_id).
CREATE TABLE IF NOT EXISTS project_subscriptions (
  user_id     UUID NOT NULL,
  groupbuy_id UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, groupbuy_id)
);

CREATE INDEX IF NOT EXISTS idx_project_subscriptions_groupbuy ON project_subscriptions(groupbuy_id);
