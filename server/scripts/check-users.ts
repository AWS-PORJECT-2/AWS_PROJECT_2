import 'dotenv/config';
import pg from 'pg';

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const users = await pool.query('SELECT id, email, name, school_domain, created_at, last_login_at FROM "user"');
    console.log(`유저 수: ${users.rows.length}`);
    console.table(users.rows);

    const tokens = await pool.query('SELECT id, user_id, remember_me, expires_at, created_at FROM refresh_token');
    console.log(`\nRefresh Token 수: ${tokens.rows.length}`);
    console.table(tokens.rows);
  } catch (err) {
    console.error('조회 실패:', err);
  } finally {
    await pool.end();
  }
}

main();
