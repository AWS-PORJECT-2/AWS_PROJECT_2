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

function getEncryptionKey(): Buffer {
  const keyHex = process.env.PAYMENT_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'PAYMENT_ENCRYPTION_KEY 환경변수가 설정되지 않았거나 길이가 올바르지 않습니다 (32바이트 hex = 64자 필요)',
    );
  }
  return Buffer.from(keyHex, 'hex');
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
    throw new Error('암호화된 빌링키 형식이 올바르지 않습니다');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encrypted = Buffer.from(parts[2], 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
