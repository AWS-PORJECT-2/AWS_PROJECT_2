import fs from 'fs';
import pg from 'pg';

/**
 * 스크립트 공용 SSL 설정 — server/src/db.ts 의 buildSslConfig 와 동일 정책 (fail-closed).
 * - DATABASE_SSL_CA 지정 시 정식 인증서 검증 (권장).
 * - 프로덕션에서 CA 미설정 시 에러 (rejectUnauthorized:false 로 MITM 노출 금지).
 * - 개발 환경에서만 rejectUnauthorized:false 허용 (자체 서명 인증서 호환).
 */
function buildSslConfig(): pg.PoolConfig['ssl'] {
  const mode = process.env.DATABASE_SSL;
  if (mode === 'disabled') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('프로덕션에서는 DATABASE_SSL=disabled를 사용할 수 없습니다.');
    }
    return undefined;
  }
  const caPath = process.env.DATABASE_SSL_CA;
  if (caPath) return { ca: fs.readFileSync(caPath, 'utf8') };
  if (process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('프로덕션에서는 DATABASE_SSL_CA 설정이 필수입니다.');
    }
    return { rejectUnauthorized: false };
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
