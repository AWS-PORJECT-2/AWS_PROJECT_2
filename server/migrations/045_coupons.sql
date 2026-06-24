-- 045_coupons.sql
-- 수수료 할인 쿠폰. 관리자가 특정 사용자에게 발급 → 사용자 쿠폰함에 적립 + 알림.
-- 사용자는 프로젝트(직접 개설) 작성 시 쿠폰 코드를 입력해 정산 수수료율을 할인받는다.
--   discount_type = 'rate_off' : 수수료율에서 discount_value(%p)만큼 차감(0% 미만은 0)
--                 = 'waive'    : 수수료 전액 면제(0%)
-- 한 쿠폰은 1회용(unused → used). 사용 시 used_groupbuy_id 에 사용한 프로젝트를 기록.
CREATE TABLE IF NOT EXISTS coupons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT NOT NULL UNIQUE,
  owner_user_id    UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  discount_type    TEXT NOT NULL CHECK (discount_type IN ('rate_off', 'waive')),
  discount_value   INTEGER NOT NULL DEFAULT 0 CHECK (discount_value >= 0 AND discount_value <= 100),
  label            TEXT NOT NULL,                 -- 표시용. 예) "수수료 5%p 할인", "수수료 전액 면제"
  status           TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used')),
  used_groupbuy_id UUID REFERENCES groupbuys(id) ON DELETE SET NULL,
  issued_by        UUID REFERENCES "user"(id) ON DELETE SET NULL,  -- 발급한 관리자
  note             TEXT,                          -- 관리자 메모(선택)
  expires_at       TIMESTAMPTZ,                   -- 만료(선택). NULL = 무기한
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at          TIMESTAMPTZ
);

-- 내 쿠폰함 조회(소유자별, 미사용 우선·최신순) 가속.
CREATE INDEX IF NOT EXISTS idx_coupons_owner ON coupons (owner_user_id, status, created_at DESC);
