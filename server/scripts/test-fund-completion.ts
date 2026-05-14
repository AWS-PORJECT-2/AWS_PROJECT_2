/**
 * 펀딩 100% 달성 알림 시스템 테스트.
 *
 * 시나리오:
 *  1) funds.id=4 (에코백) 의 target_amount 를 2 로 줄이고 current_amount=0, is_notified=false 로 리셋
 *  2) test_user 로 fund 4 주문 2건 생성 → 입금 보고
 *  3) admin 으로 두 주문 승인
 *     - 첫 번째 승인: current 1 → notified=false 유지
 *     - 두 번째 승인: current 2 → 100% 달성 → 알림 발송 + is_notified=true
 *  4) MAIL_DRY_RUN 이 true 면 서버 로그에 "[DRY_RUN] 메일 발송" 이 떠야 함
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';

const BASE = 'http://localhost:3000';

async function call(path: string, options: RequestInit = {}, cookie = '') {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (cookie) headers['Cookie'] = cookie;
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(BASE + path, { ...options, headers });
  const setCookie = res.headers.get('set-cookie');
  const newCookie = setCookie ? setCookie.split(';')[0] : cookie;
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch (_) { /* keep */ }
  return { status: res.status, body, cookie: newCookie };
}

async function main() {
  // DB 정리: fund 4 리셋
  const sslConfig = fs.existsSync('./global-bundle.pem')
    ? { ca: fs.readFileSync('./global-bundle.pem', 'utf8'), rejectUnauthorized: true }
    : undefined;
  const conn = await mysql.createConnection({
    host: 'doothing-db.cj24wem202yj.us-east-1.rds.amazonaws.com',
    user: 'admin', password: 'fkdldjs22', port: 3306,
    database: 'doothing', ssl: sslConfig,
  });
  try {
    await conn.query('DELETE FROM orders WHERE fund_id = 4');
    await conn.query(
      'UPDATE funds SET target_amount = 2, current_amount = 0, is_notified = FALSE, notified_at = NULL WHERE id = 4'
    );
    console.log('✓ funds.id=4 리셋 (target=2, current=0)');
  } finally {
    await conn.end();
  }

  // 1) USER 로그인 + 배송지 확인
  console.log('\n1) USER 로그인');
  const userLogin = await call('/api/dev-auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'test_user' }),
  });
  let userCookie = userLogin.cookie;
  console.log('  →', userLogin.status, (userLogin.body as { name: string }).name);

  // 배송지 가져오기
  const addrList = await call('/api/shipping-addresses', { method: 'GET' }, userCookie);
  const addrs = addrList.body as { id: number }[];
  if (!Array.isArray(addrs) || addrs.length === 0) {
    // 배송지 생성
    const created = await call('/api/shipping-addresses', {
      method: 'POST',
      body: JSON.stringify({
        label: '테스트', recipientName: '테스트', recipientPhone: '010-0000-0000',
        postalCode: '12345', roadAddress: '국민대학교',
      }),
    }, userCookie);
    addrs.push((created.body as { id: number }));
  }
  const addressId = addrs[0].id;

  // 2) 주문 2건 생성
  const orderIds: number[] = [];
  for (let i = 1; i <= 2; i++) {
    const o = await call('/api/payment-orders', {
      method: 'POST',
      body: JSON.stringify({
        fundId: 4,
        shippingAddressId: addressId,
        items: [{ productName: '국민대학교 미니멀 에코백', size: 'Free', quantity: 1, price: 1 }],
      }),
    }, userCookie);
    const oid = (o.body as { orderId: number }).orderId;
    orderIds.push(oid);

    // 입금 보고
    await call('/api/payment-orders/' + oid + '/report', {
      method: 'POST',
      body: JSON.stringify({ depositorName: '테스트 ' + i }),
    }, userCookie);
    console.log(`  ✓ 주문 #${i} 생성 + 입금 보고: orderId=${oid}`);
  }

  // 3) ADMIN 로그인
  console.log('\n2) ADMIN 로그인');
  const adminLogin = await call('/api/dev-auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin' }),
  });
  let adminCookie = adminLogin.cookie;

  // 4) 첫 번째 승인 (50%)
  console.log('\n3) 첫 번째 주문 승인 — current 1/2 (알림 미발송)');
  const c1 = await call('/api/admin/payment-orders/' + orderIds[0] + '/confirm', {
    method: 'PATCH', body: JSON.stringify({ memo: '승인1' }),
  }, adminCookie);
  console.log('  →', c1.status);

  // 5) 두 번째 승인 (100% 트리거)
  console.log('\n4) 두 번째 주문 승인 — current 2/2 (100% 달성 → 알림 발송)');
  const c2 = await call('/api/admin/payment-orders/' + orderIds[1] + '/confirm', {
    method: 'PATCH', body: JSON.stringify({ memo: '승인2' }),
  }, adminCookie);
  console.log('  →', c2.status);

  // 6) 알림 발송 비동기 - 잠시 대기
  await new Promise((r) => setTimeout(r, 1500));

  // DB 검증
  const conn2 = await mysql.createConnection({
    host: 'doothing-db.cj24wem202yj.us-east-1.rds.amazonaws.com',
    user: 'admin', password: 'fkdldjs22', port: 3306,
    database: 'doothing', ssl: sslConfig,
  });
  try {
    const [rows] = await conn2.query<mysql.RowDataPacket[]>(
      'SELECT id, current_amount, target_amount, is_notified, notified_at FROM funds WHERE id = 4'
    );
    const f = (rows as mysql.RowDataPacket[])[0];
    console.log('\n5) DB 상태:');
    console.log('   funds.id=4:', f);

    if (f.current_amount === 2 && f.is_notified === 1) {
      console.log('\n✅ 100% 달성 트리거 정상 동작 (서버 로그에서 [DRY_RUN] 메일 발송 확인 가능)');
    } else {
      console.log('\n❌ 트리거 실패');
      process.exit(1);
    }
  } finally {
    await conn2.end();
  }

  process.exit(0);
}

main().catch((err) => { console.error('❌', err); process.exit(1); });
