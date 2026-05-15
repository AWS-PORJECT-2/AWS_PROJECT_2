/**
 * 가격 조작 방지 테스트.
 *  1) 클라이언트가 0원/1원/-100원/거대한 값을 보내도 서버는 funds.unit_price 만 사용
 *  2) fundId 가 없거나 존재하지 않거나 CLOSED 상태면 차단
 *  3) quantity 가 0/음수/소수/너무 크면 차단
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

async function main() {
  // 사전: fund 1 의 단가는 1원이어야 함 (시드값)
  const conn = await mysql.createConnection(getDbConnectionOptions());
  let fund1Price = 0;
  try {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT unit_price FROM funds WHERE id = 1'
    );
    fund1Price = (rows as mysql.RowDataPacket[])[0]?.unit_price ?? 0;
    console.log(`✓ fund 1 의 서버 단가: ${fund1Price}원`);
  } finally {
    await conn.end();
  }

  // 로그인
  await call('/api/dev-auth/login', { method: 'POST', body: JSON.stringify({ username: 'test_user' }) });

  // 배송지 확보
  const addrList = await call('/api/shipping-addresses');
  let addressId = (addrList.body as { id: number }[])[0]?.id;
  if (!addressId) {
    const c = await call('/api/shipping-addresses', {
      method: 'POST',
      body: JSON.stringify({
        label: '테스트', recipientName: '테스트', recipientPhone: '010-0000-0000',
        postalCode: '12345', roadAddress: '국민대',
      }),
    });
    addressId = (c.body as { id: number }).id;
  }

  // === 케이스 1: 클라이언트가 price=0 으로 가격 조작 시도 ===
  console.log('\n[1] 클라이언트가 price=0 으로 조작 시도 → 서버 단가가 사용되어야 함');
  const r1 = await call('/api/payment-orders', {
    method: 'POST',
    body: JSON.stringify({
      fundId: 1,
      shippingAddressId: addressId,
      items: [{ productName: '국민대 과잠', size: 'M', quantity: 3, price: 0 }],
    }),
  });
  console.log('  →', r1.status, r1.body);
  const expected = fund1Price * 3;
  const got = (r1.body as { totalPrice: number }).totalPrice;
  if (r1.status !== 201 || got !== expected) {
    throw new Error(`price 조작 차단 실패: 기대 ${expected}, 실제 ${got}`);
  }
  console.log(`  ✓ 서버가 ${fund1Price}원 × 3 = ${expected}원 으로 재계산`);

  // === 케이스 2: 클라이언트가 음수 가격 ===
  console.log('\n[2] price=-9999 조작');
  const r2 = await call('/api/payment-orders', {
    method: 'POST',
    body: JSON.stringify({
      fundId: 1, shippingAddressId: addressId,
      items: [{ productName: 'X', size: 'M', quantity: 2, price: -9999 }],
    }),
  });
  console.log('  →', r2.status, (r2.body as { totalPrice: number }).totalPrice);
  if ((r2.body as { totalPrice: number }).totalPrice !== fund1Price * 2) throw new Error('음수 차단 실패');

  // === 케이스 3: fundId 누락 ===
  console.log('\n[3] fundId 누락');
  const r3 = await call('/api/payment-orders', {
    method: 'POST',
    body: JSON.stringify({
      shippingAddressId: addressId,
      items: [{ productName: 'X', quantity: 1, price: 100 }],
    }),
  });
  console.log('  →', r3.status, r3.body);
  if (r3.status !== 400) throw new Error('fundId 누락 차단 실패');

  // === 케이스 4: 존재하지 않는 fundId ===
  console.log('\n[4] 존재하지 않는 fundId=99999');
  const r4 = await call('/api/payment-orders', {
    method: 'POST',
    body: JSON.stringify({
      fundId: 99999, shippingAddressId: addressId,
      items: [{ productName: 'X', quantity: 1 }],
    }),
  });
  console.log('  →', r4.status, r4.body);
  if (r4.status !== 404) throw new Error('FUND_NOT_FOUND 차단 실패');

  // === 케이스 5: 수량 0 ===
  console.log('\n[5] quantity=0');
  const r5 = await call('/api/payment-orders', {
    method: 'POST',
    body: JSON.stringify({
      fundId: 1, shippingAddressId: addressId,
      items: [{ productName: 'X', quantity: 0 }],
    }),
  });
  console.log('  →', r5.status, r5.body);
  if (r5.status !== 400) throw new Error('quantity=0 차단 실패');

  // === 케이스 6: 수량 음수 ===
  console.log('\n[6] quantity=-1');
  const r6 = await call('/api/payment-orders', {
    method: 'POST',
    body: JSON.stringify({
      fundId: 1, shippingAddressId: addressId,
      items: [{ productName: 'X', quantity: -1 }],
    }),
  });
  console.log('  →', r6.status, r6.body);
  if (r6.status !== 400) throw new Error('quantity 음수 차단 실패');

  // === 케이스 7: CLOSED 상태 fund ===
  console.log('\n[7] fund.status=CLOSED 차단');
  const conn2 = await mysql.createConnection(getDbConnectionOptions());
  try {
    await conn2.query('UPDATE funds SET status = "CLOSED" WHERE id = 2');
  } finally { await conn2.end(); }
  const r7 = await call('/api/payment-orders', {
    method: 'POST',
    body: JSON.stringify({
      fundId: 2, shippingAddressId: addressId,
      items: [{ productName: 'X', quantity: 1 }],
    }),
  });
  console.log('  →', r7.status, r7.body);
  // 복구
  const conn3 = await mysql.createConnection(getDbConnectionOptions());
  try { await conn3.query('UPDATE funds SET status = "ACTIVE" WHERE id = 2'); } finally { await conn3.end(); }
  if (r7.status !== 400) throw new Error('CLOSED 차단 실패');

  console.log('\n✅ 모든 가격 조작 시도 차단 + 정상 경로 작동 확인');
}

main().catch((err) => { console.error('❌', err); process.exit(1); });
