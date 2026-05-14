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
  if (caPath && fs.existsSync(caPath)) {
    return { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
  }
  return undefined;
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
