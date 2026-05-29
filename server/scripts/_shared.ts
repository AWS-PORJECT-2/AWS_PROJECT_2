import fs from 'fs';
import pg from 'pg';

/**
 * 스크립트 공용 SSL 설정 — server/src/db.ts 의 buildSslConfig 와 동일 정책.
 * 프로덕션에서는 DATABASE_SSL_CA 를 설정하여 정식 인증서 검증 권장.
 * CA 미지정 시 rejectUnauthorized:false 로 연결 (자체 서명 인증서 호환).
 */
function buildSslConfig(): pg.PoolConfig['ssl'] {
  const mode = process.env.DATABASE_SSL;
  if (mode === 'disabled') return undefined;
  const caPath = process.env.DATABASE_SSL_CA;
  if (caPath) return { ca: fs.readFileSync(caPath, 'utf8') };
  if (process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_SSL_CA) {
      throw new Error('운영 환경에서는 DATABASE_SSL_CA 가 필요합니다 (rejectUnauthorized:false 금지).');
    }
    return { rejectUnauthorized: true };
  }
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
