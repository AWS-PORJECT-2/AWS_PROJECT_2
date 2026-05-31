-- 026: 프로젝트 찜(좋아요) — 사용자가 펀드(groupbuy)를 찜.
-- 기존 localStorage 기반(브라우저별, 본인만) 찜을 서버 저장으로 전환.
--   → 누른 본인 외 모든 사용자에게 좋아요 수가 반영되고, 본인 찜이 기기간 유지된다.
-- 방어적: IF NOT EXISTS 로 중복·단독 적용 모두 안전. PK(user_id, groupbuy_id) 가 중복 찜을 막는다.
--   user_id/groupbuy_id 는 다른 소셜 테이블(follows/project_subscriptions)과 동일하게 UUID 로만 두고
--   외래키는 걸지 않는다(라이브 DB 의 user/groupbuys PK 타입 차이로 인한 적용 실패 방지 — 동일 패턴 유지).
CREATE TABLE IF NOT EXISTS project_likes (
  user_id     UUID NOT NULL,
  groupbuy_id UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, groupbuy_id)
);

-- 펀드별 좋아요 수 집계 / 목록 likeCount 서브쿼리용.
CREATE INDEX IF NOT EXISTS idx_project_likes_groupbuy ON project_likes(groupbuy_id);
