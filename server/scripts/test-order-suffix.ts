/** 새 CSPRNG 주문번호 포맷 검증 */
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
  await call('/api/dev-auth/login', { method: 'POST', body: JSON.stringify({ username: 'test_user' }) });
  const addrList = await call('/api/shipping-addresses');
  const addressId = (addrList.body as { id: number }[])[0].id;

  console.log('주문 3건 생성 — 새 주문번호 형식 확인');
  for (let i = 0; i < 3; i++) {
    const r = await call('/api/payment-orders', {
      method: 'POST',
      body: JSON.stringify({
        fundId: 1, shippingAddressId: addressId,
        items: [{ productName: '테스트', size: 'M', quantity: 1 }],
      }),
    });
    const num = (r.body as { orderNumber: string }).orderNumber;
    console.log('  →', num);
    // 형식 검증: ORD-YYYYMMDD-XXXXXXXXXX (10자리 base36 대문자)
    if (!/^ORD-\d{8}-[0-9A-Z]{10}$/.test(num)) {
      throw new Error(`예상 형식 불일치: ${num}`);
    }
  }
  console.log('\n✅ CSPRNG 기반 10자리 Base36 주문번호 정상');
}
main().catch((e) => { console.error('❌', e); process.exit(1); });
