/**
 * 통합 API 테스트.
 * 로그인 → 배송지 등록 → 주문 → 입금자명 보고 → 관리자 승인 흐름 검증.
 * (사진 업로드 없음)
 */

const BASE = 'http://localhost:3000';

let cookieHeader = '';

async function call(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(BASE + path, { ...options, headers });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    cookieHeader = setCookie.split(';')[0];
  }

  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch (_) { /* keep text */ }
  return { status: res.status, body };
}

async function main() {
  console.log('1. test_user 로그인');
  const login = await call('/api/dev-auth/login', {
    method: 'POST', body: JSON.stringify({ username: 'test_user' }),
  });
  console.log('  → status:', login.status);
  if (login.status !== 200) throw new Error('로그인 실패');

  console.log('\n2. 배송지 등록');
  const addr = await call('/api/shipping-addresses', {
    method: 'POST',
    body: JSON.stringify({
      label: '집',
      recipientName: '홍길동',
      recipientPhone: '010-1234-5678',
      postalCode: '12345',
      roadAddress: '서울 성북구 정릉로 77',
      detailAddress: '국민대학교 학생회관',
    }),
  });
  console.log('  → status:', addr.status);
  const addressId = (addr.body as { id: number }).id;

  console.log('\n3. 주문 생성');
  const order = await call('/api/payment-orders', {
    method: 'POST',
    body: JSON.stringify({
      shippingAddressId: addressId,
      items: [{ productName: '국민대 과잠 (M)', size: 'M', quantity: 1, price: 1 }],
    }),
  });
  console.log('  → status:', order.status, 'orderId:', (order.body as { orderId: number }).orderId);
  const orderId = (order.body as { orderId: number }).orderId;

  console.log('\n4. 입금자명 보고 (사진 X)');
  const report = await call('/api/payment-orders/' + orderId + '/report', {
    method: 'POST',
    body: JSON.stringify({ depositorName: '홍길동' }),
  });
  console.log('  → status:', report.status, 'body:', report.body);
  if (report.status !== 200) throw new Error('입금 보고 실패');

  console.log('\n5. 주문 상세 (입금자명 확인)');
  const detail = await call('/api/payment-orders/' + orderId, { method: 'GET' });
  const d = detail.body as { status: string; proof: { depositorName: string; isConfirmed: boolean } | null };
  console.log('  → status:', detail.status);
  console.log('  → 주문상태:', d.status);
  console.log('  → 입금자명:', d.proof?.depositorName);

  console.log('\n6. admin 로그인');
  cookieHeader = '';
  const adminLogin = await call('/api/dev-auth/login', {
    method: 'POST', body: JSON.stringify({ username: 'admin' }),
  });
  console.log('  → role:', (adminLogin.body as { role?: string }).role);

  console.log('\n7. 관리자 - 승인 대기 목록');
  const pending = await call('/api/admin/payment-orders/pending', { method: 'GET' });
  console.log('  → status:', pending.status, 'count:', Array.isArray(pending.body) ? pending.body.length : 'not-array');

  console.log('\n8. 승인 처리');
  const confirm = await call('/api/admin/payment-orders/' + orderId + '/confirm', {
    method: 'PATCH', body: JSON.stringify({ memo: '입금자명/총액 일치 확인' }),
  });
  console.log('  → status:', confirm.status, 'body:', confirm.body);
  if (confirm.status !== 200) throw new Error('승인 실패');

  console.log('\n9. 승인 후 상세 (PAID 상태 확인)');
  cookieHeader = '';
  await call('/api/dev-auth/login', { method: 'POST', body: JSON.stringify({ username: 'test_user' }) });
  const final = await call('/api/payment-orders/' + orderId, { method: 'GET' });
  const f = final.body as { status: string; proof: { isConfirmed: boolean } | null; confirmation: unknown };
  console.log('  → 주문상태:', f.status);
  console.log('  → 확인증 confirmed:', f.proof?.isConfirmed);
  console.log('  → 확인 이력:', f.confirmation ? '있음' : '없음');

  if (f.status !== 'PAID') throw new Error('상태가 PAID로 바뀌지 않음');

  console.log('\n✅ 전체 흐름 정상 (사진 업로드 없이 입금자명만으로 처리)');
}

main().catch((err) => {
  console.error('❌ 테스트 실패:', err);
  process.exit(1);
});
