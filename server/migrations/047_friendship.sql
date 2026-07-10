-- 047: 프렌드십 (상호 수락) — follows 를 단방향 팔로우 → 양방향 동의 모델로 확장.
--  status: 'pending' = 요청 보냄(수락 대기), 'accepted' = 상호 친구 성립.
--  기존 데이터는 모두 'accepted' 로 보존(하위 호환) — 기존 팔로우 관계가 끊기지 않는다.
ALTER TABLE follows
  ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'accepted';

-- 수락 대기 목록/친구 목록 조회 최적화(대상 기준 status 필터).
CREATE INDEX IF NOT EXISTS idx_follows_status ON follows(creator_id, status);
