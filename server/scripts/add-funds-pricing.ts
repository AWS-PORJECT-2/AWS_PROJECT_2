import 'dotenv/config';
import mysql from 'mysql2/promise';
import { getDbConnectionOptions } from './db-config.js';

/**
 * funds 테이블에 가격 신뢰성을 위한 컬럼 추가:
 *  - unit_price : 서버가 신뢰하는 단가 (KRW)
 *  - status     : ACTIVE | CLOSED — 판매 중지 상태 차단용
 */

async function main() {
  const conn = await mysql.createConnection(getDbConnectionOptions());

  async function hasColumn(name: string): Promise<boolean> {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'funds' AND COLUMN_NAME = ?`,
      [name]
    );
    return (rows as mysql.RowDataPacket[]).length > 0;
  }

  try {
    if (!(await hasColumn('unit_price'))) {
      await conn.query(`ALTER TABLE funds ADD COLUMN unit_price INT NOT NULL DEFAULT 1 COMMENT '서버 신뢰 단가 (원)' AFTER category`);
      console.log('✓ funds.unit_price 추가');
    } else {
      console.log('• funds.unit_price 이미 존재');
    }

    if (!(await hasColumn('status'))) {
      await conn.query(`ALTER TABLE funds ADD COLUMN status ENUM('ACTIVE','CLOSED') NOT NULL DEFAULT 'ACTIVE' COMMENT '판매 상태' AFTER unit_price`);
      console.log('✓ funds.status 추가');
    } else {
      console.log('• funds.status 이미 존재');
    }

    // 시드 펀드 단가 백필 (mock-data 의 priceText='1원' 과 일치)
    await conn.query(
      `UPDATE funds SET unit_price = CASE id
         WHEN 1 THEN 1
         WHEN 2 THEN 1
         WHEN 3 THEN 1
         WHEN 4 THEN 1
         ELSE unit_price
       END
       WHERE id IN (1, 2, 3, 4)`
    );
    console.log('✓ 시드 펀드 단가 백필');

    console.log('\n✅ 완료');
  } finally {
    await conn.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌', err); process.exit(1); });
