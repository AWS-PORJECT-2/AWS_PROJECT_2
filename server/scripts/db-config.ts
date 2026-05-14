import 'dotenv/config';
import fs from 'fs';
import type { ConnectionOptions } from 'mysql2/promise';

/**
 * 스크립트 공통 DB 접속 설정.
 * - 비밀번호 등 자격증명은 .env 의 환경변수에서만 가져온다 (하드코딩 금지).
 * - SSL 인증서가 존재하면 자동 적용.
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name}이(가) 설정되지 않았습니다 (server/.env 확인).`);
  return v;
}

function buildSsl() {
  const caPath = process.env.DB_SSL_CA;
  // 환경변수 미설정 → SSL 없이 연결 (개발 환경 등)
  if (!caPath) return undefined;

  // 경로가 명시됐는데 파일이 없으면 Fail-Closed — 조용히 비암호화 모드로 넘어가지 않음
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

/**
 * 포트는 누락 시 3306 기본값. 잘못된 값(NaN/0/음수)은 즉시 throw.
 */
function getPort(): number {
  const raw = process.env.DB_PORT;
  const n = Number(raw ?? 3306);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) {
    throw new Error(`환경변수 DB_PORT 값이 유효하지 않습니다: "${raw}"`);
  }
  return n;
}

/**
 * doothing 데이터베이스에 직접 연결하는 옵션.
 */
export function getDbConnectionOptions(): ConnectionOptions {
  return {
    host: requireEnv('DB_HOST'),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    port: getPort(),
    database: requireEnv('DB_NAME'),
    ssl: buildSsl(),
  };
}

/**
 * 데이터베이스 미지정 연결 (CREATE DATABASE 등 부트스트랩 용).
 */
export function getRootConnectionOptions(): ConnectionOptions {
  return {
    host: requireEnv('DB_HOST'),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    port: getPort(),
    ssl: buildSsl(),
  };
}
