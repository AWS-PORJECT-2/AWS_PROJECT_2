import 'dotenv/config';
import pg from 'pg';

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('연결 성공:', res.rows[0].now);
  } catch (err) {
    console.error('연결 실패:', err);
  } finally {
    await pool.end();
  }
}

main();
