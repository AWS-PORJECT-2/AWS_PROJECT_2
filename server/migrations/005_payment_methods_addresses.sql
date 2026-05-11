-- payment_methods table
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  pg_provider VARCHAR(30) NOT NULL DEFAULT 'portone',
  channel_type VARCHAR(30) NOT NULL,
  billing_key_ref VARCHAR(200) NOT NULL,
  card_name VARCHAR(100),
  card_last_four VARCHAR(4),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (channel_type IN ('TOSSPAY', 'KAKAOPAY', 'NAVERPAY', 'CARD_DIRECT')),
  CHECK (status IN ('ACTIVE', 'DELETED', 'EXPIRED'))
);
CREATE INDEX idx_payment_methods_user ON payment_methods(user_id);
CREATE UNIQUE INDEX idx_payment_methods_user_default 
  ON payment_methods(user_id) WHERE is_default = TRUE AND status = 'ACTIVE';

-- addresses table
CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  label VARCHAR(50) NOT NULL,
  recipient_name VARCHAR(50) NOT NULL,
  recipient_phone VARCHAR(20) NOT NULL,
  postal_code VARCHAR(10) NOT NULL,
  road_address VARCHAR(200) NOT NULL,
  jibun_address VARCHAR(200),
  detail_address VARCHAR(200),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE UNIQUE INDEX idx_addresses_user_default ON addresses(user_id) WHERE is_default = TRUE;

-- Add columns to participations
ALTER TABLE participations 
  ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES payment_methods(id),
  ADD COLUMN IF NOT EXISTS address_id UUID REFERENCES addresses(id);
