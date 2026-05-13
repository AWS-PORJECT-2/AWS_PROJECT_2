-- 006_create_payment_system.sql
-- 무통장 입금 기반 공동구매 결제 시스템

-- 주문 테이블
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE COMMENT '주문번호 (예: ORD-20240101-001)',
  user_id INT NOT NULL COMMENT '주문자 ID',
  fund_id INT NULL COMMENT '펀드 ID (공동구매)',
  total_price INT NOT NULL COMMENT '총 결제 금액',
  status ENUM('PENDING', 'WAITING_FOR_CONFIRM', 'PAID', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'PENDING' COMMENT '주문 상태',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_user_id (user_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_fund_id (fund_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='주문 메인 테이블';

-- 주문 상세 테이블 (상품별 사이즈, 수량 등)
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL COMMENT '주문 ID',
  product_name VARCHAR(200) NOT NULL COMMENT '상품명',
  size VARCHAR(50) NULL COMMENT '사이즈 옵션',
  quantity INT NOT NULL DEFAULT 1 COMMENT '수량',
  price INT NOT NULL COMMENT '개당 가격',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_order_items_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='주문 상세 (상품별)';

-- 입금 확인증 테이블
CREATE TABLE IF NOT EXISTS payment_proofs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL COMMENT '주문 ID',
  depositor_name VARCHAR(100) NOT NULL COMMENT '입금자명',
  image_path VARCHAR(500) NOT NULL COMMENT '확인증 이미지 경로',
  is_confirmed BOOLEAN NOT NULL DEFAULT FALSE COMMENT '관리자 확인 여부',
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_payment_proofs_order_id (order_id),
  INDEX idx_payment_proofs_confirmed (is_confirmed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='입금 확인증';

-- 관리자 확인 이력 테이블
CREATE TABLE IF NOT EXISTS payment_confirmations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL COMMENT '주문 ID',
  confirmed_by VARCHAR(100) NOT NULL COMMENT '확인한 관리자 식별자',
  confirmed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '확인 시각',
  memo TEXT NULL COMMENT '특이사항 메모',
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_payment_confirmations_order_id (order_id),
  INDEX idx_payment_confirmations_confirmed_at (confirmed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='관리자 확인 이력';

-- 배송지 테이블
CREATE TABLE IF NOT EXISTS shipping_addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '사용자 ID',
  label VARCHAR(50) NOT NULL COMMENT '배송지 별칭 (예: 집, 회사)',
  recipient_name VARCHAR(50) NOT NULL COMMENT '수령인 이름',
  recipient_phone VARCHAR(20) NOT NULL COMMENT '수령인 연락처',
  postal_code VARCHAR(10) NOT NULL COMMENT '우편번호',
  road_address VARCHAR(200) NOT NULL COMMENT '도로명 주소',
  jibun_address VARCHAR(200) NULL COMMENT '지번 주소',
  detail_address VARCHAR(200) NULL COMMENT '상세 주소',
  is_default BOOLEAN NOT NULL DEFAULT FALSE COMMENT '기본 배송지 여부',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_shipping_addresses_user_id (user_id),
  INDEX idx_shipping_addresses_default (user_id, is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='배송지 정보';

-- orders 테이블에 배송지 연결
ALTER TABLE orders ADD COLUMN shipping_address_id INT NULL COMMENT '배송지 ID' AFTER user_id;
ALTER TABLE orders ADD FOREIGN KEY (shipping_address_id) REFERENCES shipping_addresses(id) ON DELETE SET NULL;
ALTER TABLE orders ADD INDEX idx_orders_shipping_address (shipping_address_id);
