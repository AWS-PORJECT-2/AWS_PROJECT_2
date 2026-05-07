import fs from 'fs';
import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

/**
 * SSL 설정.
 *
 * - DATABASE_SSL_CA 가 지정되어 있으면 해당 인증서로 정식 검증을 수행한다 (권장).
 *   AWS RDS 의 경우 https://truststore.pki.rds.amazonaws.com/ 에서 region 별 번들을
 *   받아 보관하고 경로를 환경변수로 지정한다.
 * - DATABASE_SSL=disabled 면 SSL 자체를 끈다 (로컬 개발에서 비-RDS Postgres 사용 시).
 * - 그 외 production 에서는 SSL 을 켜되 검증은 활성화된 상태로 둔다.
 *   (pg 의 기본값은 검증 ON 이므로 별도 옵션 없이 빈 객체를 넘겨도 검증은 수행됨)
 *
 * 절대 NODE_ENV=production 에서 rejectUnauthorized:false 를 사용하지 않는다.
 * MITM 공격에 취약해진다.
 */
function buildSslConfig(): pg.PoolConfig['ssl'] {
  const mode = process.env.DATABASE_SSL;
  if (mode === 'disabled') return undefined;

  const caPath = process.env.DATABASE_SSL_CA;
  if (caPath) {
    return { ca: fs.readFileSync(caPath, 'utf8') };
  }

  if (process.env.NODE_ENV === 'production') {
    // CA 미지정 + production → 검증 활성 상태로 SSL 사용. RDS 의 시스템 신뢰 체인에
    // 의존한다. 가능하면 DATABASE_SSL_CA 를 명시할 것.
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
