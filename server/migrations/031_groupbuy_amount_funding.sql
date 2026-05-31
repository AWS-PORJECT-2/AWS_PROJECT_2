-- 031: 펀딩 목표를 수량 기준 → 금액 기준(와디즈/텀블벅식)으로 전환.
-- 배경: 기존 groupbuys 는 target_quantity(목표 수량)/current_quantity(참여 인원)로 달성률을 계산했다.
--   v2 사용자 요구: 개설 시 "목표 금액 + 마감일"만 입력, 게시글에 목표 금액·달성금액·달성률(금액) 표시.
-- 조치:
--   1) target_amount BIGINT — 펀딩 목표 금액(원). 신규 개설의 필수 입력. NULL/0 이면 코드가
--      폴백으로 (target_quantity × final_price) 를 목표 금액으로 표시(기존 펀드 호환).
--   2) current_amount BIGINT — 활성 후원 금액 합계 캐시. 후원 생성(pledge)/취소/자동취소 시
--      reward_orders.amount 만큼 +/- (current_quantity 증감과 같은 트랜잭션). 목록 SUM 서브쿼리 회피용.
--   target_quantity 는 유지(선택/파생, NULL 허용으로 완화), current_quantity 는 "참여 인원" 표시로 그대로 유지.
--   base_price 도 유지(수수료/표시 산정용, 없으면 0). 모두 IF NOT EXISTS — 재실행/기존 환경 안전.

ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS target_amount BIGINT;
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS current_amount BIGINT NOT NULL DEFAULT 0;

-- target_quantity 를 nullable 로 완화(개설폼에서 안 받으면 NULL). 기존 NOT NULL 제약만 해제.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'groupbuys' AND column_name = 'target_quantity'
               AND is_nullable = 'NO') THEN
    ALTER TABLE groupbuys ALTER COLUMN target_quantity DROP NOT NULL;
  END IF;
END $$;

-- current_amount 백필 — 기존 펀드의 활성 후원 금액 합계로 초기화(캐시 정합).
--   활성 = pledged/paid/payment_failed/cancel_requested + 구 무통장(awaiting_deposit/confirmed).
UPDATE groupbuys g SET current_amount = COALESCE((
  SELECT SUM(o.amount) FROM reward_orders o
   WHERE o.fund_id = g.id
     AND o.status IN ('pledged','paid','payment_failed','cancel_requested','awaiting_deposit','confirmed')
), 0);

-- target_amount 백필(선택) — 기존 펀드는 (target_quantity × final_price) 로 1회 채워둔다.
--   이후 코드 폴백과 동일 값이라 표시 일관성 유지. 0/NULL 인 펀드는 그대로 두고 코드 폴백에 맡긴다.
UPDATE groupbuys
   SET target_amount = (COALESCE(target_quantity, 0) * COALESCE(final_price, 0))
 WHERE target_amount IS NULL
   AND COALESCE(target_quantity, 0) > 0
   AND COALESCE(final_price, 0) > 0;
