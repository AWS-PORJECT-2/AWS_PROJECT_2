import fs from 'fs';
import mysql from 'mysql2/promise';
import { logger } from './logger.js';

/**
 * MySQL SSL 설정.
 *
 * AWS RDS MySQL은 SSL 필수.
 * - DB_SSL_CA가 지정되어 있으면 해당 인증서로 정식 검증 (권장).
 * - 그 외엔 검증 활성 상태로 SSL 사용.
 */
function buildSslConfig() {
  const caPath = process.env.DB_SSL_CA;
  // 환경변수 미설정 → SSL 없이 연결
  if (!caPath) return undefined;

  // 경로가 명시됐는데 파일이 없으면 Fail-Closed
  if (!fs.existsSync(caPath)) {
    throw new Error(
      `[DB SSL] DB_SSL_CA 경로에 파일이 존재하지 않습니다: "${caPath}"\n` +
      `  - 경로 오타 또는 파일 누락을 확인해주세요.\n` +
      `  - SSL 없이 연결하려면 DB_SSL_CA 환경변수를 제거하세요.`
    );
  }

  return {
    ca: fs.readFileSync(caPath, 'utf8'),
    rejectUnauthorized: true,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}이(가) 설정되지 않았습니다.`);
  }
  return value;
}

const IS_INMEMORY = process.env.USE_INMEMORY === 'true' && process.env.NODE_ENV !== 'production';

let pool: mysql.Pool;

if (IS_INMEMORY) {
  // InMemory 모드 — 더미 Pool (실제 연결 안 함)
  pool = null as unknown as mysql.Pool;
  logger.info('InMemory 모드 — MySQL 연결 비활성화');
} else {
  const dbConfig: mysql.PoolOptions = {
    host: requireEnv('DB_HOST'),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    port: parseInt(requireEnv('DB_PORT'), 10),
    database: requireEnv('DB_NAME'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 20000, // 20초 타임아웃
  };

  const sslConfig = buildSslConfig();
  if (sslConfig) {
    dbConfig.ssl = sslConfig;
  }

  pool = mysql.createPool(dbConfig);

  // 연결 테스트
  pool.getConnection()
    .then((connection) => {
      logger.info({
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        ssl: !!sslConfig,
      }, 'MySQL 연결 성공');
      connection.release();
    })
    .catch((err) => {
      logger.error({ err, host: dbConfig.host, port: dbConfig.port }, 'MySQL 연결 실패');
      process.exit(1);
    });
}

export { pool };
