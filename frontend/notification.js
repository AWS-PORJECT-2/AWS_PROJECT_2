/* =====================================================================
 * 두띵 — 알림 센터 (전역, 모든 페이지 공통)
 *
 * - 헤더 종(bell) 아이콘 클릭 → 우측 슬라이드 패널(wz 톤) 열림
 * - 데이터 출처: 서버 알림 API.
 *     · GET  /api/me/notifications?limit=50  → { items:[...], unreadCount }
 *     · POST /api/me/notifications/:id/read   → 단건 읽음(멱등)
 *     · POST /api/me/notifications/read-all    → 전체 읽음
 *   모두 authRequired. 미로그인이면 빈 목록·배지 0(silentAuthFail 로 흡수).
 * - 각 알림: 제목 + 본문 + 상대시각. fundId 가 있으면 "펀딩 보러가기" 버튼.
 *   항목/버튼 클릭 시 POST :id/read 후 detail.html?id=fundId 로 이동.
 * - 미읽음(isRead=false): 연보라 배경 + 좌측 점 + 굵게. 읽음은 일반 표시.
 *   패널을 여는 것만으로 일괄 읽음 처리하지 않음(항목 클릭 또는 "모두 읽음" 버튼).
 * - 미확인 배지: #wz-bell(없으면 aria-label="알림" 아이콘)에 서버 unreadCount.
 *   1~99 숫자, 99 초과 "99+", 0 이면 숨김. 60초 주기 + 패널 열 때 갱신.
 *
 * 규칙: Vanilla JS, 전역 window.WZ / window.api 재사용. 이모지 금지(SVG 만).
 *       색은 tokens.css 변수(보라 --c-primary-*). 다크모드 반응형 없음.
 *       사용자/외부 데이터는 textContent 로만 삽입(XSS 안전).
 * ===================================================================== */
(function () {
  var W = window.WZ || {};
  var STYLE_ID = 'wz-notif-style';
  var POLL_MS = 60000;

  /* ===== 알림 type 별 아이콘/CTA 문구 (이모지 금지 — 인라인 SVG path 데이터) =====
   * 미지원 type 은 DEFAULT_ICON(종) 으로 폴백 — 신규/미래 타입도 자연스럽게 표시. */
  var DEFAULT_ICON = ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'];
  var TYPE_ICONS = {
    // 신고 접수(메이커/게시글 신고가 들어옴) — 깃발
    report_received: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
    // 문의 답변 — 말풍선
    inquiry_reply: ['M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z'],
    // 내 프로젝트에 댓글 — 말풍선(선)
    project_comment: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    // 내 댓글에 답글 — 답글 화살표
    comment_reply: ['M9 17l-5-5 5-5', 'M4 12h11a5 5 0 0 1 5 5v2'],
  };
  // CTA 라벨(이동 가능한 타입만) — fundId/link 가 있을 때 표시.
  var TYPE_CTA = {
    project_comment: '댓글 보러가기',
    comment_reply: '답글 보러가기',
    inquiry_reply: '문의 보러가기',
  };

  /* ===== 상대시간 (방금 / N분 전 / N시간 전 / N일 전 / YYYY.MM.DD) ===== */
  function relTime(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var diff = Date.now() - t;
    if (diff < 0) diff = 0;
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return '방금 전';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + '분 전';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + '시간 전';
    var day = Math.floor(hr / 24);
    if (day < 7) return day + '일 전';
    var d = new Date(t);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
  }

  /* ===== 상태(서버 동기화 캐시) ===== */
  var state = {
    items: [],          // 서버 items 최신순
    unreadCount: 0,     // 서버 unreadCount
    loading: false,
    loaded: false,
  };

  /* ===== 스타일 주입(1회) — wz 톤, tokens.css 변수만 사용 ===== */
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ''
      + '.wz-notif{display:none;position:fixed;inset:0;z-index:1200;}'
      + '.wz-notif__backdrop{position:absolute;inset:0;background:rgba(16,24,40,.45);'
        + 'opacity:0;transition:opacity .28s ease;}'
      + '.wz-notif.is-open .wz-notif__backdrop{opacity:1;}'
      + '.wz-notif__panel{position:absolute;top:0;right:0;width:100%;max-width:400px;height:100%;'
        + 'background:var(--c-surface,#fff);box-shadow:var(--sh-3,-8px 0 24px rgba(16,24,40,.12));'
        + 'display:flex;flex-direction:column;transform:translateX(100%);transition:transform .28s ease;'
        + 'font-family:var(--font-sans);}'
      + '.wz-notif.is-open .wz-notif__panel{transform:translateX(0);}'
      + '.wz-notif__head{display:flex;align-items:center;justify-content:space-between;gap:8px;'
        + 'padding:var(--sp-4,16px) var(--sp-5,20px);border-bottom:1px solid var(--c-divider,#F3F4F6);}'
      + '.wz-notif__title{display:flex;align-items:center;gap:8px;font-size:var(--fs-h3,18px);'
        + 'font-weight:700;color:var(--c-text,#1A1A1A);}'
      + '.wz-notif__title svg{width:20px;height:20px;color:var(--c-primary-500,#8B5CF6);}'
      + '.wz-notif__count{min-width:20px;height:20px;padding:0 6px;border-radius:var(--r-full,999px);'
        + 'background:var(--c-primary-50,#F5F3FF);color:var(--c-primary-700,#6D28D9);'
        + 'font-size:var(--fs-caption,12px);font-weight:700;display:inline-flex;align-items:center;'
        + 'justify-content:center;line-height:1;}'
      + '.wz-notif__head-actions{display:flex;align-items:center;gap:4px;}'
      + '.wz-notif__readall{background:none;border:none;cursor:pointer;padding:6px 8px;border-radius:var(--r-sm,8px);'
        + 'color:var(--c-primary-600,#7C3AED);font-size:var(--fs-caption,12px);font-weight:600;'
        + 'font-family:inherit;white-space:nowrap;}'
      + '.wz-notif__readall:hover{background:var(--c-primary-50,#F5F3FF);}'
      + '.wz-notif__readall[disabled]{color:var(--c-text-faint,#9CA3AF);cursor:default;background:none;}'
      + '.wz-notif__close{background:none;border:none;cursor:pointer;padding:6px;border-radius:var(--r-sm,8px);'
        + 'color:var(--c-text-muted,#6B7280);display:inline-flex;}'
      + '.wz-notif__close:hover{background:var(--c-primary-50,#F5F3FF);color:var(--c-primary-600,#7C3AED);}'
      + '.wz-notif__close svg{width:22px;height:22px;}'
      + '.wz-notif__list{flex:1;overflow-y:auto;padding:var(--sp-3,12px);display:flex;flex-direction:column;gap:var(--sp-2,8px);}'
      + '.wz-notif__item{display:block;text-align:left;width:100%;text-decoration:none;color:inherit;'
        + 'border:1px solid var(--c-border,#E5E7EB);font-family:inherit;cursor:pointer;'
        + 'border-radius:var(--r-md,12px);padding:var(--sp-3,12px) var(--sp-4,16px);background:var(--c-surface,#fff);'
        + 'box-shadow:var(--sh-1,0 1px 2px rgba(16,24,40,.06));transition:box-shadow .16s,border-color .16s,background .16s;}'
      + '.wz-notif__item:hover{box-shadow:var(--sh-2,0 4px 12px rgba(16,24,40,.08));border-color:var(--c-primary-200,#DDD6FE);}'
      + '.wz-notif__item.is-unread{background:var(--c-primary-50,#F5F3FF);border-color:var(--c-primary-200,#DDD6FE);}'
      + '.wz-notif__row{display:flex;gap:var(--sp-3,12px);align-items:flex-start;}'
      + '.wz-notif__udot{width:8px;height:8px;border-radius:50%;background:var(--c-primary-500,#8B5CF6);'
        + 'flex-shrink:0;margin-top:6px;}'
      + '.wz-notif__item:not(.is-unread) .wz-notif__udot{visibility:hidden;}'
      + '.wz-notif__ic{flex-shrink:0;width:34px;height:34px;border-radius:var(--r-full,999px);'
        + 'display:inline-flex;align-items:center;justify-content:center;'
        + 'background:var(--c-primary-50,#F5F3FF);color:var(--c-primary-600,#7C3AED);}'
      + '.wz-notif__ic svg{width:18px;height:18px;}'
      + '.wz-notif__body{flex:1;min-width:0;}'
      + '.wz-notif__name{font-size:var(--fs-body-sm,14px);font-weight:600;color:var(--c-text,#1A1A1A);}'
      + '.wz-notif__item.is-unread .wz-notif__name{font-weight:700;}'
      + '.wz-notif__msg{font-size:var(--fs-caption,12px);margin-top:3px;color:var(--c-text-muted,#6B7280);'
        + 'line-height:1.45;word-break:break-word;}'
      + '.wz-notif__time{font-size:var(--fs-caption,12px);color:var(--c-text-faint,#9CA3AF);margin-top:6px;}'
      + '.wz-notif__cta{display:inline-flex;align-items:center;gap:4px;margin-top:10px;'
        + 'height:36px;padding:0 14px;border-radius:var(--r-md,12px);'
        + 'background:var(--c-primary-500,#8B5CF6);color:#fff;border:none;cursor:pointer;font-family:inherit;'
        + 'font-size:var(--fs-body-sm,14px);font-weight:700;text-decoration:none;transition:background .16s;}'
      + '.wz-notif__cta:hover{background:var(--c-primary-600,#7C3AED);}'
      + '.wz-notif__cta svg{width:16px;height:16px;}'
      + '.wz-notif__empty{display:flex;flex-direction:column;align-items:center;text-align:center;'
        + 'padding:72px 24px;color:var(--c-text-faint,#9CA3AF);}'
      + '.wz-notif__empty svg{width:48px;height:48px;color:var(--c-primary-200,#DDD6FE);margin-bottom:14px;}'
      + '.wz-notif__empty strong{font-size:var(--fs-body,16px);font-weight:600;color:var(--c-text-sub,#4B5563);}'
      + '.wz-notif__empty span{font-size:var(--fs-body-sm,14px);margin-top:6px;}'
      // 레거시(main.js) aria-label="알림" 버튼용 배지(.wz-hd__icon 이 아닐 때)
      + '.wz-notif-badge{position:absolute;top:0;right:0;min-width:16px;height:16px;padding:0 4px;'
        + 'border-radius:999px;background:var(--c-danger,#EF4444);color:#fff;font-size:10px;font-weight:700;'
        + 'line-height:16px;display:none;align-items:center;justify-content:center;}';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ===== 서버 동기화 ===== */
  // 알림 목록+미읽음 수를 서버에서 가져와 state 갱신. 미로그인/오류면 빈 상태로(silentAuthFail).
  function fetchNotifications() {
    if (!window.api || typeof window.api.get !== 'function') {
      return Promise.resolve(false);
    }
    state.loading = true;
    return window.api.get('/me/notifications?limit=50', { silentAuthFail: true })
      .then(function (data) {
        state.items = (data && Array.isArray(data.items)) ? data.items : [];
        state.unreadCount = (data && typeof data.unreadCount === 'number') ? data.unreadCount : 0;
        state.loaded = true;
        return true;
      })
      .catch(function () {
        // 미인증(NOT_AUTHENTICATED) 또는 네트워크 오류 → 빈 목록·배지 0
        state.items = [];
        state.unreadCount = 0;
        state.loaded = true;
        return false;
      })
      .then(function (ok) {
        state.loading = false;
        return ok;
      });
  }

  // 단건 읽음(멱등). 로컬 state 도 즉시 반영해 깜빡임 방지.
  function postRead(id) {
    var item = findItem(id);
    if (item && !item.isRead) {
      item.isRead = true;
      if (state.unreadCount > 0) state.unreadCount -= 1;
    }
    if (!window.api || typeof window.api.post !== 'function') return Promise.resolve();
    return window.api.post('/me/notifications/' + encodeURIComponent(id) + '/read', {}, { silentAuthFail: true })
      .catch(function () { /* 멱등 — 실패해도 흐름 비차단 */ });
  }

  // 전체 읽음. 로컬 state 즉시 반영.
  function postReadAll() {
    state.items.forEach(function (it) { it.isRead = true; });
    state.unreadCount = 0;
    if (!window.api || typeof window.api.post !== 'function') return Promise.resolve();
    return window.api.post('/me/notifications/read-all', {}, { silentAuthFail: true })
      .catch(function () { /* 비차단 */ });
  }

  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i] && String(state.items[i].id) === String(id)) return state.items[i];
    }
    return null;
  }

  /* ===== 패널 생성 ===== */
  function ensurePanel() {
    if (document.getElementById('notificationPanel')) return;
    ensureStyle();

    var panel = document.createElement('div');
    panel.id = 'notificationPanel';
    panel.className = 'wz-notif';
    // 정적 셸 — 사용자 데이터 없음.
    panel.innerHTML = ''
      + '<div class="wz-notif__backdrop" data-notif-close></div>'
      + '<aside class="wz-notif__panel" role="dialog" aria-label="알림 내역" aria-modal="true">'
      +   '<div class="wz-notif__head">'
      +     '<div class="wz-notif__title">'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>'
      +       '<span>알림</span>'
      +       '<span class="wz-notif__count" id="notifCount" hidden></span>'
      +     '</div>'
      +     '<div class="wz-notif__head-actions">'
      +       '<button type="button" class="wz-notif__readall" id="notifReadAll">모두 읽음</button>'
      +       '<button type="button" class="wz-notif__close" data-notif-close aria-label="닫기">'
      +         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>'
      +       '</button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="wz-notif__list" id="notifList"></div>'
      + '</aside>';
    document.body.appendChild(panel);

    // 닫기 핸들러(백드롭/닫기 버튼)
    panel.querySelectorAll('[data-notif-close]').forEach(function (n) {
      n.addEventListener('click', closeNotification);
    });
    // "모두 읽음"
    var readAllBtn = panel.querySelector('#notifReadAll');
    if (readAllBtn) {
      readAllBtn.addEventListener('click', function () {
        if (state.unreadCount <= 0) return;
        postReadAll().then(function () {
          renderList();
          updateNotificationBadges();
        });
        renderList();
        updateNotificationBadges();
      });
    }
    // ESC 로 닫기
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) closeNotification();
    });
  }

  /* ===== 열기/닫기 ===== */
  function openNotification() {
    ensurePanel();
    var panel = document.getElementById('notificationPanel');
    if (!panel) return;
    panel.style.display = 'block';
    // 즉시 캐시 렌더 후, 서버에서 최신 받아 재렌더(패널 열 때 갱신)
    renderList();
    fetchNotifications().then(function () {
      renderList();
      updateNotificationBadges();
    });
    // reflow 후 transition 적용
    requestAnimationFrame(function () { panel.classList.add('is-open'); });
  }

  function closeNotification() {
    var panel = document.getElementById('notificationPanel');
    if (!panel) return;
    panel.classList.remove('is-open');
    setTimeout(function () { panel.style.display = 'none'; }, 300);
  }

  /* ===== 이동 경로 해석 =====
   * 항목의 type/link/fundId 로 이동 경로를 결정한다. 이동 불가면 '' 반환(읽음만).
   *  - project_comment·comment_reply → /detail.html?id=fundId
   *  - inquiry_reply → item.link(문의/채팅 화면). 없으면 미이동.
   *  - report_received → 이동 없음(없으면 무이동)
   *  - 기타/레거시 → item.link 우선, 없으면 fundId 로 상세.
   */
  function resolveHref(item) {
    if (!item) return '';
    var type = item.type || '';
    var link = (item.link != null && String(item.link).trim() !== '') ? String(item.link) : '';
    var fundId = (item.fundId != null && String(item.fundId) !== '') ? String(item.fundId) : '';

    if (type === 'project_comment' || type === 'comment_reply') {
      if (fundId) return '/detail.html?id=' + encodeURIComponent(fundId);
      return link; // fundId 없으면 link 폴백(있으면)
    }
    if (type === 'inquiry_reply') {
      return link; // 문의/채팅 화면 — 서버가 준 link 그대로
    }
    if (type === 'report_received') {
      return link; // 보통 없음 → 무이동
    }
    // 레거시/기타: link 우선, 없으면 fundId 로 상세
    if (link) return link;
    if (fundId) return '/detail.html?id=' + encodeURIComponent(fundId);
    return '';
  }

  /* ===== 항목 이동: 읽음 처리 후 (이동 경로 있으면) 이동 ===== */
  function goToItem(item) {
    var id = String(item.id);
    var href = resolveHref(item);
    postRead(id);
    renderList();
    updateNotificationBadges();
    if (href) {
      window.location.href = href;
    }
  }

  /* ===== 리스트 렌더링 ===== */
  // SVG 화살표 아이콘 노드를 만든다(이모지 금지 — 인라인 SVG).
  function arrowIcon() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var p1 = document.createElementNS(ns, 'path'); p1.setAttribute('d', 'M5 12h14');
    var p2 = document.createElementNS(ns, 'path'); p2.setAttribute('d', 'M12 5l7 7-7 7');
    svg.appendChild(p1); svg.appendChild(p2);
    return svg;
  }

  // 알림 type 에 맞는 아이콘 노드(미지원 type 은 종 아이콘 폴백).
  function typeIcon(type) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var paths = (type && TYPE_ICONS[type]) ? TYPE_ICONS[type] : DEFAULT_ICON;
    paths.forEach(function (d) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  function renderList() {
    var container = document.getElementById('notifList');
    if (!container) return;

    var items = state.items;

    // 헤더 카운트(미읽음 수)
    var countEl = document.getElementById('notifCount');
    if (countEl) {
      if (state.unreadCount > 0) {
        countEl.textContent = state.unreadCount > 99 ? '99+' : String(state.unreadCount);
        countEl.hidden = false;
      } else {
        countEl.hidden = true;
      }
    }
    // "모두 읽음" 버튼 활성/비활성
    var readAllBtn = document.getElementById('notifReadAll');
    if (readAllBtn) readAllBtn.disabled = state.unreadCount <= 0;

    // 비우고 다시 채움(노드 기반 — 사용자 데이터는 textContent 로만)
    container.innerHTML = '';

    if (!items || items.length === 0) {
      container.innerHTML = ''
        + '<div class="wz-notif__empty">'
        +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>'
        +   '<strong>알림이 없습니다</strong>'
        +   '<span>프로젝트에 참여하면 알림을 받을 수 있어요</span>'
        + '</div>';
      return;
    }

    items.forEach(function (item) {
      if (!item || item.id == null) return;
      var id = String(item.id);
      var type = item.type || '';
      var href = resolveHref(item); // 이동 경로(없으면 '')
      var unread = item.isRead === false;

      // 항목 컨테이너 — 클릭 시 읽음 + (이동 경로 있으면)이동
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'wz-notif__item' + (unread ? ' is-unread' : '');
      el.setAttribute('data-notif-id', id);

      var row = document.createElement('div');
      row.className = 'wz-notif__row';

      var dot = document.createElement('span');
      dot.className = 'wz-notif__udot';
      dot.setAttribute('aria-hidden', 'true');
      row.appendChild(dot);

      // type 별 아이콘(미지원 type 은 종 폴백)
      var icon = document.createElement('span');
      icon.className = 'wz-notif__ic';
      icon.setAttribute('aria-hidden', 'true');
      icon.appendChild(typeIcon(type));
      row.appendChild(icon);

      var body = document.createElement('div');
      body.className = 'wz-notif__body';

      var name = document.createElement('div');
      name.className = 'wz-notif__name';
      name.textContent = item.title == null ? '' : String(item.title); // XSS 안전
      body.appendChild(name);

      if (item.body != null && String(item.body).trim() !== '') {
        var msg = document.createElement('div');
        msg.className = 'wz-notif__msg';
        msg.textContent = String(item.body); // XSS 안전
        body.appendChild(msg);
      }

      var time = document.createElement('div');
      time.className = 'wz-notif__time';
      time.textContent = relTime(item.createdAt);
      body.appendChild(time);

      // 이동 경로가 있으면 CTA 버튼(타입별 문구, 기본 "펀딩 보러가기")
      if (href) {
        var cta = document.createElement('span');
        cta.className = 'wz-notif__cta';
        cta.appendChild(document.createTextNode(TYPE_CTA[type] || '펀딩 보러가기'));
        cta.appendChild(arrowIcon());
        cta.addEventListener('click', function (e) {
          e.stopPropagation();
          goToItem(item);
        });
        body.appendChild(cta);
      }

      row.appendChild(body);
      el.appendChild(row);

      // 항목 본체 클릭: 읽음 처리 + 이동 경로 있으면 이동, 없으면 읽음만
      el.addEventListener('click', function () {
        goToItem(item);
      });

      container.appendChild(el);
    });
  }

  /* ===== 미확인 배지 ===== */
  // 헤더 종 아이콘 후보: 우선 #wz-bell, 없으면 wz 헤더의 알림 아이콘, 그 외 aria-label="알림"
  function getBellTargets() {
    var targets = [];
    var seen = [];
    function add(n) { if (n && seen.indexOf(n) === -1) { seen.push(n); targets.push(n); } }
    var byId = document.getElementById('wz-bell');
    if (byId) add(byId);
    document.querySelectorAll('.wz-hd__icon[aria-label="알림"]').forEach(add);
    document.querySelectorAll('[aria-label="알림"]').forEach(add);
    return targets;
  }

  function updateNotificationBadges() {
    var count = state.unreadCount;
    var label = count > 99 ? '99+' : String(count);
    getBellTargets().forEach(function (el) {
      var isWzIcon = el.classList && el.classList.contains('wz-hd__icon');
      var badge = el.querySelector(isWzIcon ? '.wz-dot' : '.wz-notif-badge');
      if (count <= 0) { if (badge) badge.style.display = 'none'; return; }
      if (!badge) {
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        badge = document.createElement('span');
        // wz 헤더 아이콘은 wz.css 의 .wz-dot 재사용, 그 외(레거시)는 자체 배지 클래스
        badge.className = isWzIcon ? 'wz-dot' : 'wz-notif-badge';
        badge.setAttribute('aria-hidden', 'true');
        el.appendChild(badge);
      }
      badge.textContent = label;
      badge.style.display = 'flex';
    });
  }

  // wz 헤더 종은 <button id="wz-bell"> — 클릭 시 슬라이드 패널 오픈(1회 바인딩). 레거시 앵커도 호환.
  function bindBellClicks() {
    getBellTargets().forEach(function (el) {
      if (el.getAttribute('data-notif-bound') === '1') return;
      el.setAttribute('data-notif-bound', '1');
      el.addEventListener('click', function (e) {
        // 앵커면 기본 이동 막고 패널 오픈(레거시 button 은 wz-core 가 이미 openNotification 호출하므로 중복 방지)
        if (el.tagName === 'A') {
          e.preventDefault();
          openNotification();
        }
      });
    });
  }

  // 배지 갱신용 — 서버에서 미읽음 수만 다시 받아 배지 반영(패널 닫혀 있어도 주기 갱신)
  function refreshBadge() {
    fetchNotifications().then(function () {
      updateNotificationBadges();
      // 패널이 열려 있으면 리스트도 최신으로
      var panel = document.getElementById('notificationPanel');
      if (panel && panel.classList.contains('is-open')) renderList();
    });
  }

  function injectNotificationBadges() {
    ensureStyle();
    bindBellClicks();
    // 아직 한 번도 서버에서 못 받았으면 받아서 배지 표시, 받았으면 캐시로 즉시 반영
    if (!state.loaded && !state.loading) {
      refreshBadge();
    } else {
      updateNotificationBadges();
    }
  }

  /* ===== 전역 노출 ===== */
  window.openNotification = openNotification;
  window.closeNotification = closeNotification;
  window.renderNotificationList = renderList;
  window.updateNotificationBadges = updateNotificationBadges;
  window.injectNotificationBadges = injectNotificationBadges;

  /* ===== 초기화 ===== */
  var pollTimer = null;
  function init() {
    injectNotificationBadges();
    // 주기 갱신(60초) — 중복 타이머 방지
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refreshBadge, POLL_MS);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 헤더가 동적으로 추가되는 wz 페이지: 벨이 늦게 생겨도 배지 바인딩/갱신
  window.addEventListener('mockproducts:updated', injectNotificationBadges);
  // wz-core 헤더 주입 직후를 대비한 짧은 지연 재시도(#wz-bell 부여 포함)
  setTimeout(injectNotificationBadges, 400);
})();
