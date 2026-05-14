import 'dotenv/config';
import { createPool } from './_shared';

async function main() {
  const pool = createPool();
  try {
    // PII(email) 제외, 비식별 필드만 조회
    const users = await pool.query(
      'SELECT id, school_domain, created_at, last_login_at FROM "user"'
    );
    console.log(`유저 수: ${users.rows.length}`);
    console.table(users.rows);

    const tokens = await pool.query(
      'SELECT id, user_id, remember_me, expires_at, created_at FROM refresh_token'
    );
    console.log(`\nRefresh Token 수: ${tokens.rows.length}`);
    console.table(tokens.rows);
  } catch (err) {
    console.error('조회 실패:', err);
  } finally {
    await pool.end();
  }
}

main();
