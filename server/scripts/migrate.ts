import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('마이그레이션 001 실행 중...');
    const sql001 = readFileSync(join(__dirname, '../migrations/001_create_tables.sql'), 'utf-8');
    await pool.query(sql001);
    console.log('마이그레이션 001 완료');

    console.log('마이그레이션 002 실행 중...');
    const sql002 = readFileSync(join(__dirname, '../migrations/002_case_insensitive_unique.sql'), 'utf-8');
    await pool.query(sql002);
    console.log('마이그레이션 002 완료');

    console.log('모든 마이그레이션 완료!');
  } catch (err) {
    console.error('마이그레이션 실패:', err);
  } finally {
    await pool.end();
  }
}

main();
