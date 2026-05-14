import 'dotenv/config';
import { createPool } from './_shared';

async function main() {
  const pool = createPool();
  try {
    const addresses = await pool.query(
      'SELECT id, user_id, label, recipient_name, recipient_phone, postal_code, road_address, is_default, created_at FROM addresses ORDER BY created_at DESC'
    );
    console.log(`배송지 수: ${addresses.rows.length}`);
    if (addresses.rows.length > 0) {
      console.table(addresses.rows);
    } else {
      console.log('등록된 배송지가 없습니다.');
    }
  } catch (err) {
    console.error('조회 실패:', err);
  } finally {
    await pool.end();
  }
}

main();
