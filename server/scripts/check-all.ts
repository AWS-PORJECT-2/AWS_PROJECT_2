import 'dotenv/config';
import { createPool } from './_shared';

async function main() {
  const pool = createPool();
  try {
    // 테이블 목록
    const tables = await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    console.log('=== 테이블 목록 ===');
    console.table(tables.rows);

    // 유저
    const users = await pool.query(
      'SELECT id, name, school_domain, created_at, last_login_at FROM "user" ORDER BY created_at DESC'
    );
    console.log(`\n=== 유저 (${users.rows.length}건) ===`);
    if (users.rows.length > 0) console.table(users.rows);

    // 배송지
    const addresses = await pool.query(
      'SELECT id, user_id, label, recipient_name, recipient_phone, postal_code, road_address, is_default, created_at FROM addresses ORDER BY created_at DESC'
    );
    console.log(`\n=== 배송지 (${addresses.rows.length}건) ===`);
    if (addresses.rows.length > 0) console.table(addresses.rows);

    // 리프레시 토큰
    const tokens = await pool.query(
      'SELECT id, user_id, remember_me, expires_at, created_at FROM refresh_token ORDER BY created_at DESC'
    );
    console.log(`\n=== 리프레시 토큰 (${tokens.rows.length}건) ===`);
    if (tokens.rows.length > 0) console.table(tokens.rows);

    // 허용 도메인
    const domains = await pool.query(
      'SELECT id, domain, school_name, is_active FROM allowed_domain ORDER BY domain'
    );
    console.log(`\n=== 허용 도메인 (${domains.rows.length}건) ===`);
    if (domains.rows.length > 0) console.table(domains.rows);
  } catch (err) {
    console.error('조회 실패:', err);
  } finally {
    await pool.end();
  }
}

main();
