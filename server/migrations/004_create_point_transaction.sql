-- 004: 포인트(리워드) 원장 테이블
-- point_transaction 은 추가 전용(append-only) 원장으로 포인트 적립·소모의 진실의 원천이다.
-- 잔액 캐시는 user_profile.points 컬럼을 그대로 재사용한다(원장이 진실의 원천, 캐시는 빠른 조회용).

-- UUID 생성 함수(uuid_generate_v4) 의존성. 001 에서 이미 활성화하지만,
-- 본 파일 단독 실행/재실행에도 안전하도록 멱등하게(IF NOT EXISTS) 보장한다.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 사용자 프로필(포인트 잔액 캐시).
-- 설계는 마이그레이션 003 이 user_profile 을 만든다고 가정했으나, 실제 003 에는 존재하지 않는다.
-- 따라서 포인트 시스템이 필요로 하는 스키마로 여기서 멱등하게 생성한다.
-- 기존 "user" 테이블(001)은 그대로 두고, 1:1 로 확장하는 별도 테이블이다.
-- points 는 빠른 조회용 잔액 캐시이며 진실의 원천은 아래 point_transaction 원장이다.
CREATE TABLE IF NOT EXISTS user_profile (
  user_id    UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  department VARCHAR(100),
  year       INTEGER CHECK (year BETWEEN 1 AND 6),
  points     INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 포인트 원장(추가 전용). 진실의 원천.
CREATE TABLE point_transaction (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type          VARCHAR(10) NOT NULL CHECK (type IN ('earn', 'spend')),
  reason        VARCHAR(40) NOT NULL,
  amount        INTEGER NOT NULL CHECK (amount > 0),          -- 항상 양수 크기, 방향은 type 으로 표현
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),  -- 거래 직후 잔액 (요구사항 6.1)
  request_id    UUID,                                         -- 소모 멱등 키(선택)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 내역 조회(최신순) 최적화. 요구사항 7.1.
CREATE INDEX idx_point_tx_user_created ON point_transaction(user_id, created_at DESC);

-- 일회성 적립 멱등성: 사용자별 (signup/first_post/first_comment) 적립은 최대 1행.
-- 요구사항 1.3, 2.3, 3.3. 소모(spend)와 환불(refund_*)은 여러 번 가능하므로 제외.
CREATE UNIQUE INDEX uq_point_tx_one_time_earn
  ON point_transaction(user_id, reason)
  WHERE type = 'earn' AND reason IN ('signup', 'first_post', 'first_comment');

-- 소모 멱등성(선택): 동일 request_id 차감 중복 방지(클라이언트 재시도 안전).
CREATE UNIQUE INDEX uq_point_tx_request_id
  ON point_transaction(request_id)
  WHERE request_id IS NOT NULL;

-- 포인트 변동 알림 테이블.
-- 설계(NotificationPort)는 마이그레이션 003 에 notification 테이블이 있다고 가정했으나
-- 실제로는 어떤 마이그레이션에도 존재하지 않으므로 여기서 생성한다.
-- 포인트 알림 외 다른 알림(예: 펀드 관련)도 수용할 수 있도록 넉넉한 스키마를 둔다.
-- fund_id 는 nullable 이며, 전용 fund 테이블이 아직 없으므로 하드 FK 를 걸지 않는다
--   (마이그레이션 실행 순서 의존성을 피하기 위함). 포인트 알림은 fund_id = NULL 로 기록된다.
CREATE TABLE IF NOT EXISTS notification (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type       VARCHAR(50) NOT NULL,            -- 예: 'point_earn', 'point_spend'
  title      VARCHAR(255) NOT NULL,
  body       TEXT NOT NULL,                   -- 적립/차감 금액과 사유 포함
  fund_id    UUID,                            -- nullable, 포인트 알림은 NULL (FK 미설정)
  read_at    TIMESTAMPTZ,                     -- 읽음 처리 시각(미읽음이면 NULL)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 사용자별 미읽음 알림을 최신순으로 조회하기 위한 부분 인덱스.
CREATE INDEX IF NOT EXISTS idx_notification_user_unread
  ON notification(user_id, created_at DESC)
  WHERE read_at IS NULL;
