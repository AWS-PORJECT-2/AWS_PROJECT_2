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
  // 백엔드 API 베이스 — 단일 서버(프론트+API 동일 origin) 및 운영(CloudFront /api→EC2) 모두 same-origin.
  // 별도 백엔드 호스트가 필요하면 페이지에서 window.API_BASE_OVERRIDE 로 지정 가능.
  const API_BASE = window.API_BASE_OVERRIDE || (window.location.origin + '/api');
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

    // 응답 무한대기 방지 — 서버 stall/네트워크 끊김 시 UI 가 '처리 중…' 에서 영구 멈추는 것 차단.
    //  · /ai/* : 서버 AI_TIMEOUT(기본 60s) 동안 정상 대기 → 90s
    //  · 대용량 바디(커버/영상 data URL 업로드 등 >100KB) : 120s
    //  · 일반 요청 : 30s   (options.timeoutMs 로 개별 재정의 가능)
    var _big = init.body && init.body.length > 100000;
    // AI·대용량·일반 중 가장 긴 값 채택(AI+대용량 동시여도 120s 보장 — AI 90s 가 대용량 120s 를 가리지 않게).
    var timeoutMs = (typeof options.timeoutMs === 'number') ? options.timeoutMs
      : Math.max(path.indexOf('/ai/') === 0 ? 90000 : 0, _big ? 120000 : 0, 30000);
    var _ctrl = new AbortController();
    init.signal = _ctrl.signal;
    var _to = setTimeout(function () { _ctrl.abort(); }, timeoutMs);
    var res;
    try {
      res = await fetch(API_BASE + path, init);
    } catch (e) {
      if (e && e.name === 'AbortError') {
        var te = new Error('요청 시간이 초과되었습니다. 다시 시도해 주세요');
        te.code = 'TIMEOUT'; te.status = 0;
        throw te;
      }
      throw e;
    } finally {
      clearTimeout(_to);
    }

    if (res.status === 401 && !options._isRetry) {
      // refresh 엔드포인트 자체가 401이면 재시도 안 함
      if (path === '/auth/refresh') {
        if (options.silentAuthFail) {
          var err = new Error('NOT_AUTHENTICATED');
          err.code = 'NOT_AUTHENTICATED';
          err.status = 401;
          throw err;
        }
        redirectToLogin();
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
      redirectToLogin();
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
      redirectToLogin();
      throw new Error('NOT_AUTHENTICATED');
    }

    // 410 GONE — 토큰은 유효하나 계정이 삭제됨(회원탈퇴/관리자 삭제). 401과 동일하게 종결 처리(재로그인 유도).
    if (res.status === 410) {
      if (options.silentAuthFail) {
        var errGone = new Error('USER_NOT_FOUND');
        errGone.code = 'USER_NOT_FOUND';
        errGone.status = 410;
        throw errGone;
      }
      redirectToLogin();
      throw new Error('USER_NOT_FOUND');
    }

    var text = await res.text();
    var data = text ? safeJson(text) : null;

    if (!res.ok) {
      var err4 = new Error((data && data.message) || res.statusText);
      err4.code = data && (data.code || data.error);
      err4.status = res.status;
      err4.data = data;
      // 서버가 약관·개인정보 미동의로 차단(동의 팝업 우회 시) → 동의 게이트를 강제로 띄워 동의 유도.
      if (err4.code === 'CONSENT_REQUIRED') {
        try { if (window.WZConsent && typeof window.WZConsent.ensure === 'function') window.WZConsent.ensure(); } catch (_) {}
      }
      throw err4;
    }
    return data;
  }

  function safeJson(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  // 미로그인/세션만료 시 에러 토스트 대신 로그인 페이지로 바로 보낸다.
  // 돌아올 경로를 ?return= 으로 넘겨 로그인 후 복귀를 돕는다(login.html 이 sessionStorage 에 보관).
  function redirectToLogin() {
    var ret = window.location.pathname + window.location.search;
    window.location.href = '/login.html?return=' + encodeURIComponent(ret);
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
