/**
 * 공용 API 클라이언트 헬퍼.
 *
 * - 모든 페이지에서 동일한 fetch 래퍼 사용을 위해 전역 window.api 노출
 * - httpOnly 쿠키 인증을 위해 credentials: 'include' 고정
 * - 401 응답 시 /login.html 로 자동 리다이렉트
 *
 * 사용:
 *   const data = await api.get('/funds');
 *   await api.post('/funds', { ... });
 */
(function () {
  const API_BASE = window.location.origin + '/api';

  async function request(path, options) {
    options = options || {};
    const init = {
      credentials: 'include',
      method: options.method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);

    const res = await fetch(API_BASE + path, init);

    if (res.status === 401) {
      window.location.href = '/login.html';
      throw new Error('NOT_AUTHENTICATED');
    }

    const text = await res.text();
    const data = text ? safeJson(text) : null;

    if (!res.ok) {
      const err = new Error((data && data.message) || res.statusText);
      err.code = data && data.error;
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function safeJson(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  window.api = {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: body }),
    patch: (path, body) => request(path, { method: 'PATCH', body: body }),
    del: (path, body) => request(path, { method: 'DELETE', body: body }),
  };
})();
