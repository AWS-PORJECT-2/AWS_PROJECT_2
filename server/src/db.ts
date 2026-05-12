import fs from 'fs';
import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

/**
 * SSL 설정.
 *
 * AWS RDS 는 SSL 필수라 NODE_ENV 와 무관하게 켜준다.
 * 다만 TLS 검증은 끄지 않는다 (rejectUnauthorized:false 는 MITM 위험).
 *
 * - DATABASE_SSL_CA 가 지정되어 있으면 해당 인증서로 정식 검증 (권장).
 *   AWS RDS region 별 번들: https://truststore.pki.rds.amazonaws.com/
 * - DATABASE_SSL=disabled 면 SSL 자체를 끈다 (로컬 dev 에서 비-RDS Postgres 사용 시).
 * - 그 외엔 검증 활성 상태로 SSL 사용 (시스템 신뢰 체인 의존).
 */
function buildSslConfig(): pg.PoolConfig['ssl'] {
  const mode = process.env.DATABASE_SSL;
  if (mode === 'disabled') return undefined;

  const caPath = process.env.DATABASE_SSL_CA;
  if (caPath) {
    return { ca: fs.readFileSync(caPath, 'utf8') };
  }

  // DATABASE_URL 이 있으면 SSL 시도. NODE_ENV 분기 제거 — dev 모드의 EC2 도 RDS 에 붙어야 함.
  if (process.env.DATABASE_URL) {
    return { rejectUnauthorized: true };
  }

  return undefined;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSslConfig(),
});

pool.on('error', (err) => {
  logger.error({ err }, 'PostgreSQL 연결 풀 에러');
});

export { pool };
