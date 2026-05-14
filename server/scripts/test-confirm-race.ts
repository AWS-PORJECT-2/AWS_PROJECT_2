/**
 * confirmPayment 동시성 테스트.
 *
 * 시나리오:
 *   1) fund 4 를 target=10, current=0 으로 리셋
 *   2) test_user 가 fund 4 주문 생성 + 입금 보고 (1건)
 *   3) admin 으로 동시에 N번 confirm API 호출 (Promise.all)
 *   4) 정확히 1건만 200, 나머지는 400 INVALID_ORDER_STATUS 여야 함
 *   5) DB 의 funds.current_amount 가 정확히 +1 이어야 함 (이중 합산 X)
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { getDbConnectionOptions } from './db-config.js';

const BASE = 'http://localhost:3000';

async function call(path: string, options: RequestInit = {}, cookie = '') {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  if (cookie) headers['Cookie'] = cookie;
  if (options.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { ...options, headers });
  const setCookie = res.headers.get('set-cookie');
  const newCookie = setCookie ? setCookie.split(';')[0] : cookie;
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch (_) { /* keep */ }
  return { status: res.status, body, cookie: newCookie };
}

async function main() {
  const dbOpts = getDbConnectionOptions();

  // 1) fund 4 리셋
  const conn = await mysql.createConnection(dbOpts);
  try {
    await conn.query('DELETE FROM orders WHERE fund_id = 4');
    await conn.query(
      'UPDATE funds SET target_amount = 10, current_amount = 0, is_notified = FALSE, notified_at = NULL WHERE id = 4'
    );
    console.log('✓ fund 4 리셋 (target=10, current=0)');
  } finally { await conn.end(); }

  // 2) test_user 주문 + 입금보고
  const userLogin = await call('/api/dev-auth/login', { method: 'POST', body: JSON.stringify({ username: 'test_user' }) });
  const userCookie = userLogin.cookie;

  // 배송지
  const addrList = await call('/api/shipping-addresses', {}, userCookie);
  let addressId = (addrList.body as { id: number }[])[0]?.id;
  if (!addressId) {
    const c = await call('/api/shipping-addresses', {
      method: 'POST',
      body: JSON.stringify({
        label: '테스트', recipientName: '테스트', recipientPhone: '010-0',
        postalCode: '0', roadAddress: 'X',
      }),
    }, userCookie);
    addressId = (c.body as { id: number }).id;
  }

  const order = await call('/api/payment-orders', {
    method: 'POST',
    body: JSON.stringify({
      fundId: 4,
      shippingAddressId: addressId,
      items: [{ productName: '에코백', size: 'Free', quantity: 1 }],
    }),
  }, userCookie);
  const orderId = (order.body as { orderId: number }).orderId;
  await call('/api/payment-orders/' + orderId + '/report', {
    method: 'POST',
    body: JSON.stringify({ depositorName: '테스트' }),
  }, userCookie);
  console.log(`✓ 주문 생성 + 입금 보고: orderId=${orderId}`);

  // 3) admin 으로 동시 5회 승인 시도
  const adminLogin = await call('/api/dev-auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin' }) });
  const adminCookie = adminLogin.cookie;

  console.log('\n동시 승인 5회 시도...');
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      call('/api/admin/payment-orders/' + orderId + '/confirm', {
        method: 'PATCH', body: JSON.stringify({ memo: 'race' }),
      }, adminCookie)
    )
  );

  const successes = results.filter((r) => r.status === 200).length;
  const failures400 = results.filter((r) => r.status === 400);

  // 디버깅 로그 — 각 응답의 status + error code 출력
  results.forEach((r, i) => {
    const code = (r.body as { error?: string }).error ?? '(없음)';
    console.log(`    [${i}] status=${r.status} code=${code}`);
  });
  console.log(`  → 성공: ${successes}, 400 응답: ${failures400.length}`);

  // 엄격한 단언 1: 성공은 정확히 1건
  if (successes !== 1) throw new Error(`성공이 정확히 1건이어야 함 (실제: ${successes})`);

  // 엄격한 단언 2: 400 응답 중 INVALID_ORDER_STATUS 가 아닌 것이 있으면 즉시 실패
  const wrongErrors = failures400.filter(
    (r) => (r.body as { error?: string }).error !== 'INVALID_ORDER_STATUS'
  );
  if (wrongErrors.length > 0) {
    const codes = wrongErrors.map((r) => (r.body as { error?: string }).error).join(', ');
    throw new Error(
      `예상치 못한 에러 코드가 포함되어 있습니다: [${codes}]\n` +
      `동시성 방어가 아닌 다른 원인으로 실패한 요청이 있습니다.`
    );
  }

  // 엄격한 단언 3: INVALID_ORDER_STATUS 실패가 정확히 4건
  const raceFailures = failures400.length;
  if (raceFailures !== 4) throw new Error(`INVALID_ORDER_STATUS 실패가 4건이어야 함 (실제: ${raceFailures})`);

  console.log('  ✓ 실패 4건 모두 INVALID_ORDER_STATUS — 동시성 방어 로직이 정확히 작동');

  // 4) DB 확인 — current_amount 가 정확히 +1
  const conn2 = await mysql.createConnection(dbOpts);
  try {
    const [rows] = await conn2.query<mysql.RowDataPacket[]>(
      'SELECT current_amount FROM funds WHERE id = 4'
    );
    const cur = (rows as mysql.RowDataPacket[])[0]?.current_amount;
    console.log(`\n  → funds.id=4 current_amount: ${cur}`);
    if (cur !== 1) throw new Error(`current_amount 가 정확히 1이어야 함 (실제: ${cur}). 이중 합산 발생!`);
  } finally { await conn2.end(); }

  console.log('\n✅ TOCTOU 방어 정상 — 동시 5회 시도 중 1건만 성공, 펀딩 합산 한 번만 발생');
}

main().catch((err) => { console.error('❌', err); process.exit(1); });
