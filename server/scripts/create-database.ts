import 'dotenv/config';
import mysql from 'mysql2/promise';
import { getRootConnectionOptions, getDbConnectionOptions } from './db-config.js';

/**
 * MySQL 데이터베이스 및 테이블 생성 스크립트.
 *
 * 안전 정책:
 *  - production 환경에서는 절대 실행 불가 (process 즉시 종료)
 *  - 테이블 DROP 은 RESET_SCHEMA=true 일 때만 실행
 *  - 그 외에는 CREATE TABLE IF NOT EXISTS 만 수행하므로 기존 데이터를 보존
 *
 * 사용법:
 *  - 최초 부트스트랩: NODE_ENV=development npx tsx scripts/create-database.ts
 *  - 스키마 초기화 (개발용):
 *      NODE_ENV=development RESET_SCHEMA=true npx tsx scripts/create-database.ts
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SHOULD_RESET_SCHEMA = process.env.RESET_SCHEMA === 'true';

// === 운영 환경 원천 차단 ===
if (IS_PRODUCTION) {
  console.error('❌ [SAFETY] NODE_ENV=production 에서는 create-database 스크립트를 실행할 수 없습니다.');
  console.error('   운영 DB 변경은 정식 마이그레이션(migrations/)을 사용해주세요.');
  process.exit(1);
}

// === RESET_SCHEMA 가드 ===
if (SHOULD_RESET_SCHEMA && IS_PRODUCTION) {
  // 위에서 이미 차단되지만 이중 안전장치
  console.error('❌ [SAFETY] production 에서 RESET_SCHEMA 사용 불가');
  process.exit(1);
}

async function createDatabase() {
  // 1) 데이터베이스 자체 생성 (database 미지정 연결)
  const rootConn = await mysql.createConnection(getRootConnectionOptions());

  try {
    console.log('MySQL 연결 성공');
    const dbName = process.env.DB_NAME || 'doothing';
    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✓ 데이터베이스 "${dbName}" 준비 완료`);
  } finally {
    await rootConn.end();
  }

  // 2) doothing DB로 연결해서 테이블 생성
  const conn = await mysql.createConnection(getDbConnectionOptions());

  try {
    console.log('\n테이블 생성 중...');

    // 1. users 테이블 (FK 참조의 시작점)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE COMMENT '로그인 ID (학번 등)',
        name VARCHAR(50) NOT NULL COMMENT '이름',
        role ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER' COMMENT '권한',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_users_username (username),
        INDEX idx_users_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='사용자'
    `);
    console.log('✓ users 테이블');

    // === 파괴적 작업: RESET_SCHEMA=true 일 때만 ===
    if (SHOULD_RESET_SCHEMA) {
      console.warn('⚠️  RESET_SCHEMA=true — 기존 테이블을 모두 DROP 합니다.');
      try {
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        await conn.query('DROP TABLE IF EXISTS payment_confirmations');
        await conn.query('DROP TABLE IF EXISTS payment_proofs');
        await conn.query('DROP TABLE IF EXISTS order_items');
        await conn.query('DROP TABLE IF EXISTS orders');
        await conn.query('DROP TABLE IF EXISTS shipping_addresses');
        console.log('✓ 기존 테이블 DROP 완료');
      } finally {
        // 어떤 경우에도 외래키 검사 복구
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      }
    } else {
      console.log('• RESET_SCHEMA 미설정 — 기존 데이터 보존 (CREATE TABLE IF NOT EXISTS)');
    }

    // 2. shipping_addresses (users FK)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS shipping_addresses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        label VARCHAR(50) NOT NULL COMMENT '배송지 별칭',
        recipient_name VARCHAR(50) NOT NULL,
        recipient_phone VARCHAR(20) NOT NULL,
        postal_code VARCHAR(10) NOT NULL,
        road_address VARCHAR(200) NOT NULL,
        jibun_address VARCHAR(200) NULL,
        detail_address VARCHAR(200) NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_shipping_addresses_user_id (user_id),
        INDEX idx_shipping_addresses_default (user_id, is_default)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='배송지'
    `);
    console.log('✓ shipping_addresses 테이블');

    // 3. orders (users FK + shipping_addresses FK)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(50) NOT NULL UNIQUE,
        user_id INT NOT NULL,
        shipping_address_id INT NULL,
        fund_id INT NULL,
        total_price INT NOT NULL,
        status ENUM('PENDING', 'WAITING_FOR_CONFIRM', 'PAID', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (shipping_address_id) REFERENCES shipping_addresses(id) ON DELETE SET NULL,
        INDEX idx_orders_user_id (user_id),
        INDEX idx_orders_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='주문'
    `);
    console.log('✓ orders 테이블');

    // 4. order_items (orders FK)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_name VARCHAR(200) NOT NULL,
        size VARCHAR(50) NULL,
        quantity INT NOT NULL DEFAULT 1,
        price INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        INDEX idx_order_items_order_id (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='주문 상세'
    `);
    console.log('✓ order_items 테이블');

    // 5. payment_proofs (orders FK)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS payment_proofs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        depositor_name VARCHAR(100) NOT NULL,
        is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        INDEX idx_payment_proofs_order_id (order_id),
        INDEX idx_payment_proofs_confirmed (is_confirmed)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='입금 확인 (입금자명만 기록)'
    `);
    console.log('✓ payment_proofs 테이블');

    // 6. payment_confirmations (orders FK + users FK)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS payment_confirmations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        confirmed_by INT NOT NULL COMMENT '관리자 user.id',
        confirmed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        memo TEXT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_payment_confirmations_order_id (order_id),
        INDEX idx_payment_confirmations_confirmed_at (confirmed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='관리자 확인 이력'
    `);
    console.log('✓ payment_confirmations 테이블');

    // 7. 기본 테스트 유저 시드 (UPSERT)
    await conn.query(`
      INSERT INTO users (username, name, role) VALUES
        ('test_user', '테스트 유저', 'USER'),
        ('admin', '관리자', 'ADMIN')
      ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)
    `);
    console.log('✓ 시드 데이터 (test_user, admin)');

    console.log('\n✅ 완료. 모든 테이블이 FK 관계로 연결되어 있습니다.');
  } finally {
    await conn.end();
  }
}

createDatabase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ 실패:', err);
    process.exit(1);
  });
