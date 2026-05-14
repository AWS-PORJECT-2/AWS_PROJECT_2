import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

function buildSslConfig(): pg.PoolConfig['ssl'] {
  if (process.env.DB_SSL === 'false') return false;
  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true;
  return { rejectUnauthorized };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSslConfig(),
  // 풀 크기: 동시 처리 가능한 커넥션 수 (기본 10)
  max: 10,
  // 유휴 커넥션 유지 시간 (30초): 짧으면 매번 재연결, 너무 길면 RDS 측에서 끊음
  idleTimeoutMillis: 30_000,
  // 새 커넥션 생성 타임아웃 (5초): 빠르게 실패시켜서 사용자에게 피드백
  connectionTimeoutMillis: 5_000,
  // 단일 쿼리 최대 시간 (10초)
  statement_timeout: 10_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'PostgreSQL 연결 풀 에러');
});

// 서버 부팅 시 커넥션 1개 미리 확보 (cold start 지연 방지)
(async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    logger.info('DB 커넥션 풀 워밍업 완료');
  } catch (err) {
    logger.warn({ err }, 'DB 커넥션 풀 워밍업 실패');
  }
})();

export { pool };
