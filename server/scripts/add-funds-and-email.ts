import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';

/**
 * - users 테이블에 email 컬럼 추가 (학교 이메일)
 * - funds 테이블 생성: 펀딩 단위 (current_amount/target_amount)
 * - orders.fund_id 가 funds.id 를 참조하도록 FK 연결
 *
 * 안전하게 ALTER TABLE IF NOT EXISTS 흐름.
 */

async function main() {
  const sslConfig = fs.existsSync('./global-bundle.pem')
    ? { ca: fs.readFileSync('./global-bundle.pem', 'utf8'), rejectUnauthorized: true }
    : undefined;

  const conn = await mysql.createConnection({
    host: 'doothing-db.cj24wem202yj.us-east-1.rds.amazonaws.com',
    user: 'admin',
    password: 'fkdldjs22',
    port: 3306,
    database: 'doothing',
    ssl: sslConfig,
  });

  try {
    console.log('MySQL 연결 성공');

    // 1) users.email 컬럼 추가 (없을 때만)
    const [emailCol] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = 'doothing' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email'`
    );
    if ((emailCol as mysql.RowDataPacket[]).length === 0) {
      await conn.query(`ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL AFTER name`);
      await conn.query(`ALTER TABLE users ADD INDEX idx_users_email (email)`);
      console.log('✓ users.email 컬럼 추가');
    } else {
      console.log('• users.email 이미 존재');
    }

    // 시드 유저 이메일 채우기
    await conn.query(
      `UPDATE users SET email = ? WHERE username = ? AND (email IS NULL OR email = '')`,
      ['testuser@kookmin.ac.kr', 'test_user']
    );
    await conn.query(
      `UPDATE users SET email = ? WHERE username = ? AND (email IS NULL OR email = '')`,
      ['cnrtnsms@kookmin.ac.kr', 'admin']
    );
    console.log('✓ 시드 유저 이메일 백필');

    // 2) funds 테이블
    await conn.query(`
      CREATE TABLE IF NOT EXISTS funds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT '기타',
        target_amount INT NOT NULL DEFAULT 0 COMMENT '목표 금액 또는 인원',
        current_amount INT NOT NULL DEFAULT 0 COMMENT '현재 누적 금액 또는 인원',
        is_notified BOOLEAN NOT NULL DEFAULT FALSE COMMENT '100% 달성 알림 발송 여부',
        notified_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_funds_notified (is_notified)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='펀딩'
    `);
    console.log('✓ funds 테이블');

    // 3) orders.fund_id FK 연결 (이미 fund_id 컬럼 있음)
    const [fk] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA='doothing' AND TABLE_NAME='orders' AND COLUMN_NAME='fund_id'
         AND REFERENCED_TABLE_NAME='funds'`
    );
    if ((fk as mysql.RowDataPacket[]).length === 0) {
      try {
        await conn.query(
          `ALTER TABLE orders ADD CONSTRAINT fk_orders_fund_id
             FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE SET NULL`
        );
        console.log('✓ orders.fund_id → funds.id FK 연결');
      } catch (err: unknown) {
        // 기존 데이터의 fund_id 가 funds.id 에 없으면 실패할 수 있음 - 그땐 일단 무시.
        console.warn('• orders.fund_id FK 추가 실패 (무시):', (err as Error).message);
      }
    } else {
      console.log('• orders.fund_id FK 이미 존재');
    }

    // 4) 시드 펀드 4개 (mock-data 의 product id 1~4 와 매칭)
    await conn.query(
      `INSERT INTO funds (id, title, category, target_amount, current_amount)
       VALUES
         (1, '국민대학교 실시간 인기 순위 과잠', '과잠', 50, 0),
         (2, '국민대학교 블랙 반팔티 공구', '반팔티', 30, 0),
         (3, '[앵콜] 국민대학교 과잠 디자인 에디션', '과잠', 40, 0),
         (4, '국민대학교 미니멀 에코백', '에코백', 60, 0)
       ON DUPLICATE KEY UPDATE title = VALUES(title)`
    );
    console.log('✓ 시드 펀드 4개');

    console.log('\n✅ 완료');
  } finally {
    await conn.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌', err); process.exit(1); });
