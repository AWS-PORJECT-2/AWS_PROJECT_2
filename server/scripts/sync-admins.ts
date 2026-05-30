import 'dotenv/config';
import { createPool } from './_shared.js';

/**
 * ADMIN_EMAILS(콤마 구분) 에 포함된 기존 사용자를 즉시 ADMIN 으로 승격.
 * 로그인 시 auth-service 가 자동 승격하지만, 이미 가입된 사용자를 재로그인 없이 즉시 반영하기 위함.
 * 멱등 — 여러 번 실행해도 안전. 자동 강등은 하지 않음.
 */
async function main() {
  const emails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    console.log('ADMIN_EMAILS 가 비어 있습니다. 승격할 대상 없음.');
    return;
  }

  const pool = createPool();
  try {
    const res = await pool.query(
      `UPDATE "user" SET role = 'ADMIN' WHERE LOWER(email) = ANY($1::text[]) AND role <> 'ADMIN' RETURNING email`,
      [emails],
    );
    console.log(`대상 이메일: ${emails.join(', ')}`);
    console.log(`승격된 사용자: ${res.rows.length}명`);
    res.rows.forEach((r) => console.log('  → ' + r.email));

    const all = await pool.query(`SELECT email FROM "user" WHERE role = 'ADMIN' ORDER BY email`);
    console.log(`\n현재 전체 ADMIN: ${all.rows.length}명`);
    all.rows.forEach((r) => console.log('  - ' + r.email));
  } catch (err) {
    console.error('관리자 동기화 실패:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
