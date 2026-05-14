import 'dotenv/config';
import pg from 'pg';

/**
 * 환경변수 기반 SSL 설정을 빌드합니다.
 * - DB_SSL=false: SSL 비활성화
 * - DB_SSL_REJECT_UNAUTHORIZED=false: 인증서 검증 비활성화 (개발 환경 전용)
 * - 기본값: SSL 활성화 + 인증서 검증 활성화
 */
export function buildSslConfig(): pg.PoolConfig['ssl'] {
  if (process.env.DB_SSL === 'false') {
    return false;
  }

  const rejectUnauthorized =
    process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true;

  return { rejectUnauthorized };
}

/**
 * 공용 pg.Pool 인스턴스를 생성합니다.
 * 모든 스크립트에서 이 함수를 사용하세요.
 */
export function createPool(): pg.Pool {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: buildSslConfig(),
  });
}
