-- 014: 리워드(선물) 구성 — 펀드별 후원 옵션. JSON 배열로 저장.
-- 각 티어: { id, title, price, description, stockLimit(null=무제한), soldCount }
-- 가격은 창작자가 직접 설정(플랫폼 프리셋 제거). 결제/소진은 Phase 4 에서 연동.

ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS reward_tiers TEXT;
