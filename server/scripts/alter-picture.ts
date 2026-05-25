import 'dotenv/config';
import { createPool } from './_shared.js';

async function main() {
  const pool = createPool();
  try {
    await pool.query('ALTER TABLE "user" ALTER COLUMN picture TYPE TEXT');
    console.log('picture 컬럼을 TEXT로 변경 완료');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('마이그레이션 실패:', err);
  process.exit(1);
});
