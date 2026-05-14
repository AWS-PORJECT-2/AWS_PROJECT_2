import 'dotenv/config';
import { createPool } from './_shared';

async function main() {
  const pool = createPool();
  try {
    // 워밍업 (첫 연결 비용 제외)
    await pool.query('SELECT 1');

    // 사용자 ID 확보
    const userResult = await pool.query('SELECT id FROM "user" LIMIT 1');
    if (userResult.rows.length === 0) {
      console.log('유저가 없습니다.');
      return;
    }
    const userId = userResult.rows[0].id;

    // 1. addresses 테이블 인덱스 확인
    console.log('=== addresses 테이블 인덱스 ===');
    const indexes = await pool.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'addresses'`
    );
    console.table(indexes.rows);

    // 2. 쿼리 5회 반복 측정
    console.log('\n=== findByUserId 5회 측정 ===');
    for (let i = 1; i <= 5; i++) {
      const start = Date.now();
      const result = await pool.query(
        'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
        [userId],
      );
      const ms = Date.now() - start;
      console.log(`${i}회: ${ms}ms (${result.rows.length}건)`);
    }

    // 3. EXPLAIN ANALYZE
    console.log('\n=== EXPLAIN ANALYZE ===');
    const explain = await pool.query(
      `EXPLAIN ANALYZE SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId],
    );
    explain.rows.forEach((row: { 'QUERY PLAN': string }) => console.log(row['QUERY PLAN']));
  } catch (err) {
    console.error('실패:', err);
  } finally {
    await pool.end();
  }
}

main();
