import fs from 'fs';
import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

/**
 * SSL 설정.
 *
 * AWS RDS 는 SSL 필수라 NODE_ENV 와 무관하게 켜준다.
 *
 * - DATABASE_SSL_CA 가 지정되어 있으면 해당 인증서로 정식 검증 (권장).
 *   AWS RDS region 별 번들: https://truststore.pki.rds.amazonaws.com/
 * - DATABASE_SSL=disabled 면 SSL 자체를 끈다 (로컬 dev 에서 비-RDS Postgres 사용 시).
 * - 프로덕션(NODE_ENV=production)에서 DATABASE_SSL_CA 미설정 시 에러로 부팅 차단.
 * - 개발 환경에서만 rejectUnauthorized:false 허용 (자체 서명 인증서 호환).
 */
function buildSslConfig(): pg.PoolConfig['ssl'] {
  const mode = process.env.DATABASE_SSL;
  if (mode === 'disabled') {
    // 로컬(loopback) DB 는 네트워크를 타지 않아 SSL 이 불필요 → 운영에서도 localhost 한정으로 허용.
    // (DB 를 같은 EC2 의 PostgreSQL 로 옮긴 구성). 원격 DB 를 운영에서 평문 연결하는 것은 여전히 차단.
    const url = process.env.DATABASE_URL || '';
    const isLoopback = url.includes('@localhost') || url.includes('@127.0.0.1') || url.includes('@[::1]');
    if (process.env.NODE_ENV === 'production' && !isLoopback) {
      throw new Error('프로덕션에서는 원격 DB 에 DATABASE_SSL=disabled 를 사용할 수 없습니다.');
    }
    return undefined;
  }

  const caPath = process.env.DATABASE_SSL_CA;
  if (caPath) {
    return { ca: fs.readFileSync(caPath, 'utf8') };
  }

  // DATABASE_URL 이 있으면 SSL 시도.
  // 프로덕션에서는 DATABASE_SSL_CA 필수. 개발 환경에서만 rejectUnauthorized:false 허용.
  if (process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('프로덕션에서는 DATABASE_SSL_CA 설정이 필수입니다.');
    }
    return { rejectUnauthorized: false };
  }

  return undefined;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSslConfig(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'PostgreSQL 연결 풀 에러');
});

// 부팅 시 워밍업 — 첫 요청 지연 감소
pool.query('SELECT 1').catch((err) => {
  logger.warn({ err }, 'DB 워밍업 실패 (서버는 계속 실행)');
});

export { pool };
