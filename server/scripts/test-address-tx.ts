/**
 * 배송지 CRUD + 트랜잭션 회귀 검증.
 *  - create 시 isDefault=true 두 번 → 정확히 한 개만 default
 *  - 기본 배송지 삭제 → 다른 주소 자동 승격 (단일 트랜잭션 보장)
 *  - 마지막 1개는 삭제 차단
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { getDbConnectionOptions } from './db-config.js';

const BASE = 'http://localhost:3000';
let cookie = '';

async function call(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  if (cookie) headers['Cookie'] = cookie;
  if (options.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { ...options, headers });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch (_) { /* keep */ }
  return { status: res.status, body };
}

async function getDefaultCount(userId: number): Promise<number> {
  const conn = await mysql.createConnection(getDbConnectionOptions());
  try {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM shipping_addresses WHERE user_id = ? AND is_default = TRUE',
      [userId]
    );
    return Number((rows as mysql.RowDataPacket[])[0].cnt);
  } finally { await conn.end(); }
}

async function main() {
  // test_user 로그인
  await call('/api/dev-auth/login', { method: 'POST', body: JSON.stringify({ username: 'test_user' }) });
  const userId = 1; // seed test_user

  // 1) 기본 isDefault=true 로 두 번 생성 → default 항상 1개
  console.log('\n[1] isDefault=true 로 추가 주소 2개 생성 → default 정확히 1개여야 함');
  const a = await call('/api/shipping-addresses', {
    method: 'POST',
    body: JSON.stringify({
      label: 'TX-A', recipientName: 'A', recipientPhone: '010', postalCode: '0',
      roadAddress: 'A', isDefault: true,
    }),
  });
  console.log('  A 생성:', a.status, (a.body as { isDefault: boolean }).isDefault);
  const b = await call('/api/shipping-addresses', {
    method: 'POST',
    body: JSON.stringify({
      label: 'TX-B', recipientName: 'B', recipientPhone: '010', postalCode: '0',
      roadAddress: 'B', isDefault: true,
    }),
  });
  console.log('  B 생성:', b.status, (b.body as { isDefault: boolean }).isDefault);

  let defaultCount = await getDefaultCount(userId);
  console.log(`  → default 개수: ${defaultCount}`);
  if (defaultCount !== 1) throw new Error(`default 가 1개여야 하는데 ${defaultCount}개`);

  // 2) 기본 배송지(B) 삭제 → A 가 자동 default 로 승격
  console.log('\n[2] 기본(B) 삭제 → 다른 주소 자동 승격');
  const bId = (b.body as { id: number }).id;
  const aId = (a.body as { id: number }).id;
  const del = await call('/api/shipping-addresses/' + bId, { method: 'DELETE' });
  console.log('  삭제 응답:', del.status);

  defaultCount = await getDefaultCount(userId);
  console.log(`  → default 개수: ${defaultCount}`);
  if (defaultCount !== 1) throw new Error(`삭제 후 default 1개 보장 실패: ${defaultCount}`);

  // 3) 마지막 1개 시나리오 — 다른 주소들 정리
  console.log('\n[3] 정리 후 마지막 1개 삭제 차단');
  // test_user 의 다른 모든 주소 삭제 (단, A 빼고)
  const list = await call('/api/shipping-addresses');
  const others = (list.body as { id: number }[]).filter((x) => x.id !== aId);
  for (const o of others) {
    await call('/api/shipping-addresses/' + o.id, { method: 'DELETE' });
  }

  // 마지막 1개(A) 삭제 시도 → 400
  const lastDel = await call('/api/shipping-addresses/' + aId, { method: 'DELETE' });
  console.log('  마지막 삭제 시도:', lastDel.status, lastDel.body);
  if (lastDel.status !== 400) throw new Error('마지막 1개 차단 실패');

  console.log('\n✅ 트랜잭션 전파 정상 작동 — 모든 케이스 통과');
}

main().catch((err) => { console.error('❌', err); process.exit(1); });
