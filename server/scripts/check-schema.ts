import 'dotenv/config';
import { createPool } from './_shared';

async function main() {
  const pool = createPool();
  try {
    const result = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'addresses'
       ORDER BY ordinal_position`
    );
    console.log('=== addresses 테이블 컬럼 구조 ===');
    console.table(result.rows);
  } catch (err) {
    console.error('조회 실패:', err);
  } finally {
    await pool.end();
  }
}

main();
