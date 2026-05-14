import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { pool } from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../migrations');

/**
 * 단순 마이그레이션 러너 (MySQL용).
 *
 * - schema_migrations 메타테이블로 적용 이력 추적 → 이미 적용된 마이그레이션 skip
 * - 각 마이그레이션은 트랜잭션 안에서 실행 → 중간 실패 시 ROLLBACK
 * - migrations/ 폴더의 *.sql 을 알파벳 순으로 적용 (001, 002, 003... 자연 정렬)
 */
async function main() {
  const connection = await pool.getConnection();
  try {
    // 1. 메타테이블 보장
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 2. 이미 적용된 목록
    const [rows] = await connection.query<mysql.RowDataPacket[]>('SELECT name FROM schema_migrations');
    const applied = new Set<string>(rows.map((r) => r.name));

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
        await connection.beginTransaction();

        // MySQL은 여러 문장을 한 번에 실행할 수 있지만, 세미콜론으로 분리해서 실행.
        // 단순히 ;로 split 후 startsWith('--') 로 거르면 "-- 주석\nCREATE TABLE...;" 처럼
        // 주석 다음 줄에 유효한 DDL 이 있는 청크가 통째로 버려진다 (실제 마이그레이션 누락).
        // → 줄 단위로 주석 라인만 제거 → 다시 합쳐서 ; 로 split.
        const statements = sql
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n')
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const statement of statements) {
          await connection.query(statement);
        }

        await connection.query('INSERT INTO schema_migrations(name) VALUES (?)', [file]);
        await connection.commit();
        appliedCount++;
        console.log(`  ✓ ${file}`);
      } catch (err) {
        try {
          await connection.rollback();
        } catch (rbErr) {
          console.error(`  ⚠ ROLLBACK 실패 (${file}):`, rbErr);
        }
        console.error(`  ✗ ${file} 실패:`, err);
        throw err;
      }
    }

    console.log(`\n완료. 적용 ${appliedCount}건 / 전체 ${files.length}건.`);
  } catch (err) {
    console.error('마이그레이션 실패:', err);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
