import fs from 'fs';
import pg from 'pg';

/**
 * 스크립트 공용 SSL 설정 — server/src/db.ts 의 buildSslConfig 와 동일 정책.
 * rejectUnauthorized:false 하드코딩 금지 (MITM 방어).
 */
function buildSslConfig(): pg.PoolConfig['ssl'] {
  const mode = process.env.DATABASE_SSL;
  if (mode === 'disabled') return undefined;
  const caPath = process.env.DATABASE_SSL_CA;
  if (caPath) return { ca: fs.readFileSync(caPath, 'utf8') };
  if (process.env.DATABASE_URL) return { rejectUnauthorized: true };
  return undefined;
}

export function createPool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다. server/.env 확인.');
  }
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: buildSslConfig(),
  });
}
