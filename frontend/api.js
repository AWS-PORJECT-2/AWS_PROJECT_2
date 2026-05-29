/**
 * 공용 API 클라이언트 헬퍼.
 *
 * - 모든 페이지에서 동일한 fetch 래퍼 사용을 위해 전역 window.api 노출
 * - httpOnly 쿠키 인증을 위해 credentials: 'include' 고정
 * - 401 응답 시 자동으로 /auth/refresh 호출하여 토큰 갱신 시도.
 *   갱신 성공 시 원래 요청을 재시도, 실패 시 /login.html 로 리다이렉트.
 *   백그라운드 폴링 같은 경우엔 { silentAuthFail: true } 로 끄고 호출자가 처리.
 *
 * 사용:
 *   const data = await api.get('/funds');
 *   await api.post('/funds', { ... });
 *   const noti = await api.get('/notifications', { silentAuthFail: true });
 */
(function () {
  // 백엔드 API 베이스 — 프론트(3000)와 백엔드(8000) 분리 운영 대응.
  // 동일 origin 인 경우 자동으로 같은 호스트 사용.
  const API_BASE = (function () {
    const host = window.location.hostname;
    const port = window.location.port;
    // 프론트가 별도 포트로 떠있으면 같은 호스트의 :8000 으로 API 호출
    if (port === '3000' || port === '5173' || port === '4321') {
      return window.location.protocol + '//' + host + ':8000/api';
    }
    return window.location.origin + '/api';
  })();
  window.API_BASE_URL = API_BASE;

  // 401 시 토큰 자동 갱신 후 원요청 재시도 (동시 401 은 큐로 모아 한 번만 refresh)
  let isRefreshing = false;
  let refreshQueue = [];

  function processQueue(success) {
    refreshQueue.forEach(function(item) {
      item.resolve(success);
    });
    refreshQueue = [];
  }

  async function tryRefresh() {
    if (isRefreshing) {
      return new Promise(function(resolve, reject) {
        refreshQueue.push({ resolve: resolve, reject: reject });
      });
    }
    isRefreshing = true;
    try {
      var res = await fetch(API_BASE + '/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        processQueue(true);
        return true;
      }
      processQueue(false);
      return false;
    } catch (e) {
      processQueue(false);
      return false;
    } finally {
      isRefreshing = false;
    }
  }

  async function request(path, options) {
    options = options || {};
    var init = {
      credentials: 'include',
      method: options.method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);

    var res = await fetch(API_BASE + path, init);

    if (res.status === 401 && !options._isRetry) {
      // refresh 엔드포인트 자체가 401이면 재시도 안 함
      if (path === '/auth/refresh') {
        if (options.silentAuthFail) {
          var err = new Error('NOT_AUTHENTICATED');
          err.code = 'NOT_AUTHENTICATED';
          err.status = 401;
          throw err;
        }
        window.location.href = '/login.html';
        throw new Error('NOT_AUTHENTICATED');
      }

      // 토큰 갱신 시도
      var refreshed = await tryRefresh();
      if (refreshed) {
        // 갱신 성공 → 원래 요청 재시도
        options._isRetry = true;
        return request(path, options);
      }

      // 갱신 실패
      if (options.silentAuthFail) {
        var err2 = new Error('NOT_AUTHENTICATED');
        err2.code = 'NOT_AUTHENTICATED';
        err2.status = 401;
        throw err2;
      }
      window.location.href = '/login.html';
      throw new Error('NOT_AUTHENTICATED');
    }

    if (res.status === 401) {
      // 재시도 후에도 401이면 로그인 페이지로
      if (options.silentAuthFail) {
        var err3 = new Error('NOT_AUTHENTICATED');
        err3.code = 'NOT_AUTHENTICATED';
        err3.status = 401;
        throw err3;
      }
      window.location.href = '/login.html';
      throw new Error('NOT_AUTHENTICATED');
    }

    var text = await res.text();
    var data = text ? safeJson(text) : null;

    if (!res.ok) {
      var err4 = new Error((data && data.message) || res.statusText);
      err4.code = data && data.error;
      err4.status = res.status;
      err4.data = data;
      throw err4;
    }
    return data;
  }

  function safeJson(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  /**
   * HTML 특수문자를 escape 한다. innerHTML 에 사용자 데이터를 보간할 때 반드시 사용.
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
    get: function(path, opts) { return request(path, opts); },
    post: function(path, body, opts) { return request(path, Object.assign({ method: 'POST', body: body }, opts || {})); },
    patch: function(path, body, opts) { return request(path, Object.assign({ method: 'PATCH', body: body }, opts || {})); },
    del: function(path, body, opts) { return request(path, Object.assign({ method: 'DELETE', body: body }, opts || {})); },
    escapeHTML: escapeHTML,
  };
  window.escapeHTML = escapeHTML;
})();
