import crypto from 'node:crypto';

/**
 * AES-256-GCM 기반 빌링키 암/복호화 유틸리티.
 *
 * 저장 형식: base64(iv):base64(authTag):base64(ciphertext)
 * 암호화 키: 환경변수 PAYMENT_ENCRYPTION_KEY (32바이트 hex = 64자)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 권장 IV 길이
const AUTH_TAG_LENGTH = 16;

// lazy 캐시 — 첫 호출 시 파싱·검증 후 모듈 메모리에 보관.
// 모듈 로드 시 throw 하면 결제 안 쓰는 dev (InMemory) 모드까지 깨지므로 lazy 가 안전.
let cachedKey: Buffer | undefined;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const keyHex = process.env.PAYMENT_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
      'PAYMENT_ENCRYPTION_KEY 환경변수가 설정되지 않았거나 형식이 올바르지 않습니다 (32바이트 hex = 64자 hex 문자 필요)',
    );
  }
  const buf = Buffer.from(keyHex, 'hex');
  if (buf.length !== 32) {
    throw new Error('PAYMENT_ENCRYPTION_KEY 디코딩 결과가 32바이트가 아닙니다');
  }
  cachedKey = buf;
  return cachedKey;
}

/**
 * 빌링키를 AES-256-GCM으로 암호화.
 * @returns "base64(iv):base64(authTag):base64(ciphertext)" 형식 문자열
 */
export function encryptBillingKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * 암호화된 빌링키를 복호화.
 * @param ciphertext "base64(iv):base64(authTag):base64(encrypted)" 형식
 * @returns 원본 빌링키 문자열
 */
export function decryptBillingKey(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error(
      `암호화된 빌링키 형식이 올바르지 않습니다. 예상: base64(iv):base64(authTag):base64(ciphertext) (3 segments), 실제: ${parts.length} segments`,
    );
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encrypted = Buffer.from(parts[2], 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
