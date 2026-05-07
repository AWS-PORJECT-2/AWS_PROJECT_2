/**
 * 공용 API 클라이언트 헬퍼.
 *
 * - 모든 페이지에서 동일한 fetch 래퍼 사용을 위해 전역 window.api 노출
 * - httpOnly 쿠키 인증을 위해 credentials: 'include' 고정
 * - 401 응답 시 기본적으로 /login.html 로 리다이렉트.
 *   백그라운드 폴링 같은 경우엔 { silentAuthFail: true } 로 끄고 호출자가 처리.
 *
 * 사용:
 *   const data = await api.get('/funds');
 *   await api.post('/funds', { ... });
 *   const noti = await api.get('/notifications', { silentAuthFail: true });
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
      // silentAuthFail: 폴링·미리 채우기 같은 백그라운드 호출에서 화면 튕김을 막고
      // 호출자가 직접 401 을 처리하게 한다. 명시적 사용자 액션은 기본 동작(redirect)을 유지.
      if (options.silentAuthFail) {
        const err = new Error('NOT_AUTHENTICATED');
        err.code = 'NOT_AUTHENTICATED';
        err.status = 401;
        throw err;
      }
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

  /**
   * HTML 특수문자를 escape 한다. innerHTML 에 사용자 데이터를 보간할 때 반드시 사용.
   * 사용자 입력 또는 외부 API 데이터를 ${...} 형태로 템플릿 리터럴에 그대로 넣으면
   * `<img onerror=...>` 같은 페이로드가 실행될 수 있다. 항상 escapeHTML 을 거쳐야 한다.
   */
  function escapeHTML(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.api = {
    get: (path, opts) => request(path, opts),
    post: (path, body, opts) => request(path, Object.assign({ method: 'POST', body: body }, opts || {})),
    patch: (path, body, opts) => request(path, Object.assign({ method: 'PATCH', body: body }, opts || {})),
    del: (path, body, opts) => request(path, Object.assign({ method: 'DELETE', body: body }, opts || {})),
    escapeHTML: escapeHTML,
  };
  window.escapeHTML = escapeHTML; // 전역 단축 — innerHTML 보간 시 ${escapeHTML(x)}
})();
