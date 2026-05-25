import 'dotenv/config';
import pg from 'pg';

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'disabled' ? undefined : { rejectUnauthorized: false },
  });
  await pool.query('ALTER TABLE "user" ALTER COLUMN picture TYPE TEXT');
  console.log('picture 컬럼을 TEXT로 변경 완료');
  await pool.end();
}

main();
