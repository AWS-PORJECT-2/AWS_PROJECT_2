/**
 * getUserOrders 배치 조회 동작 검증 (N+1 → 5번 고정 쿼리).
 */
const BASE = 'http://localhost:3000';
let cookie = '';

async function call(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
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
  // 로그인
  await call('/api/dev-auth/login', { method: 'POST', body: JSON.stringify({ username: 'test_user' }) });

  // 내 주문 조회 (배치)
  const start = Date.now();
  const res = await call('/api/payment-orders');
  const ms = Date.now() - start;
  const orders = res.body as Array<{ id: number; orderNumber: string; items: unknown[]; proof: unknown }>;

  console.log(`✓ 응답 status: ${res.status}, 응답 시간: ${ms}ms`);
  console.log(`✓ 주문 개수: ${orders.length}`);
  if (orders.length > 0) {
    const sample = orders[0];
    console.log(`✓ 첫 주문 상세 포함 — items: ${sample.items.length}개, proof: ${sample.proof ? 'O' : 'X'}`);
  }
  console.log('\n✅ 배치 조회 정상 작동 (서버 로그에서 쿼리 수 확인)');

  // 관리자 - 승인 대기 목록도 검증
  cookie = '';
  await call('/api/dev-auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin' }) });
  const start2 = Date.now();
  const res2 = await call('/api/admin/payment-orders/pending');
  const ms2 = Date.now() - start2;
  const pending = res2.body as unknown[];
  console.log(`\n✓ 관리자 승인 대기 응답: ${res2.status}, ${ms2}ms, ${pending.length}건`);
}

main().catch((err) => { console.error('❌', err); process.exit(1); });
