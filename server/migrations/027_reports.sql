-- 027: 신고(reports) — 사용자가 메이커(maker) 또는 게시글(project=groupbuy)을 신고.
--   사유는 카테고리(reason_category) 선택. 'etc'(기타)면 detail 필수.
--   관리자가 처리(resolved/dismissed). 미처리(open) 건수는 admin pending-counts 배지로 노출.
-- 방어적: IF NOT EXISTS 로 중복·단독 적용 모두 안전.
--   reporter_id/target_id 는 다른 소셜 테이블(follows/project_likes)과 동일하게 UUID 로만 두고
--   외래키는 걸지 않는다(라이브 DB 의 user/groupbuys PK 타입 차이로 인한 적용 실패 방지 — 동일 패턴).
CREATE TABLE IF NOT EXISTS reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     UUID NOT NULL,
  target_type     TEXT NOT NULL CHECK (target_type IN ('maker', 'project')),
  target_id       UUID NOT NULL,
  reason_category TEXT NOT NULL
    CHECK (reason_category IN ('spam', 'abuse', 'fraud', 'sexual', 'copyright', 'privacy', 'etc')),
  detail          TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID
);

-- 관리자 목록(상태별 최신순) / 미처리(open) 카운트 인덱스.
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
