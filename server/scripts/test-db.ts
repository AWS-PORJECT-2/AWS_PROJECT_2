import 'dotenv/config';
import { createPool } from './_shared.js';

async function main() {
  const pool = createPool();
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('연결 성공:', res.rows[0].now);
  } catch (err) {
    console.error('연결 실패:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
