import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createPool } from './_shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../migrations');

/**
 * 단순 마이그레이션 러너.
 *
 * - schema_migrations 메타테이블로 적용 이력 추적 → 이미 적용된 마이그레이션 skip
 * - 각 마이그레이션은 트랜잭션 안에서 실행 → 중간 실패 시 ROLLBACK
 * - migrations/ 폴더의 *.sql 을 알파벳 순으로 적용 (001, 002, 003... 자연 정렬)
 */
async function main() {
  const pool = createPool();
  const client = await pool.connect();
  try {
    // 1. 메타테이블 보장
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 2. 이미 적용된 목록
    const applied = new Set<string>(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );

    // 3. migrations/ 폴더의 .sql 정렬해서 순차 적용
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    let appliedCount = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`SKIP ${file} (이미 적용됨)`);
        continue;
      }
      console.log(`APPLY ${file}`);
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        appliedCount++;
        console.log(`  ✓ ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`  ✗ ${file} 실패:`, err);
        throw err;
      }
    }

    console.log(`\n완료. 적용 ${appliedCount}건 / 전체 ${files.length}건.`);
  } catch (err) {
    console.error('마이그레이션 실패:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
