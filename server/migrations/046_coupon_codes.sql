-- 046_coupon_codes.sql
-- 쿠폰 2종 체계로 확장.
--  (A) 관리자 직접 발급: coupons 에 owner 지정 행을 바로 생성(코드 없음 → code NULL).
--  (B) 관리자 쿠폰 코드 생성: coupon_codes 에 공유 코드를 만들고, 사용자가 코드를 입력해 등록하면
--      coupons 에 본인 소유 인스턴스가 생긴다(source_code_id 연결, code 는 표시·공유용 denormalize).
-- 등록 제한: 최대 등록 인원(max_registrations), 코드 등록 마감(code_expires_at),
--           등록된 쿠폰의 유효기간(coupon_valid_days, 등록 시점부터 N일).

CREATE TABLE IF NOT EXISTS coupon_codes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL UNIQUE,
  label             TEXT NOT NULL,
  discount_type     TEXT NOT NULL CHECK (discount_type IN ('rate_off', 'waive')),
  discount_value    INTEGER NOT NULL DEFAULT 0 CHECK (discount_value >= 0 AND discount_value <= 100),
  max_registrations INTEGER,                         -- NULL = 무제한. 도달 시 active=false 전환.
  registered_count  INTEGER NOT NULL DEFAULT 0,
  code_expires_at   TIMESTAMPTZ,                     -- 코드 등록 마감(NULL = 무기한)
  coupon_valid_days INTEGER,                         -- 등록된 쿠폰 유효기간(일). NULL = 무기한.
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES "user"(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- coupons: code 를 선택값으로(직접 발급은 코드 없음), 공유 코드 출처 연결 추가.
ALTER TABLE coupons ALTER COLUMN code DROP NOT NULL;
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_code_key;  -- 코드 유니크 해제(여러 사용자가 같은 코드 등록)
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS source_code_id UUID REFERENCES coupon_codes(id) ON DELETE SET NULL;

-- 같은 코드를 같은 사용자가 중복 등록 못 하게(코드 출처가 있을 때만).
CREATE UNIQUE INDEX IF NOT EXISTS uq_coupons_owner_source ON coupons (owner_user_id, source_code_id) WHERE source_code_id IS NOT NULL;
