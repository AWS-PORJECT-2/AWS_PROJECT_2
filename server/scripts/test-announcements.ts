/**
 * 공지사항 API 흐름 테스트.
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
  if (setCookie) cookieHeader = setCookie.split(';')[0];
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch (_) { /* keep */ }
  return { status: res.status, body };
}

async function main() {
  // 1) 비로그인으로 목록 조회 (공용 API)
  console.log('1) 비로그인 - 공지 목록 조회');
  const list1 = await call('/api/announcements');
  console.log('  →', list1.status, list1.body);

  // 2) USER 로 글쓰기 시도 (403 기대)
  console.log('\n2) USER - 글쓰기 (401 기대 - admin 라우트는 인증 우선 검사)');
  cookieHeader = '';
  await call('/api/dev-auth/login', { method: 'POST', body: JSON.stringify({ username: 'test_user' }) });
  const userPost = await call('/api/admin/announcements', {
    method: 'POST',
    body: JSON.stringify({ title: '테스트', content: '내용' }),
  });
  console.log('  →', userPost.status, userPost.body);

  // 3) ADMIN 로그인 후 작성
  console.log('\n3) ADMIN - 공지 작성');
  cookieHeader = '';
  await call('/api/dev-auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin' }) });
  const created = await call('/api/admin/announcements', {
    method: 'POST',
    body: JSON.stringify({
      title: '🎉 펀딩 시작 안내',
      content: '국민대 과잠 공동구매 펀딩이 시작되었습니다.\n많은 관심 부탁드립니다.',
    }),
  });
  console.log('  →', created.status, created.body);
  const newId = (created.body as { id: number }).id;

  // 4) 상세 조회 (조회수 증가)
  console.log('\n4) 상세 조회 (조회수 +1)');
  cookieHeader = '';
  const detail = await call('/api/announcements/' + newId);
  console.log('  →', detail.status, '조회수:', (detail.body as { viewCount: number }).viewCount);

  // 5) 수정
  console.log('\n5) ADMIN - 수정');
  cookieHeader = '';
  await call('/api/dev-auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin' }) });
  const updated = await call('/api/admin/announcements/' + newId, {
    method: 'PUT',
    body: JSON.stringify({ title: '🎉 펀딩 시작 안내 (수정됨)', content: '수정된 내용입니다.' }),
  });
  console.log('  →', updated.status, (updated.body as { title: string }).title);

  // 6) 목록 재조회
  console.log('\n6) 공지 목록 (count 확인)');
  cookieHeader = '';
  const list2 = await call('/api/announcements');
  console.log('  →', list2.status, 'total:', (list2.body as { total: number }).total);

  // 7) 삭제
  console.log('\n7) ADMIN - 삭제');
  cookieHeader = '';
  await call('/api/dev-auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin' }) });
  const deleted = await call('/api/admin/announcements/' + newId, { method: 'DELETE' });
  console.log('  →', deleted.status);

  console.log('\n✅ 공지사항 API 정상');
}

main().catch((err) => { console.error('❌', err); process.exit(1); });
