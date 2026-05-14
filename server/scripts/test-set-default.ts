import 'dotenv/config';
import { createPool } from './_shared';

async function main() {
  const pool = createPool();
  try {
    // 현재 배송지 목록 확인
    const before = await pool.query(
      'SELECT id, label, is_default FROM addresses ORDER BY created_at'
    );
    console.log('=== 변경 전 ===');
    console.table(before.rows);

    if (before.rows.length < 2) {
      console.log('배송지가 2개 이상 있어야 테스트할 수 있습니다.');
      return;
    }

    // 현재 기본이 아닌 배송지를 기본으로 변경
    const nonDefault = before.rows.find((r: { is_default: boolean }) => !r.is_default);
    if (!nonDefault) {
      console.log('모든 배송지가 이미 기본으로 설정되어 있습니다.');
      return;
    }

    const targetId = nonDefault.id;
    const userId = (await pool.query('SELECT user_id FROM addresses WHERE id = $1', [targetId])).rows[0].user_id;

    console.log(`\n기본 배송지를 [${nonDefault.label}] (${targetId})로 변경 시도...`);

    // setDefault 로직 실행
    await pool.query(
      'UPDATE addresses SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1',
      [userId],
    );
    await pool.query(
      'UPDATE addresses SET is_default = TRUE, updated_at = NOW() WHERE id = $1 AND user_id = $2',
      [targetId, userId],
    );

    // 결과 확인
    const after = await pool.query(
      'SELECT id, label, is_default FROM addresses WHERE user_id = $1 ORDER BY created_at',
      [userId],
    );
    console.log('\n=== 변경 후 ===');
    console.table(after.rows);
    console.log('\n✅ 기본 배송지 변경 성공!');
  } catch (err) {
    console.error('실패:', err);
  } finally {
    await pool.end();
  }
}

main();
