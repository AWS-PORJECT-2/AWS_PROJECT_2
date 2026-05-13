import 'dotenv/config';
import pg from 'pg';

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    // 테이블 목록
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log('=== 테이블 목록 ===');
    tables.rows.forEach((r: { table_name: string }) => console.log(' -', r.table_name));

    // 배송지 데이터 확인
    const addresses = await pool.query('SELECT * FROM addresses LIMIT 10');
    console.log('\n=== addresses 테이블 ===');
    console.log(`총 ${addresses.rowCount}건`);
    if (addresses.rows.length > 0) {
      console.log(JSON.stringify(addresses.rows, null, 2));
    }

    // 유저 데이터 확인
    const users = await pool.query('SELECT id, email, name FROM users LIMIT 10');
    console.log('\n=== users 테이블 ===');
    console.log(`총 ${users.rowCount}건`);
    if (users.rows.length > 0) {
      console.log(JSON.stringify(users.rows, null, 2));
    }
  } catch (err) {
    console.error('쿼리 실패:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
