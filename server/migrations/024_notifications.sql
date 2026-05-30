-- 024: 서버 기반 알림(notifications) — 여러 이벤트에서 알림을 생성하고 사용자가 조회/읽음 처리.
--   방어적: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS 로 중복·단독 적용 모두 안전.
--   type 예: welcome, fund_submitted, creator_new_fund, backed, new_backer,
--            deadline_soon, fund_success, fund_failed, backed_success, backed_failed, scheduled_open.
--   fund_id 는 알림이 특정 펀드와 연결될 때만 채워짐(welcome 등은 NULL). FK 는 걸지 않음
--   (펀드 삭제 후에도 과거 알림 텍스트는 보존 — body 에 자체 문구가 있어 표시에 문제 없음).

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  type       VARCHAR(40) NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  fund_id    UUID,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 목록 조회(최신순) / 미읽음 카운트 인덱스.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
-- 마감임박 등 펀드 단위 중복 발송 방지 검사용(동일 type+fund_id 존재 검사).
CREATE INDEX IF NOT EXISTS idx_notifications_type_fund ON notifications(type, fund_id);
