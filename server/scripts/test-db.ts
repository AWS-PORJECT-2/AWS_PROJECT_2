import 'dotenv/config';
import { createPool } from './_shared';

async function main() {
  const pool = createPool();
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
