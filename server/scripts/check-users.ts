import 'dotenv/config';
import { createPool } from './_shared.js';

async function main() {
  const pool = createPool();
  try {
    const users = await pool.query('SELECT id, email, name, school_domain, created_at, last_login_at FROM "user"');
    console.log(`유저 수: ${users.rows.length}`);
    console.table(users.rows);

    const tokens = await pool.query('SELECT id, user_id, remember_me, expires_at, created_at FROM refresh_token');
    console.log(`\nRefresh Token 수: ${tokens.rows.length}`);
    console.table(tokens.rows);
  } catch (err) {
    console.error('조회 실패:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
