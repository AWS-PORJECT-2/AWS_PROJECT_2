/**
 * 관리자 콘솔 (wz 디자인 시스템) — SPA. 새창 금지, 좌측 사이드 탭으로 섹션 전환.
 *
 * 진입 가드: GET /api/admin/me -> 403/에러면 "관리자 권한이 필요합니다" + 홈 링크만.
 *
 * 섹션:
 *   1) 대시보드   GET /api/admin/stats — KPI + 순수 SVG 차트(가입/펀드 추이, 카테고리, 상태 분포)
 *   2) 펀드 심사  GET /api/admin/funds?status= , POST .../approve|reject(사유)
 *   3) 대리 개설  GET /api/admin/funds?status=pending_review — 의뢰 대행 작성·공개.
 *                 PATCH /api/admin/funds/:id (본문) → POST .../rewards → POST .../approve
 *   4) 입금 확인  GET /api/admin/deposits?status= , POST .../deposits/:id/confirm
 *   5) 삭제 요청  GET /api/admin/fund-delete-requests , POST .../funds/:id/delete
 *   6) 사용자     GET /api/admin/users(+클라 검색) , POST .../users/:id/role
 *   7) 로그·오류  GET /api/admin/logs?level=
 *   8) 문의 채팅  GET /api/chat/admin/rooms , .../:id/messages (GET/POST), .../:id/read — SPA 내 통합
 *
 * 모든 응답 키는 백엔드 핸들러(admin-insights/funds/users, reward-orders, chat) 실측값.
 * XSS: DOM 생성 + textContent. innerHTML 은 자체 SVG 상수에만 사용.
 * 외부 차트 라이브러리 금지 — 차트는 순수 SVG 로 직접 그린다.
 */
(function () {
  var WZ = window.WZ || {};
  var el = WZ.el || function (tag, props) {
    var n = document.createElement(tag);
    var p = props || {};
    Object.keys(p).forEach(function (k) {
      var v = p[k]; if (v == null) return;
      if (k === 'class') n.className = v;
      else if (k === 'onClick') n.addEventListener('click', v);
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      [].concat(arguments[i]).forEach(function (c) {
        if (c == null || c === false) return;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return n;
  };
  var money = WZ.money || function (n) { return (Math.max(0, Math.floor(Number(n) || 0))).toLocaleString() + '원'; };
  var SVGNS = 'http://www.w3.org/2000/svg';

  var ICON = {
    dash:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    review:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    deposit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    trash:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
    users:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    logs:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
    chat:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4-1L3 20l1.1-4A8.4 8.4 0 1 1 21 11.5z"/></svg>',
    shield:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    box:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    lib:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19l1-5.8L3.5 9.2l5.9-.9z"/></svg>',
    chev:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    proxy:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
    img:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    text:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2M9 19h6M12 5v14"/></svg>',
    plus:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    x:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    grip:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>',
    send:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    flag:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>',
    cancel:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  };

  // 신고 사유 한글 라벨
  var REPORT_REASON = {
    spam: '스팸·광고', abuse: '욕설·비방', fraud: '사기·허위정보',
    sexual: '음란성·부적절', copyright: '저작권 침해', privacy: '개인정보 노출', etc: '기타',
  };
  function reportReasonLabel(c) { return REPORT_REASON[c] || c || '기타'; }

  // 신고 상태 필터(전체/미처리/처리/기각)
  var REPORT_STATUS = [
    { key: '',           label: '전체' },
    { key: 'open',       label: '미처리' },
    { key: 'resolved',   label: '처리 완료' },
    { key: 'dismissed',  label: '기각' },
  ];

  var FUND_STATUS = [
    { key: 'pending',  label: '심사 대기' },
    { key: 'open',     label: '공개됨' },
    { key: 'rejected', label: '반려됨' },
  ];

  // 펀드 상태 분포(stats.funds) 표시 순서/라벨/색 (tokens 변수 사용)
  var DIST = [
    { k: 'open',            label: '공개',     color: 'var(--c-primary-500)' },
    { k: 'pending_review',  label: '심사대기', color: 'var(--c-primary-300)' },
    { k: 'achieved',        label: '달성',     color: 'var(--c-accent-mint)' },
    { k: 'completed',       label: '완료',     color: 'var(--c-success)' },
    { k: 'failed',          label: '실패',     color: 'var(--c-accent-peach)' },
    { k: 'rejected',        label: '반려',     color: 'var(--c-text-faint)' },
    { k: 'cancelled',       label: '취소',     color: 'var(--c-danger)' },
  ];

  var SECTIONS = [
    { id: 'dashboard', label: '대시보드',  icon: 'dash',    render: renderDashboard },
    { id: 'funds',     label: '펀드 심사', icon: 'review',  render: renderFunds },
    { id: 'proxy',     label: '대리 개설', icon: 'proxy',   render: renderProxy },
    { id: 'deposits',  label: '입금 확인', icon: 'deposit', render: renderDeposits },
    { id: 'ordercancels', label: '펀딩 취소', icon: 'cancel', render: renderOrderCancels },
    { id: 'deletes',   label: '삭제 요청', icon: 'trash',   render: renderDeletes },
    { id: 'users',     label: '사용자 관리', icon: 'users', render: renderUsers },
    { id: 'library',   label: '디자인·패치', icon: 'lib',   render: renderLibrary },
    { id: 'reports',   label: '신고',      icon: 'flag',    render: renderReports },
    { id: 'chat',      label: '문의 채팅', icon: 'chat',    render: renderChat },
    { id: 'logs',      label: '로그·오류', icon: 'logs',    render: renderLogs },
  ];

  // 카테고리 옵션(대리 개설 편집용) — categories.js 단일 소스. 미로드 시 etc 만.
  function categoryOptions() {
    return (window.DT_CATEGORIES || [{ slug: 'etc', label: '기타' }]).map(function (c) {
      return { slug: c.slug, label: c.label };
    });
  }

  var root, sideEl, panelEl;
  var current = 'dashboard';
  // 사이드바 대기 배지 — 섹션 id → 배지 DOM. 매핑은 pending-counts 키 ↔ 섹션 id.
  // funds←fundsReview, proxy←proxy, deposits←deposits, ordercancels←orderCancels,
  // deletes←deletes, reports←reports, chat←chatUnread, logs←logsNew
  var badgeEls = {};           // { funds, proxy, deposits, deletes, reports, chat, logs } → <span>
  var badgeState = {};         // 동일 키 → 현재 숫자(로컬 state, 처리 시 -1)
  var pendingBadgeEl = null;   // (구) 펀드 심사 탭 배지 — badgeEls.funds 와 동일
  var proxyBadgeEl = null;     // (구) 대리 개설 탭 배지 — badgeEls.proxy 와 동일
  var deleteBadgeEl = null;    // (구) 삭제 요청 탭 배지 — badgeEls.deletes 와 동일
  var leaveSection = null;     // 현재 섹션 정리 콜백(채팅 폴링/소켓 해제 등)

  // pending-counts 응답 키 → 배지를 붙일 섹션 id
  var BADGE_MAP = {
    fundsReview: 'funds', proxy: 'proxy', deposits: 'deposits', orderCancels: 'ordercancels',
    deletes: 'deletes', reports: 'reports', chatUnread: 'chat', logsNew: 'logs',
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    root = document.getElementById('wz-admin');
    if (!root) return;
    var me;
    try {
      me = await window.api.get('/admin/me');
    } catch (e) {
      renderGuard();
      return;
    }
    if (!me || !me.isAdmin) { renderGuard(); return; }
    renderShell(me);
    var hash = (location.hash || '').replace('#', '');
    if (sectionById(hash)) current = hash;
    select(current);
    loadBadges();
  }

  function sectionById(id) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return SECTIONS[i];
    return null;
  }

  /* ===== 진입 가드 ===== */
  function renderGuard() {
    root.textContent = '';
    root.appendChild(el('div', { class: 'wza-guard' },
      el('div', { class: 'wza-guard__ic', html: ICON.shield }),
      el('h1', {}, '관리자 권한이 필요합니다'),
      el('p', {}, '이 페이지는 관리자 계정만 접근할 수 있습니다.'),
      el('a', { class: 'wz-btn wz-btn--primary', href: '/main.html' }, '홈으로 가기')
    ));
  }

  /* ===== 셸(헤더 타이틀 + 사이드 탭 + 본문) ===== */
  function renderShell(me) {
    root.textContent = '';
    var shell = el('div', { class: 'wza' });

    var head = el('div', { class: 'wza__head' },
      el('h1', { class: 'wza__title' }, '관리자 콘솔'));
    var who = el('span', { class: 'wza__who' });
    who.appendChild(document.createTextNode('로그인: '));
    var b = el('strong', {}, me.name || me.email || '관리자');
    who.appendChild(b);
    head.appendChild(who);
    shell.appendChild(head);

    // 배지를 붙일 섹션 id 집합(BADGE_MAP 의 값들)
    var badgeSecs = {};
    Object.keys(BADGE_MAP).forEach(function (k) { badgeSecs[BADGE_MAP[k]] = true; });
    badgeEls = {}; badgeState = {};

    sideEl = el('nav', { class: 'wza-side', 'aria-label': '관리자 섹션' });
    SECTIONS.forEach(function (s) {
      var btn = el('button', { class: 'wza-tab', type: 'button', 'data-sec': s.id });
      btn.appendChild(el('span', { class: 'wza-tab__ic', html: ICON[s.icon] }));
      btn.appendChild(document.createTextNode(s.label));
      if (badgeSecs[s.id]) {
        var badge = el('span', { class: 'wza-tab__badge', style: 'display:none' });
        btn.appendChild(badge);
        badgeEls[s.id] = badge;
        badgeState[s.id] = 0;
      }
      btn.addEventListener('click', function () { select(s.id); });
      sideEl.appendChild(btn);
    });
    // 구 변수 호환(기존 코드 경로가 참조)
    pendingBadgeEl = badgeEls.funds || null;
    proxyBadgeEl = badgeEls.proxy || null;
    deleteBadgeEl = badgeEls.deletes || null;
    shell.appendChild(sideEl);

    panelEl = el('section', { class: 'wza-panel' });
    shell.appendChild(panelEl);

    root.appendChild(shell);
  }

  function select(id) {
    var sec = sectionById(id) || SECTIONS[0];
    // 이전 섹션 정리(채팅 폴링/소켓 등)
    if (typeof leaveSection === 'function') { try { leaveSection(); } catch (_) {} }
    leaveSection = null;
    current = sec.id;
    try { history.replaceState(null, '', '#' + current); } catch (_) {}
    sideEl.querySelectorAll('.wza-tab[data-sec]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-sec') === current);
    });
    panelEl.textContent = '';
    var fresh = el('section', { class: 'wza-panel' });
    panelEl.replaceWith(fresh);
    panelEl = fresh;
    sec.render(panelEl);
    // 채팅은 방을 읽을 때 개별 감소(renderChat 내). 로그는 개별 '확인'(ack) 시 감소 → 진입만으로 0 처리하지 않음(미확인 수 유지).
    // 탭 전환 시 서버와 재동기화(로그·채팅은 현재 보고 있으면 0 유지 — loadBadges 가드).
    if (sideEl) loadBadges();
  }

  /* 사이드 탭 대기 배지 — GET /api/admin/pending-counts 로 일괄 동기화.
     각 섹션 처리/확인 시 로컬 state 를 갱신(bumpBadge/setBadgeFor)하고,
     탭 전환 시 주기적으로 재호출해 정합성을 맞춘다. */
  async function loadBadges() {
    var counts;
    try { counts = await window.api.get('/admin/pending-counts'); }
    catch (_) { return; /* 배지는 부가 정보 — 실패해도 무시 */ }
    if (!counts) return;
    Object.keys(BADGE_MAP).forEach(function (key) {
      var sec = BADGE_MAP[key];
      var n = Number(counts[key]) || 0;
      // 채팅은 방을 읽으며 개별 감소 → 보는 중엔 재표시 안 함. 로그는 개별 '확인'(ack)으로 감소하므로 실제 미확인 수를 그대로 표시.
      if (sec === 'chat' && current === sec) n = 0;
      setBadgeFor(sec, n);
    });
  }

  // 섹션 배지를 절대값으로 설정(로컬 state 동기화)
  function setBadgeFor(sec, n) {
    n = Math.max(0, Number(n) || 0);
    badgeState[sec] = n;
    var node = badgeEls[sec];
    if (!node) return;
    if (n > 0) {
      node.textContent = String(n);
      node.setAttribute('aria-label', n + '건 대기');
      node.style.display = '';
    } else {
      node.removeAttribute('aria-label');
      node.style.display = 'none';
    }
  }

  // 섹션 배지를 delta 만큼 증감(처리 시 -1). 0 이면 자동 숨김.
  function bumpBadge(sec, delta) {
    var cur = Number(badgeState[sec]) || 0;
    setBadgeFor(sec, cur + (Number(delta) || 0));
  }

  /* ===== 공통 UI 헬퍼 ===== */
  function panelHead(title, desc) {
    var h = el('div', { class: 'wza-panel__head' }, el('h2', { class: 'wza-panel__title' }, title));
    if (desc) h.appendChild(el('p', { class: 'wza-panel__desc' }, desc));
    return h;
  }
  function loadingNode() { return el('div', { class: 'wza-loading' }, '불러오는 중…'); }
  function emptyNode(msg) { return el('div', { class: 'wza-empty' }, msg); }
  function errorNode(e) { return el('div', { class: 'wza-error' }, '불러오지 못했습니다: ' + ((e && e.message) || '알 수 없는 오류')); }
  function fmtDate(s) {
    if (!s) return '-';
    var d = new Date(s); if (isNaN(d.getTime())) return '-';
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDateTime(s) {
    if (!s) return '-';
    var d = new Date(s); if (isNaN(d.getTime())) return '-';
    return fmtDate(s) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function catLabel(c) {
    if (typeof window.dtCategory === 'function') { var o = window.dtCategory(c); if (o) return o.label; }
    return c || '기타';
  }
  function thumbNode(p) {
    var t = el('div', { class: 'wza-item__thumb' });
    if (typeof WZ.fillThumb === 'function') WZ.fillThumb(t, p);
    else if (p && p.imageUrl) { var i = el('img', { src: p.imageUrl, alt: '' }); t.appendChild(i); }
    else t.innerHTML = ICON.box;
    return t;
  }

  /* ============================================================
   * 1) 대시보드
   * ============================================================ */
  async function renderDashboard(panel) {
    panel.appendChild(panelHead('대시보드', '플랫폼 핵심 지표와 최근 추이를 한눈에 봅니다.'));
    var slot = el('div', {}); panel.appendChild(slot);
    slot.appendChild(loadingNode());
    var s;
    try { s = await window.api.get('/admin/stats'); }
    catch (e) { slot.textContent = ''; slot.appendChild(errorNode(e)); return; }
    slot.textContent = '';

    var u = s.users || {}, f = s.funds || {}, o = s.orders || {};
    var likes = s.likes || {}, refunds = s.refunds || {}, reports = s.reports || {};
    function num(v) { return (Number(v) || 0).toLocaleString(); }

    // ── 1차 KPI(핵심 4) ──
    var kpis = el('div', { class: 'wza-kpis' });
    kpis.appendChild(kpiCard('전체 사용자', num(u.total), '신규 7일', num(u.new7d) + '명', ''));
    kpis.appendChild(kpiCard('전체 펀드', num(f.total), '심사 대기', num(f.pending_review) + '건', 'mint'));
    kpis.appendChild(kpiCard('거래액 (GMV)', money(o.gmv || 0), '입금 확정 기준', null, 'coral'));
    kpis.appendChild(kpiCard('결제 주문수', num(o.paid), '전체 주문', num(o.total) + '건', 'sky'));
    slot.appendChild(kpis);

    // ── 2차 KPI(추적 지표 — 모든 정보 한눈에) ──
    slot.appendChild(el('div', { class: 'wza-subhead' }, '운영 현황'));
    var ops = el('div', { class: 'wza-kpis' });
    ops.appendChild(kpiCard('신규 가입', num(u.newToday) + '명', '이번 주', num(u.newThisWeek) + '명', ''));
    ops.appendChild(kpiCard('진행중 펀드', num(f.open), '달성', num(f.achieved) + '건', 'mint'));
    ops.appendChild(kpiCard('대리 심사 대기', num(f.proxyReview) + '건', '일반 심사 대기', num(f.pending_review) + '건', 'sky'));
    ops.appendChild(kpiCard('입금 대기', num(o.awaiting) + '건', '입금 확인 필요', null, 'coral'));
    slot.appendChild(ops);

    // ── 3차 KPI(처리 대기 / 활동) ──
    var ops2 = el('div', { class: 'wza-kpis' });
    ops2.appendChild(kpiCard('신고 대기', num(reports.open) + '건', '미처리 신고', null, 'coral'));
    ops2.appendChild(kpiCard('환불 대기', num(refunds.pending) + '건', '환불 필요', null, 'coral'));
    ops2.appendChild(kpiCard('총 좋아요', num(likes.total), '누적 관심', null, ''));
    ops2.appendChild(kpiCard('총 모금액', money((o.gmv != null ? o.gmv : (s.totalRaised || 0))), '누적 거래 기준', null, 'mint'));
    slot.appendChild(ops2);

    // 차트
    slot.appendChild(el('div', { class: 'wza-subhead' }, '추이·분포'));
    var charts = el('div', { class: 'wza-charts' });
    charts.appendChild(lineChartCard('최근 14일 가입 추이', '일별 신규 가입자 수', s.dailySignups || []));
    charts.appendChild(barChartCard('최근 14일 펀드 생성 추이', '일별 신규 펀드 수', s.dailyFunds || []));
    charts.appendChild(categoryChartCard('카테고리 분포 (상위)', s.topCategories || []));
    charts.appendChild(distChartCard('펀드 상태 분포', f));
    slot.appendChild(charts);
  }

  function kpiCard(label, value, subLabel, subVal, accent) {
    var c = el('div', { class: 'wza-kpi' + (accent ? ' wza-kpi--' + accent : '') });
    c.appendChild(el('div', { class: 'wza-kpi__label' }, label));
    c.appendChild(el('div', { class: 'wza-kpi__value' }, value));
    var sub = el('div', { class: 'wza-kpi__sub' });
    sub.appendChild(document.createTextNode(subLabel + (subVal ? ' ' : '')));
    if (subVal) sub.appendChild(el('b', {}, subVal));
    c.appendChild(sub);
    return c;
  }

  function chartCard(title, hint) {
    var card = el('div', { class: 'wza-chart' });
    card.appendChild(el('div', { class: 'wza-chart__title' }, title));
    if (hint) card.appendChild(el('div', { class: 'wza-chart__hint' }, hint));
    return card;
  }

  // SVG helper (네임스페이스 요소)
  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  // 라인 차트 (가입 추이) — 순수 SVG
  function lineChartCard(title, hint, series) {
    var card = chartCard(title, hint);
    card.appendChild(lineSvg(series));
    return card;
  }
  function lineSvg(series) {
    var W = 520, H = 180, padL = 30, padR = 12, padT = 14, padB = 22;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'wza-chart__svg', preserveAspectRatio: 'xMidYMid meet', role: 'img' });
    var n = series.length || 1;
    var max = Math.max(1, series.reduce(function (m, d) { return Math.max(m, Number(d.count) || 0); }, 0));
    var iw = W - padL - padR, ih = H - padT - padB;
    function x(i) { return padL + (n <= 1 ? iw / 2 : (iw * i) / (n - 1)); }
    function y(v) { return padT + ih - (ih * v) / max; }

    // gridlines + y labels (0, max)
    [0, Math.round(max / 2), max].forEach(function (v) {
      svg.appendChild(svgEl('line', { class: 'gridline', x1: padL, y1: y(v), x2: W - padR, y2: y(v) }));
      var t = svgEl('text', { class: 'label', x: 2, y: y(v) + 3 }); t.textContent = String(v); svg.appendChild(t);
    });

    // area + line path
    var lp = '', ap = '';
    series.forEach(function (d, i) {
      var px = x(i), py = y(Number(d.count) || 0);
      lp += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
    });
    if (series.length) {
      ap = lp + 'L' + x(n - 1).toFixed(1) + ' ' + y(0) + ' L' + x(0).toFixed(1) + ' ' + y(0) + ' Z';
      svg.appendChild(svgEl('path', { class: 'area', d: ap }));
      svg.appendChild(svgEl('path', { class: 'line', d: lp.trim() }));
      series.forEach(function (d, i) {
        if (i % 2 !== 0 && i !== n - 1) return; // 점은 격번 + 마지막
        svg.appendChild(svgEl('circle', { class: 'dot', cx: x(i), cy: y(Number(d.count) || 0), r: 2.6 }));
      });
    }
    // x labels (양 끝 + 중앙)
    [0, Math.floor(n / 2), n - 1].forEach(function (i) {
      if (i < 0 || i >= n || !series[i]) return;
      var t = svgEl('text', { class: 'label', x: x(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle') });
      t.textContent = mmdd(series[i].date); svg.appendChild(t);
    });
    return svg;
  }

  // 바 차트 (펀드 생성 추이) — 순수 SVG
  function barChartCard(title, hint, series) {
    var card = chartCard(title, hint);
    card.appendChild(barSvg(series));
    return card;
  }
  function barSvg(series) {
    var W = 520, H = 180, padL = 30, padR = 12, padT = 14, padB = 22;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'wza-chart__svg', preserveAspectRatio: 'xMidYMid meet', role: 'img' });
    var n = series.length || 1;
    var max = Math.max(1, series.reduce(function (m, d) { return Math.max(m, Number(d.count) || 0); }, 0));
    var iw = W - padL - padR, ih = H - padT - padB;
    var slot = iw / n, bw = Math.max(4, slot * 0.6);
    function y(v) { return padT + ih - (ih * v) / max; }

    [0, Math.round(max / 2), max].forEach(function (v) {
      svg.appendChild(svgEl('line', { class: 'gridline', x1: padL, y1: y(v), x2: W - padR, y2: y(v) }));
      var t = svgEl('text', { class: 'label', x: 2, y: y(v) + 3 }); t.textContent = String(v); svg.appendChild(t);
    });
    series.forEach(function (d, i) {
      var v = Number(d.count) || 0;
      var bx = padL + slot * i + (slot - bw) / 2;
      var by = y(v), bh = padT + ih - by;
      var r = svgEl('rect', { class: 'bar', x: bx.toFixed(1), y: by.toFixed(1), width: bw.toFixed(1), height: Math.max(0, bh).toFixed(1), rx: 2 });
      svg.appendChild(r);
    });
    [0, Math.floor(n / 2), n - 1].forEach(function (i) {
      if (i < 0 || i >= n || !series[i]) return;
      var cx = padL + slot * i + slot / 2;
      var t = svgEl('text', { class: 'label', x: cx, y: H - 6, 'text-anchor': 'middle' });
      t.textContent = mmdd(series[i].date); svg.appendChild(t);
    });
    return svg;
  }

  function mmdd(s) {
    if (!s) return '';
    var p = String(s).split('-');
    return p.length === 3 ? (p[1] + '/' + p[2]) : s;
  }

  // 카테고리 가로막대 (HTML+CSS 막대; 라이브러리 없음)
  function categoryChartCard(title, cats) {
    var card = chartCard(title, null);
    if (!cats.length) { card.appendChild(emptyNode('데이터가 없습니다.')); return card; }
    var max = Math.max(1, cats.reduce(function (m, c) { return Math.max(m, Number(c.count) || 0); }, 0));
    var wrap = el('div', { class: 'wza-hbars' });
    cats.forEach(function (c) {
      var pct = Math.round(((Number(c.count) || 0) / max) * 100);
      var row = el('div', { class: 'wza-hbar' });
      row.appendChild(el('div', { class: 'wza-hbar__name' }, catLabel(c.category)));
      var track = el('div', { class: 'wza-hbar__track' });
      track.appendChild(el('div', { class: 'wza-hbar__fill', style: 'width:' + pct + '%' }));
      row.appendChild(track);
      row.appendChild(el('div', { class: 'wza-hbar__val' }, String(Number(c.count) || 0)));
      wrap.appendChild(row);
    });
    card.appendChild(wrap);
    return card;
  }

  // 펀드 상태 분포 (누적 가로막대 + 범례)
  function distChartCard(title, funds) {
    var card = chartCard(title, null);
    var segs = DIST.map(function (d) { return { label: d.label, color: d.color, value: Number(funds[d.k]) || 0 }; })
      .filter(function (d) { return d.value > 0; });
    var total = segs.reduce(function (sum, d) { return sum + d.value; }, 0);
    if (total === 0) { card.appendChild(emptyNode('펀드가 없습니다.')); return card; }
    var bar = el('div', { class: 'wza-dist' });
    segs.forEach(function (d) {
      bar.appendChild(el('div', { class: 'wza-dist__seg', style: 'width:' + ((d.value / total) * 100).toFixed(2) + '%;background:' + d.color }));
    });
    card.appendChild(bar);
    var legend = el('div', { class: 'wza-dist__legend' });
    segs.forEach(function (d) {
      var leg = el('div', { class: 'wza-dist__leg' });
      leg.appendChild(el('span', { class: 'wza-dist__sw', style: 'background:' + d.color }));
      leg.appendChild(document.createTextNode(d.label));
      leg.appendChild(el('b', {}, String(d.value)));
      legend.appendChild(leg);
    });
    card.appendChild(legend);
    return card;
  }

  /* ============================================================
   * 2) 펀드 심사
   * ============================================================ */
  function renderFunds(panel) {
    panel.appendChild(panelHead('펀드 심사', '새로 올라온 펀드를 검토하고 공개를 승인하거나 반려합니다.'));
    var state = { status: 'pending' };
    var chips = el('div', { class: 'wza-chips' });
    FUND_STATUS.forEach(function (s) {
      var chip = el('button', { class: 'wza-chip' + (s.key === state.status ? ' is-active' : ''), type: 'button' }, s.label);
      chip.addEventListener('click', function () {
        state.status = s.key;
        chips.querySelectorAll('.wza-chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        loadFunds(list, state.status);
      });
      chips.appendChild(chip);
    });
    panel.appendChild(chips);
    var list = el('div', { class: 'wza-list' });
    panel.appendChild(list);
    loadFunds(list, state.status);
  }

  async function loadFunds(list, status) {
    list.textContent = ''; list.appendChild(loadingNode());
    try {
      var res = await window.api.get('/admin/funds?status=' + encodeURIComponent(status));
      var items = (res && res.items) || [];
      list.textContent = '';
      if (!items.length) { list.appendChild(emptyNode('해당 상태의 펀드가 없습니다.')); return; }
      items.forEach(function (f) { list.appendChild(fundItem(f, list, status)); });
    } catch (e) { list.textContent = ''; list.appendChild(errorNode(e)); }
  }

  function fundItem(f, list, status) {
    var item = el('div', { class: 'wza-item' });
    item.appendChild(thumbNode(f));

    var body = el('div', { class: 'wza-item__body' });
    var title = el('div', { class: 'wza-item__title' });
    title.appendChild(document.createTextNode(f.title || '(제목 없음)'));
    if (f.delegated) title.appendChild(el('span', { class: 'wza-badge wza-badge--proxy' }, '대리'));
    body.appendChild(title);
    var meta = el('div', { class: 'wza-item__meta' });
    meta.textContent = catLabel(f.category) + ' · 작성자 ' + (f.authorName || '-') +
      ' · 목표 ' + (Number(f.targetQuantity) || 0) + '개 · ' + money(f.finalPrice) +
      ' · 리워드 ' + (Number(f.rewardCount) || 0) + '종 · ' + fmtDate(f.createdAt);
    body.appendChild(meta);
    item.appendChild(body);

    var actions = el('div', { class: 'wza-item__actions' });
    var view = el('a', { class: 'wza-btn wza-btn--outline', href: '/detail.html?id=' + encodeURIComponent(f.id), target: '_blank', rel: 'noopener' }, '보기');
    actions.appendChild(view);

    if (f.status === 'pending') {
      var approve = el('button', { class: 'wza-btn wza-btn--primary', type: 'button' }, '승인');
      approve.addEventListener('click', function () { approveFund(f, list, status); });
      actions.appendChild(approve);
      var reject = el('button', { class: 'wza-btn wza-btn--danger', type: 'button' }, '반려');
      reject.addEventListener('click', function () { rejectFund(f, list, status); });
      actions.appendChild(reject);
    } else if (f.status === 'open') {
      actions.appendChild(el('span', { class: 'wza-badge wza-badge--open' }, '공개됨'));
    } else {
      actions.appendChild(el('span', { class: 'wza-badge wza-badge--reject' }, '반려됨'));
    }
    item.appendChild(actions);
    return item;
  }

  function approveFund(f, list, status) {
    confirmModal({
      title: '펀드 승인',
      desc: '“' + (f.title || '') + '” 펀드를 공개 승인하시겠습니까?',
      okLabel: '승인', okClass: 'wza-modal__btn--primary',
      onOk: async function () {
        await window.api.post('/admin/funds/' + encodeURIComponent(f.id) + '/approve', {});
        bumpBadge('funds', -1);
        loadFunds(list, status); loadBadges();
      },
    });
  }

  function rejectFund(f, list, status) {
    reasonModal({
      title: '펀드 반려',
      desc: '“' + (f.title || '') + '” 펀드를 반려합니다. 사유를 입력하면 기록에 남습니다(선택).',
      placeholder: '반려 사유 (선택)',
      okLabel: '반려', okClass: 'wza-modal__btn--danger',
      onOk: async function (reason) {
        var body = reason ? { reason: reason } : {};
        await window.api.post('/admin/funds/' + encodeURIComponent(f.id) + '/reject', body);
        bumpBadge('funds', -1);
        loadFunds(list, status); loadBadges();
      },
    });
  }

  /* ============================================================
   * 3) 대리 개설 (proxy / 대행 작성·공개)
   *   GET /api/admin/funds?status=pending_review 로 의뢰 목록.
   *   각 의뢰: 제목/카테고리/의뢰자/요청메모(contentBlocks text)/첨부이미지(image) 표시.
   *   "작성·공개" 패널: 제목·카테고리·대표이미지(업로드+DnD)·스토리 블록(DnD)·
   *     기본가·마감일·목표수량·리워드 티어 입력.
   *   저장: PATCH /api/admin/funds/:id (본문) → POST .../rewards → POST .../approve.
   * ============================================================ */
  function renderProxy(panel) {
    panel.appendChild(panelHead('대리 개설', '의뢰자가 맡긴 펀드를 관리자가 대신 작성하고 공개합니다. 의뢰자 명의(creatorId)는 그대로 유지됩니다.'));
    var list = el('div', { class: 'wza-list' });
    panel.appendChild(list);
    loadProxy(list);
  }

  async function loadProxy(list) {
    list.textContent = ''; list.appendChild(loadingNode());
    try {
      var res = await window.api.get('/admin/funds?status=pending_review');
      var items = (res && res.items) || [];
      list.textContent = '';
      if (!items.length) { list.appendChild(emptyNode('대기 중인 대리 개설 의뢰가 없습니다.')); return; }
      items.forEach(function (f) { list.appendChild(proxyCard(f, list)); });
    } catch (e) { list.textContent = ''; list.appendChild(errorNode(e)); }
  }

  // 의뢰 1건 카드(요약 + 펼치는 편집 패널)
  function proxyCard(f, list) {
    var card = el('div', { class: 'wza-proxy' });

    var head = el('div', { class: 'wza-proxy__head' });
    head.appendChild(thumbNode(f));
    var info = el('div', { class: 'wza-proxy__info' });
    var title = el('div', { class: 'wza-item__title' });
    title.appendChild(document.createTextNode(f.title || '(제목 없음)'));
    title.appendChild(el('span', { class: 'wza-badge wza-badge--proxy' }, '대리'));
    info.appendChild(title);
    var meta = el('div', { class: 'wza-item__meta' });
    meta.textContent = catLabel(f.category) + ' · 의뢰자 ' + (f.authorName || '-') +
      ' · 목표 ' + (Number(f.targetQuantity) || 0) + '개 · ' + fmtDate(f.createdAt);
    info.appendChild(meta);
    head.appendChild(info);

    var actions = el('div', { class: 'wza-item__actions' });
    var openBtn = el('button', { class: 'wza-btn wza-btn--primary', type: 'button' }, '작성·공개');
    openBtn.addEventListener('click', function () {
      // 인라인 편집 대신 전체 작성 페이지(fund-create)에서 의뢰자 정보 프리필로 작성·공개.
      location.href = '/fund-create.html?adminProxy=' + encodeURIComponent(f.id);
    });
    actions.appendChild(openBtn);
    head.appendChild(actions);
    card.appendChild(head);
    return card;
  }

  /* ============================================================
   * 4) 입금 확인
   * ============================================================ */
  function renderDeposits(panel) {
    panel.appendChild(panelHead('입금 확인', '후원자의 입금자명·금액을 대조해 확인하면 후원이 확정됩니다.'));
    var state = { status: 'awaiting_deposit' };
    var TABS = [{ key: 'awaiting_deposit', label: '입금 대기' }, { key: 'confirmed', label: '확인 완료' }];
    var chips = el('div', { class: 'wza-chips' });
    TABS.forEach(function (t) {
      var chip = el('button', { class: 'wza-chip' + (t.key === state.status ? ' is-active' : ''), type: 'button' }, t.label);
      chip.addEventListener('click', function () {
        state.status = t.key;
        chips.querySelectorAll('.wza-chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        loadDeposits(list, state.status);
      });
      chips.appendChild(chip);
    });
    panel.appendChild(chips);
    var list = el('div', { class: 'wza-list' });
    panel.appendChild(list);
    loadDeposits(list, state.status);
  }

  async function loadDeposits(list, status) {
    list.textContent = ''; list.appendChild(loadingNode());
    try {
      var res = await window.api.get('/admin/deposits?status=' + encodeURIComponent(status));
      var items = (res && res.items) || [];
      list.textContent = '';
      if (!items.length) { list.appendChild(emptyNode('해당 상태의 입금 건이 없습니다.')); return; }
      items.forEach(function (o) { list.appendChild(depositItem(o, list, status)); });
    } catch (e) { list.textContent = ''; list.appendChild(errorNode(e)); }
  }

  function depositItem(o, list, status) {
    var item = el('div', { class: 'wza-item' });
    var body = el('div', { class: 'wza-item__body' });
    body.appendChild(el('div', { class: 'wza-item__title' }, (o.fundTitle || '-') + ' — ' + (o.rewardTitle || '-')));
    var meta = el('div', { class: 'wza-item__meta' });
    meta.textContent = '후원자 ' + (o.userName || '-') + ' · 입금자명 ' + (o.depositorName || '(미입력)') +
      ' · ' + money(o.amount) + ' · ' + fmtDateTime(o.createdAt);
    body.appendChild(meta);
    item.appendChild(body);

    var actions = el('div', { class: 'wza-item__actions' });
    if (o.status === 'awaiting_deposit') {
      var btn = el('button', { class: 'wza-btn wza-btn--primary', type: 'button' }, '입금 확인');
      btn.addEventListener('click', function () {
        confirmModal({
          title: '입금 확인',
          desc: '입금자명 “' + (o.depositorName || '(미입력)') + '” / 금액 ' + money(o.amount) + ' 을 대조하셨나요? 확인하면 후원이 확정됩니다.',
          okLabel: '입금 확인', okClass: 'wza-modal__btn--primary',
          onOk: async function () {
            await window.api.post('/admin/deposits/' + encodeURIComponent(o.id) + '/confirm', {});
            bumpBadge('deposits', -1);
            loadDeposits(list, status); loadBadges();
          },
        });
      });
      actions.appendChild(btn);
    } else {
      actions.appendChild(el('span', { class: 'wza-badge wza-badge--ok' }, '확인 완료'));
    }
    item.appendChild(actions);
    return item;
  }

  /* ============================================================
   * 4.5) 펀딩 취소 (사용자 취소 신청 처리 — #4 관리자측)
   *   GET /api/admin/order-cancel-requests → { items:[{id,fundId,fundTitle,
   *     userNickname,rewardTitle,amount,originalStatus,refunded,cancelReason,requestedAt}] }
   *   입금완료(originalStatus='confirmed')건: 환불표시 후 취소 확정.
   *     POST /api/admin/orders/:id/refund → POST /api/admin/orders/:id/cancel
   *   미입금(originalStatus='awaiting_deposit')건: 바로 취소 확정.
   *     POST /api/admin/orders/:id/cancel
   * ============================================================ */
  function renderOrderCancels(panel) {
    panel.appendChild(panelHead('펀딩 취소', '후원자가 취소를 신청한 펀딩입니다. 입금 완료 건은 먼저 환불 처리한 뒤 취소를 확정합니다.'));
    var list = el('div', { class: 'wza-list' });
    panel.appendChild(list);
    loadOrderCancels(list);
  }

  async function loadOrderCancels(list) {
    list.textContent = ''; list.appendChild(loadingNode());
    try {
      var res = await window.api.get('/admin/order-cancel-requests');
      var items = (res && res.items) || [];
      list.textContent = '';
      if (!items.length) { list.appendChild(emptyNode('취소 신청된 펀딩이 없습니다.')); return; }
      items.forEach(function (o) { list.appendChild(orderCancelItem(o, list)); });
    } catch (e) { list.textContent = ''; list.appendChild(errorNode(e)); }
  }

  function orderCancelItem(o, list) {
    var wasConfirmed = o.originalStatus === 'confirmed';
    var item = el('div', { class: 'wza-item wza-item--warn' });

    var body = el('div', { class: 'wza-item__body' });

    // 제목 줄: 펀드 제목(링크) + 입금완료/미입금 배지 + (환불됨 표시)
    var title = el('div', { class: 'wza-item__title' });
    var href = '/detail.html?id=' + encodeURIComponent(o.fundId);
    var link = el('a', { class: 'wza-report__target', href: href, target: '_blank', rel: 'noopener' });
    link.appendChild(document.createTextNode(o.fundTitle || '(제목 없음)'));
    title.appendChild(link);
    title.appendChild(el('span', { class: 'wza-badge ' + (wasConfirmed ? 'wza-badge--ok' : 'wza-badge--reject') }, wasConfirmed ? '입금 완료' : '미입금'));
    if (o.refunded) title.appendChild(el('span', { class: 'wza-badge wza-badge--proxy' }, '환불 표시됨'));
    body.appendChild(title);

    // 후원자 닉네임 · 리워드 · 금액 · 요청일시
    var meta = el('div', { class: 'wza-item__meta wza-item__meta--warn' });
    meta.appendChild(document.createTextNode('후원자 '));
    meta.appendChild(document.createTextNode(o.userNickname || '-'));
    meta.appendChild(document.createTextNode(' · 리워드 '));
    meta.appendChild(document.createTextNode(o.rewardTitle || '-'));
    meta.appendChild(document.createTextNode(' · ' + money(o.amount) + ' · 요청 ' + fmtDateTime(o.requestedAt)));
    body.appendChild(meta);

    // 취소 사유(사용자값) — 있으면 별도 줄
    if (o.cancelReason) {
      var reason = el('div', { class: 'wza-report__detail' });
      reason.appendChild(document.createTextNode('사유: ' + o.cancelReason));
      body.appendChild(reason);
    }
    item.appendChild(body);

    var actions = el('div', { class: 'wza-item__actions' });
    // 입금완료건: 환불 전이면 [환불 처리], 환불 후면 [취소 확정].
    // 미입금건: 바로 [취소 확정].
    if (wasConfirmed && !o.refunded) {
      var refundBtn = el('button', { class: 'wza-btn wza-btn--primary', type: 'button' }, '환불 처리');
      refundBtn.addEventListener('click', function () { refundOrder(o, list); });
      actions.appendChild(refundBtn);
    } else {
      var cancelBtn = el('button', { class: 'wza-btn wza-btn--danger', type: 'button' }, '취소 확정');
      cancelBtn.addEventListener('click', function () { cancelOrder(o, list); });
      actions.appendChild(cancelBtn);
    }
    item.appendChild(actions);
    return item;
  }

  // 환불 표시(입금완료건) — POST /api/admin/orders/:id/refund. 성공 시 목록 갱신(취소 확정 단계로 전환).
  function refundOrder(o, list) {
    confirmModal({
      title: '환불 처리',
      desc: '“' + (o.fundTitle || '') + '” — 후원자 ' + (o.userNickname || '-') + ' / ' + money(o.amount) + ' 건을 환불 처리(표시)합니다.',
      note: '실제 송금은 외부에서 진행해 주세요. 환불 표시 후 [취소 확정]으로 마무리합니다.',
      okLabel: '환불 처리', okClass: 'wza-modal__btn--primary',
      onOk: async function () {
        await window.api.post('/admin/orders/' + encodeURIComponent(o.id) + '/refund', {});
        loadOrderCancels(list);
      },
    });
  }

  // 취소 확정 — POST /api/admin/orders/:id/cancel. 환불 전 입금완료건은 서버가 409 REFUND_REQUIRED → 안내.
  function cancelOrder(o, list) {
    var wasConfirmed = o.originalStatus === 'confirmed';
    confirmModal({
      title: '취소 확정',
      desc: '“' + (o.fundTitle || '') + '” — 후원자 ' + (o.userNickname || '-') + ' / ' + money(o.amount) + ' 건의 취소를 확정합니다.' +
        (wasConfirmed ? ' 확정 후 재고가 복구됩니다.' : ''),
      okLabel: '취소 확정', okClass: 'wza-modal__btn--danger',
      onOk: async function () {
        try {
          await window.api.post('/admin/orders/' + encodeURIComponent(o.id) + '/cancel', {});
        } catch (e) {
          if (e && e.code === 'REFUND_REQUIRED') {
            // 입금 확정 건은 환불 표시가 선행되어야 함 — 안내 후 목록 갱신.
            loadOrderCancels(list);
            throw new Error('입금이 확정된 후원입니다. 먼저 [환불 처리] 후 취소를 확정해 주세요.');
          }
          throw e;
        }
        bumpBadge('ordercancels', -1);
        loadOrderCancels(list); loadBadges();
      },
    });
  }

  /* ============================================================
   * 5) 삭제 요청
   * ============================================================ */
  function renderDeletes(panel) {
    panel.appendChild(panelHead('삭제 요청', '작성자가 삭제를 요청한 펀드입니다. 삭제 승인 시 펀드가 취소되고 모든 후원이 취소되며, 입금 완료 건은 환불 대상으로 안내됩니다.'));
    var list = el('div', { class: 'wza-list' });
    panel.appendChild(list);
    loadDeletes(list);
  }

  async function loadDeletes(list) {
    list.textContent = ''; list.appendChild(loadingNode());
    try {
      var res = await window.api.get('/admin/fund-delete-requests');
      var items = (res && res.items) || [];
      list.textContent = '';
      if (!items.length) { list.appendChild(emptyNode('삭제 요청이 없습니다.')); return; }
      items.forEach(function (f) { list.appendChild(deleteItem(f, list)); });
    } catch (e) { list.textContent = ''; list.appendChild(errorNode(e)); }
  }

  function deleteItem(f, list) {
    var item = el('div', { class: 'wza-item wza-item--warn' });
    var body = el('div', { class: 'wza-item__body' });
    body.appendChild(el('div', { class: 'wza-item__title' }, f.title || '(제목 없음)'));
    var meta = el('div', { class: 'wza-item__meta wza-item__meta--warn' });
    meta.textContent = '작성자 ' + (f.authorName || '-') + ' · 사유: ' + (f.deleteReason || '(없음)');
    body.appendChild(meta);
    item.appendChild(body);

    var actions = el('div', { class: 'wza-item__actions' });
    var view = el('a', { class: 'wza-btn wza-btn--outline', href: '/detail.html?id=' + encodeURIComponent(f.id), target: '_blank', rel: 'noopener' }, '보기');
    actions.appendChild(view);
    var btn = el('button', { class: 'wza-btn wza-btn--danger', type: 'button' }, '삭제 승인');
    btn.addEventListener('click', function () {
      confirmModal({
        title: '펀드 삭제 승인',
        desc: '“' + (f.title || '') + '” 펀드를 삭제 처리합니다. 모든 후원이 취소됩니다.',
        note: '입금 완료(확정) 건은 실제 환불이 필요합니다. 삭제 후 환불 대상 목록이 표시됩니다.',
        okLabel: '삭제 승인', okClass: 'wza-modal__btn--danger',
        onOk: async function () {
          var res;
          try {
            res = await window.api.post('/admin/funds/' + encodeURIComponent(f.id) + '/delete', {});
          } catch (e) {
            // #6 환불가드 — 환불되지 않은 confirmed 후원이 있으면 서버가 409 REFUND_REQUIRED.
            if (e && e.code === 'REFUND_REQUIRED') {
              var n = (e.data && Number(e.data.unrefunded)) || 0;
              throw new Error('환불되지 않은 후원자가 ' + (n || '여러') + '명 있어요. ‘펀딩 취소’ 탭에서 먼저 환불·취소해 주세요.');
            }
            throw e;
          }
          var refundable = (res && res.refundable) || [];
          bumpBadge('deletes', -1);
          loadDeletes(list); loadBadges();
          if (refundable.length) showRefundList(refundable);
        },
      });
    });
    actions.appendChild(btn);
    item.appendChild(actions);
    return item;
  }

  function showRefundList(refundable) {
    var lines = refundable.map(function (r) {
      var who = r.depositorName || r.userName || r.userId || '후원자';
      return who + ' / ' + money(r.amount);
    });
    var back = modalBack();
    var modal = el('div', { class: 'wza-modal' });
    modal.appendChild(el('div', { class: 'wza-modal__title' }, '환불 대상 ' + refundable.length + '건'));
    modal.appendChild(el('p', { class: 'wza-modal__desc' }, '아래 입금 완료 건은 실제 환불 처리가 필요합니다.'));
    var ul = el('div', { class: 'wza-list' });
    lines.forEach(function (ln) {
      ul.appendChild(el('div', { class: 'wza-item' }, el('div', { class: 'wza-item__body' }, el('div', { class: 'wza-item__meta' }, ln))));
    });
    modal.appendChild(ul);
    var act = el('div', { class: 'wza-modal__actions' });
    var ok = el('button', { class: 'wza-modal__btn wza-modal__btn--primary', type: 'button' }, '확인');
    ok.addEventListener('click', function () { back.remove(); });
    act.appendChild(ok); modal.appendChild(act);
    back.appendChild(modal); document.body.appendChild(back);
  }

  /* ============================================================
   * 6) 사용자 관리
   * ============================================================ */
  var USER_STATUS = { ACTIVE: ['정상', 'wza-st--active'], SUSPENDED: ['정지', 'wza-st--susp'], BANNED: ['차단', 'wza-st--ban'], WITHDRAWN: ['탈퇴', 'wza-st--wd'] };
  function statusBadge(u) {
    var m = USER_STATUS[u.status || 'ACTIVE'] || USER_STATUS.ACTIVE;
    return el('span', { class: 'wza-st ' + m[1] }, m[0]);
  }
  var STATUS_TABS = [['', '전체'], ['ACTIVE', '정상'], ['SUSPENDED', '정지'], ['BANNED', '차단'], ['WITHDRAWN', '탈퇴']];

  function renderUsers(panel) {
    panel.appendChild(panelHead('사용자 관리', '가입한 사용자의 상태·권한을 관리하고, 정지/차단/탈퇴·알림 등 제재를 적용합니다.'));
    var search = el('input', { class: 'wza-search', type: 'text', placeholder: '이름·이메일·닉네임 검색', 'aria-label': '사용자 검색' });
    panel.appendChild(search);
    var tabs = el('div', { class: 'wza-subtabs' }); panel.appendChild(tabs);
    var curStatus = '';
    STATUS_TABS.forEach(function (t) {
      var b = el('button', { class: 'wza-subtab' + (t[0] === curStatus ? ' is-on' : ''), type: 'button' }, t[1]);
      b.addEventListener('click', function () { curStatus = t[0]; Array.prototype.forEach.call(tabs.children, function (c) { c.classList.remove('is-on'); }); b.classList.add('is-on'); filter(); });
      tabs.appendChild(b);
    });
    var slot = el('div', {}); panel.appendChild(slot);
    var all = [];

    function render(rows) {
      slot.textContent = '';
      if (!rows.length) { slot.appendChild(emptyNode('해당하는 사용자가 없습니다.')); return; }
      var wrap = el('div', { class: 'wza-tablewrap' });
      var table = el('table', { class: 'wza-table' });
      table.appendChild(el('thead', {}, el('tr', {},
        el('th', {}, '이름'), el('th', {}, '이메일'), el('th', {}, '권한'), el('th', {}, '상태'),
        el('th', {}, '가입일'), el('th', { class: 'wza-table__right' }, '관리'))));
      var tbody = el('tbody', {});
      rows.forEach(function (u) { tbody.appendChild(userRow(u)); });
      table.appendChild(tbody);
      wrap.appendChild(table); slot.appendChild(wrap);
    }

    function filter() {
      var q = (search.value || '').trim().toLowerCase();
      var rows = all;
      if (curStatus) rows = rows.filter(function (u) { return (u.status || 'ACTIVE') === curStatus; });
      if (q) rows = rows.filter(function (u) { return (u.email || '').toLowerCase().indexOf(q) !== -1 || (u.name || '').toLowerCase().indexOf(q) !== -1 || (u.nickname || '').toLowerCase().indexOf(q) !== -1; });
      render(rows);
    }
    search.addEventListener('input', filter);

    async function reload() {
      slot.textContent = ''; slot.appendChild(loadingNode());
      try { var res = await window.api.get('/admin/users'); all = (res && res.items) || []; filter(); }
      catch (e) { slot.textContent = ''; slot.appendChild(errorNode(e)); }
    }
    renderUsers._reload = reload;
    reload();

    function userRow(u) {
      var tr = el('tr', {});
      var nameTd = el('td', { class: 'wza-table__name' }, u.name || '(이름없음)');
      if (u.nickname) nameTd.appendChild(el('span', { class: 'wza-table__muted' }, ' @' + u.nickname));
      tr.appendChild(nameTd);
      tr.appendChild(el('td', {}, u.email || '-'));
      var roleTd = el('td', {});
      if ((u.role || 'USER') === 'ADMIN') roleTd.appendChild(el('span', { class: 'wza-badge wza-badge--admin' }, '관리자'));
      else roleTd.appendChild(el('span', { class: 'wza-table__muted' }, '일반'));
      tr.appendChild(roleTd);
      tr.appendChild(el('td', {}, statusBadge(u)));
      tr.appendChild(el('td', { class: 'wza-table__muted' }, fmtDate(u.createdAt)));
      var actTd = el('td', { class: 'wza-table__right' });
      var manage = el('button', { class: 'wza-btn wza-btn--primary', type: 'button' }, '관리');
      manage.addEventListener('click', function () { openUserPanel(u, reload); });
      actTd.appendChild(manage);
      tr.appendChild(actTd);
      return tr;
    }
  }

  // 사용자 1명 관리 패널 — 상세(상태·활동·이력) + 모든 제재 액션. 액션 후 패널/목록 갱신.
  function openUserPanel(u, reloadList) {
    var back = modalBack();
    var modal = el('div', { class: 'wza-modal wza-umodal' });
    modal.appendChild(loadingNode());
    back.appendChild(modal); document.body.appendChild(back);
    var uid = u.id;
    function fetchDetail() { return window.api.get('/admin/users/' + encodeURIComponent(uid)); }
    function refresh() { fetchDetail().then(renderPanel).catch(function () {}); }
    fetchDetail().then(renderPanel).catch(function (e) { modal.textContent = ''; modal.appendChild(errorNode(e)); });

    function statCell(n, label) { return el('div', { class: 'wza-um__stat' }, el('strong', {}, String(n)), el('span', {}, label)); }
    function actName(a) {
      return ({ suspend: '기간정지', ban: '영구정지', unban: '정지해제', withdraw: '강제탈퇴', restore: '복구', rename: '이름변경', role: '권한변경', warn: '경고', note: '메모', notify: '알림발송', force_logout: '강제로그아웃' })[a] || a;
    }

    function renderPanel(d) {
      var user = d.user || {}, act = d.activity || {}, hist = d.history || [];
      var st = user.status || 'ACTIVE';
      modal.textContent = '';
      // 헤더
      var head = el('div', { class: 'wza-um__head' });
      if (user.picture) head.appendChild(el('img', { class: 'wza-um__avatar', src: user.picture, alt: '' }));
      var hcol = el('div', { class: 'wza-um__hcol' });
      var line1 = el('div', { class: 'wza-um__name' }, user.name || '(이름없음)');
      line1.appendChild(statusBadge(user));
      if ((user.role || 'USER') === 'ADMIN') line1.appendChild(el('span', { class: 'wza-badge wza-badge--admin' }, '관리자'));
      hcol.appendChild(line1);
      hcol.appendChild(el('div', { class: 'wza-um__email' }, (user.email || '') + (user.nickname ? ' · @' + user.nickname : '')));
      head.appendChild(hcol);
      modal.appendChild(head);
      // 상태 안내
      if (st === 'SUSPENDED' && user.suspendedUntil) modal.appendChild(el('p', { class: 'wza-um__susp' }, '⏳ ' + fmtDateTime(user.suspendedUntil) + ' 까지 정지' + (user.suspensionReason ? ' · ' + user.suspensionReason : '')));
      else if (st === 'BANNED') modal.appendChild(el('p', { class: 'wza-um__susp wza-um__susp--ban' }, '⛔ 영구 정지' + (user.suspensionReason ? ' · ' + user.suspensionReason : '')));
      else if (st === 'WITHDRAWN') modal.appendChild(el('p', { class: 'wza-um__susp' }, '🚪 탈퇴 처리됨' + (user.suspensionReason ? ' · ' + user.suspensionReason : '')));
      // 활동 집계
      var stats = el('div', { class: 'wza-um__stats' });
      stats.append(statCell(act.funds || 0, '프로젝트'), statCell(act.backings || 0, '후원'), statCell(act.posts || 0, '게시글'), statCell(act.comments || 0, '댓글'), statCell(act.reportsAgainst || 0, '받은신고'));
      modal.appendChild(stats);
      // 액션 그리드
      var actions = el('div', { class: 'wza-um__actions' });
      function abtn(label, cls, fn) { var b = el('button', { class: 'wza-btn ' + (cls || 'wza-btn--outline'), type: 'button' }, label); b.addEventListener('click', fn); actions.appendChild(b); }
      function done() { reloadList && reloadList(); refresh(); }
      if (st === 'ACTIVE' || st === 'SUSPENDED') abtn('기간 정지', 'wza-btn--warn', actSuspend);
      if (st !== 'BANNED' && st !== 'WITHDRAWN') abtn('영구 정지', 'wza-btn--danger', actBan);
      if (st === 'SUSPENDED' || st === 'BANNED') abtn('정지 해제', 'wza-btn--primary', actUnban);
      if (st !== 'WITHDRAWN') abtn('회원 탈퇴', 'wza-btn--danger', actWithdraw);
      if (st === 'WITHDRAWN') abtn('탈퇴 복구', 'wza-btn--primary', actRestore);
      abtn('이름·닉네임 변경', null, actRename);
      abtn('알림 보내기', null, actNotify);
      abtn('경고', null, actWarn);
      abtn('메모', null, actNote);
      abtn('강제 로그아웃', null, actForceLogout);
      abtn((user.role === 'ADMIN' ? '관리자 해제' : '관리자 지정'), null, actRole);
      modal.appendChild(actions);
      // 제재 이력
      modal.appendChild(el('h4', { class: 'wza-um__h' }, '제재·관리 이력'));
      var hl = el('div', { class: 'wza-um__hist' });
      if (!hist.length) hl.appendChild(el('p', { class: 'wza-table__muted' }, '이력이 없습니다.'));
      else hist.forEach(function (h) {
        var row = el('div', { class: 'wza-um__hrow' });
        row.appendChild(el('span', { class: 'wza-um__haction' }, actName(h.action)));
        if (h.reason) row.appendChild(el('span', { class: 'wza-um__hreason' }, h.reason));
        row.appendChild(el('span', { class: 'wza-um__htime' }, (h.adminName ? h.adminName + ' · ' : '') + fmtDateTime(h.createdAt)));
        hl.appendChild(row);
      });
      modal.appendChild(hl);
      // 닫기
      var foot = el('div', { class: 'wza-modal__actions' });
      var closeb = el('button', { class: 'wza-modal__btn wza-modal__btn--ghost', type: 'button' }, '닫기');
      closeb.addEventListener('click', function () { back.remove(); });
      foot.appendChild(closeb); modal.appendChild(foot);

      var P = '/admin/users/' + encodeURIComponent(uid);
      function actSuspend() { formModal({ title: '기간 정지', desc: '지정한 기간 동안 로그인·이용을 막고 즉시 로그아웃시킵니다.', fields: [{ key: 'days', label: '정지 일수', type: 'number', value: '7' }, { key: 'reason', label: '사유(선택)', type: 'textarea' }], okLabel: '정지', okClass: 'wza-modal__btn--primary', onOk: function (v) { return window.api.post(P + '/status', { status: 'SUSPENDED', days: Number(v.days) || 0, reason: v.reason }).then(done); } }); }
      function actBan() { reasonModal({ title: '영구 정지', desc: '계정을 영구 차단하고 즉시 로그아웃시킵니다.', placeholder: '사유(선택)', okLabel: '영구 정지', okClass: 'wza-modal__btn--danger', onOk: function (reason) { return window.api.post(P + '/status', { status: 'BANNED', reason: reason }).then(done); } }); }
      function actUnban() { confirmModal({ title: '정지 해제', desc: '“' + (user.name || user.email) + '”의 정지/차단을 해제하시겠습니까?', okLabel: '해제', okClass: 'wza-modal__btn--primary', onOk: function () { return window.api.post(P + '/status', { status: 'ACTIVE' }).then(done); } }); }
      function actWithdraw() { reasonModal({ title: '회원 탈퇴 처리', desc: '계정을 탈퇴 처리합니다(데이터는 보존, 로그인 차단). 복구 가능합니다.', placeholder: '사유(선택)', okLabel: '탈퇴 처리', okClass: 'wza-modal__btn--danger', onOk: function (reason) { return window.api.post(P + '/withdraw', { reason: reason }).then(done); } }); }
      function actRestore() { confirmModal({ title: '탈퇴 복구', desc: '탈퇴 처리를 취소하고 계정을 복구하시겠습니까?', okLabel: '복구', okClass: 'wza-modal__btn--primary', onOk: function () { return window.api.post(P + '/restore', {}).then(done); } }); }
      function actRename() { formModal({ title: '이름·닉네임 변경', desc: '변경 시 사용자에게 알림이 전송됩니다.', fields: [{ key: 'name', label: '이름', value: user.name || '' }, { key: 'nickname', label: '닉네임', value: user.nickname || '' }], okLabel: '변경', okClass: 'wza-modal__btn--primary', onOk: function (v) { return window.api.patch(P + '/name', { name: v.name, nickname: v.nickname }).then(done); } }); }
      function actNotify() { formModal({ title: '알림 보내기', desc: '대상 사용자에게 직접 알림을 전송합니다.', fields: [{ key: 'title', label: '제목' }, { key: 'body', label: '내용', type: 'textarea' }], okLabel: '전송', okClass: 'wza-modal__btn--primary', onOk: function (v) { return window.api.post(P + '/notify', { title: v.title, body: v.body }).then(done); } }); }
      function actWarn() { reasonModal({ title: '경고', desc: '경고 알림을 보내고 이력에 남깁니다(이용 제한 없음).', placeholder: '경고 사유', okLabel: '경고', okClass: 'wza-modal__btn--primary', onOk: function (reason) { if (!reason) throw new Error('경고 사유를 입력해 주세요'); return window.api.post(P + '/warn', { reason: reason }).then(done); } }); }
      function actNote() { reasonModal({ title: '관리자 메모', desc: '대상에게 보이지 않는 내부 메모입니다(이력에만 기록).', placeholder: '메모', okLabel: '저장', okClass: 'wza-modal__btn--primary', onOk: function (note) { if (!note) throw new Error('메모를 입력해 주세요'); return window.api.post(P + '/note', { note: note }).then(done); } }); }
      function actForceLogout() { confirmModal({ title: '강제 로그아웃', desc: '모든 기기에서 로그아웃시킵니다(세션 폐기).', okLabel: '로그아웃', okClass: 'wza-modal__btn--primary', onOk: function () { return window.api.post(P + '/force-logout', {}).then(done); } }); }
      function actRole() { var makeAdmin = (user.role || 'USER') !== 'ADMIN'; confirmModal({ title: makeAdmin ? '관리자 지정' : '관리자 해제', desc: '권한을 ' + (makeAdmin ? '관리자' : '일반') + '(으)로 변경하시겠습니까?', okLabel: '변경', okClass: 'wza-modal__btn--primary', onOk: function () { return window.api.post(P + '/role', { role: makeAdmin ? 'ADMIN' : 'USER' }).then(done); } }); }
    }
  }

  /* ============================================================
   * 6.5) 신고 관리
   *   GET /api/admin/reports?status=open|resolved|dismissed → { items:[...] }
   *   POST /api/admin/reports/:id/resolve { status:'resolved'|'dismissed' } → { id, status }
   * ============================================================ */
  function renderReports(panel) {
    panel.appendChild(panelHead('신고', '사용자가 접수한 메이커·게시글 신고를 검토하고 처리합니다.'));
    var state = { status: 'open' };
    var chips = el('div', { class: 'wza-chips' });
    REPORT_STATUS.forEach(function (s) {
      var chip = el('button', { class: 'wza-chip' + (s.key === state.status ? ' is-active' : ''), type: 'button' }, s.label);
      chip.addEventListener('click', function () {
        state.status = s.key;
        chips.querySelectorAll('.wza-chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        loadReports(list, state.status);
      });
      chips.appendChild(chip);
    });
    panel.appendChild(chips);
    var list = el('div', { class: 'wza-list' });
    panel.appendChild(list);
    loadReports(list, state.status);
  }

  async function loadReports(list, status) {
    list.textContent = ''; list.appendChild(loadingNode());
    try {
      var qs = status ? ('?status=' + encodeURIComponent(status)) : '';
      var res = await window.api.get('/admin/reports' + qs);
      var items = (res && res.items) || [];
      list.textContent = '';
      if (!items.length) { list.appendChild(emptyNode('해당 상태의 신고가 없습니다.')); return; }
      items.forEach(function (r) { list.appendChild(reportItem(r, list, status)); });
    } catch (e) { list.textContent = ''; list.appendChild(errorNode(e)); }
  }

  function reportStatusBadge(st) {
    if (st === 'resolved') return el('span', { class: 'wza-badge wza-badge--ok' }, '처리 완료');
    if (st === 'dismissed') return el('span', { class: 'wza-badge wza-badge--reject' }, '기각');
    return el('span', { class: 'wza-badge wza-badge--report' }, '미처리');
  }

  function reportItem(r, list, status) {
    var tt = r.targetType;
    var typeLabel = tt === 'project' ? '게시글' : (tt === 'board_post' ? '커뮤니티글' : '메이커');
    var item = el('div', { class: 'wza-item' + (r.status === 'open' ? ' wza-item--warn' : '') });

    var body = el('div', { class: 'wza-item__body' });

    // 제목 줄: 대상(메이커/게시글/커뮤니티글) + 대상 라벨(사용자값) + 상태
    var title = el('div', { class: 'wza-item__title' });
    title.appendChild(el('span', { class: 'wza-badge wza-badge--proxy' }, typeLabel));
    // 대상 라벨(사용자값) — textContent 로 안전 삽입. 링크 가능하면 a, 아니면 span.
    var hasTarget = r.targetId != null && r.targetId !== '';
    if (hasTarget) {
      var href = (tt === 'project' ? '/detail.html?id=' : tt === 'board_post' ? '/board.html?post=' : '/maker.html?id=') + encodeURIComponent(r.targetId);
      var link = el('a', { class: 'wza-report__target', href: href, target: '_blank', rel: 'noopener' });
      link.appendChild(document.createTextNode(r.targetLabel || (typeLabel + ' 보기')));
      title.appendChild(link);
    } else {
      title.appendChild(el('span', { class: 'wza-report__target' }, r.targetLabel || '-'));
    }
    body.appendChild(title);

    // 사유 + 신고자 + 일시
    var meta = el('div', { class: 'wza-item__meta' + (r.status === 'open' ? ' wza-item__meta--warn' : '') });
    meta.appendChild(document.createTextNode('사유: '));
    meta.appendChild(el('b', {}, reportReasonLabel(r.reasonCategory)));
    meta.appendChild(document.createTextNode(' · 신고자 '));
    meta.appendChild(document.createTextNode(r.reporterNickname || '-'));
    meta.appendChild(document.createTextNode(' · ' + fmtDateTime(r.createdAt)));
    if (r.status !== 'open' && r.resolvedAt) meta.appendChild(document.createTextNode(' · 처리 ' + fmtDateTime(r.resolvedAt)));
    body.appendChild(meta);

    // 상세 사유(사용자값) — 있으면 별도 줄
    if (r.detail) {
      var det = el('div', { class: 'wza-report__detail' });
      det.appendChild(document.createTextNode(r.detail));
      body.appendChild(det);
    }
    item.appendChild(body);

    var actions = el('div', { class: 'wza-item__actions' });
    if (r.status === 'open') {
      var resolve = el('button', { class: 'wza-btn wza-btn--primary', type: 'button' }, '처리완료');
      resolve.addEventListener('click', function () { resolveReport(r, 'resolved', list, status); });
      actions.appendChild(resolve);
      var dismiss = el('button', { class: 'wza-btn wza-btn--danger', type: 'button' }, '기각');
      dismiss.addEventListener('click', function () { resolveReport(r, 'dismissed', list, status); });
      actions.appendChild(dismiss);
    } else {
      actions.appendChild(reportStatusBadge(r.status));
    }
    item.appendChild(actions);
    return item;
  }

  function resolveReport(r, status, list, listStatus) {
    var isResolve = status === 'resolved';
    confirmModal({
      title: isResolve ? '신고 처리완료' : '신고 기각',
      desc: isResolve
        ? '이 신고를 처리완료로 표시합니다.'
        : '이 신고를 기각(조치 없음) 처리합니다.',
      okLabel: isResolve ? '처리완료' : '기각',
      okClass: isResolve ? 'wza-modal__btn--primary' : 'wza-modal__btn--danger',
      onOk: async function () {
        await window.api.post('/admin/reports/' + encodeURIComponent(r.id) + '/resolve', { status: status });
        bumpBadge('reports', -1);
        loadReports(list, listStatus); loadBadges();
      },
    });
  }

  /* ============================================================
   * 7) 문의 채팅 (SPA 내 통합)
   *   방 목록: GET /api/chat/admin/rooms → { items:[room], total }
   *   메시지:  GET /api/chat/admin/rooms/:id/messages → [msg]
   *   전송:    POST /api/chat/admin/rooms/:id/messages { message }
   *   읽음:    POST /api/chat/admin/rooms/:id/read
   *   실시간: 소켓(/chat)이 가능하면 사용, 불가 시 폴링으로 갱신.
   *   탭을 떠나면 leaveSection 으로 폴링·소켓 정리.
   * ============================================================ */
  function renderChat(panel) {
    panel.appendChild(panelHead('문의 채팅', '사용자의 1:1 문의에 답변합니다. 왼쪽에서 대화를 선택하세요.'));

    var state = { rooms: [], activeId: null, me: null, socket: null, pollTimer: null, msgPollTimer: null };

    var wrap = el('div', { class: 'wza-chat' });
    var roomsCol = el('div', { class: 'wza-chat__rooms' });
    var roomsHead = el('div', { class: 'wza-chat__roomshead' },
      el('span', {}, '대화 목록'), el('span', { class: 'wza-chat__count' }, '0'));
    var roomsList = el('div', { class: 'wza-chat__roomlist' });
    roomsCol.appendChild(roomsHead); roomsCol.appendChild(roomsList);

    var convo = el('div', { class: 'wza-chat__convo' });
    var convoHead = el('div', { class: 'wza-chat__convohead' }, '대화를 선택하세요');
    var msgsEl = el('div', { class: 'wza-chat__msgs' });
    convo.appendChild(convoHead); convo.appendChild(msgsEl);

    wrap.appendChild(roomsCol); wrap.appendChild(convo);
    panel.appendChild(wrap);

    var countEl = roomsHead.querySelector('.wza-chat__count');

    // ── 정리(탭 떠남) ──
    leaveSection = function () {
      if (state.pollTimer) clearInterval(state.pollTimer);
      if (state.msgPollTimer) clearInterval(state.msgPollTimer);
      if (state.socket) { try { state.socket.disconnect(); } catch (_) {} state.socket = null; }
    };

    chatStart();

    async function chatStart() {
      roomsList.appendChild(loadingNode());
      try {
        state.me = await window.api.get('/admin/me');
      } catch (_) { state.me = null; }
      await loadRooms();
      tryConnectSocket();
      // 폴링(소켓 유무와 무관하게 가벼운 백업 갱신)
      state.pollTimer = setInterval(function () { loadRooms(true); }, 8000);
    }

    async function loadRooms(silent) {
      try {
        var res = await window.api.get('/chat/admin/rooms?limit=100');
        state.rooms = (res && res.items) || [];
        sortRooms();
        renderRooms();
      } catch (e) {
        if (!silent) { roomsList.textContent = ''; roomsList.appendChild(errorNode(e)); }
      }
    }

    function sortRooms() {
      state.rooms.sort(function (a, b) {
        var ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        var tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return tb - ta;
      });
    }

    function renderRooms() {
      countEl.textContent = String(state.rooms.length);
      roomsList.textContent = '';
      if (!state.rooms.length) { roomsList.appendChild(emptyNode('아직 문의한 사용자가 없습니다.')); return; }
      state.rooms.forEach(function (room) {
        var item = el('div', { class: 'wza-chat__room' + (state.activeId === room.id ? ' is-active' : '') });
        var av = el('div', { class: 'wza-chat__avatar' }, (room.userName || 'U').charAt(0));
        var body = el('div', { class: 'wza-chat__roombody' });
        var top = el('div', { class: 'wza-chat__roomtop' });
        top.appendChild(el('span', { class: 'wza-chat__roomname' }, room.userName || '(이름 없음)'));
        top.appendChild(el('span', { class: 'wza-chat__roomtime' }, fmtRoomTime(room.lastMessageAt || room.updatedAt)));
        var bot = el('div', { class: 'wza-chat__roombot' });
        bot.appendChild(el('span', { class: 'wza-chat__roomlast' }, room.lastMessage || '(아직 메시지 없음)'));
        if (Number(room.unreadAdminCount) > 0) bot.appendChild(el('span', { class: 'wza-chat__unread' }, String(room.unreadAdminCount)));
        body.appendChild(top); body.appendChild(bot);
        item.appendChild(av); item.appendChild(body);
        item.addEventListener('click', function () { selectRoom(room.id); });
        roomsList.appendChild(item);
      });
    }

    async function selectRoom(roomId) {
      state.activeId = roomId;
      renderRooms();
      if (state.msgPollTimer) clearInterval(state.msgPollTimer);
      var room = roomById(roomId);
      convoHead.textContent = (room && room.userName ? room.userName + ' 님과의 대화' : '대화');
      msgsEl.textContent = ''; msgsEl.appendChild(loadingNode());
      await loadMessages(roomId, true);
      // 읽음 처리 + 목록 unread 클리어 + 사이드바 chat 배지 감소(읽은 만큼)
      var wasUnread = (function () { var rr = roomById(roomId); return rr ? (Number(rr.unreadAdminCount) || 0) : 0; })();
      try { await window.api.post('/chat/admin/rooms/' + encodeURIComponent(roomId) + '/read', {}); } catch (_) {}
      state.rooms = state.rooms.map(function (r) { return r.id === roomId ? Object.assign({}, r, { unreadAdminCount: 0 }) : r; });
      renderRooms();
      if (wasUnread > 0) bumpBadge('chat', -wasUnread);
      // 소켓 join + 활성 방 메시지 폴링(소켓 미연결 대비)
      if (state.socket) { try { state.socket.emit('admin:join', roomId); } catch (_) {} }
      state.msgPollTimer = setInterval(function () { if (state.activeId === roomId) loadMessages(roomId, true); }, 5000);
    }

    async function loadMessages(roomId, keepScroll) {
      try {
        var msgs = await window.api.get('/chat/admin/rooms/' + encodeURIComponent(roomId) + '/messages?limit=200');
        if (state.activeId !== roomId) return;
        renderMessages(Array.isArray(msgs) ? msgs : []);
      } catch (e) {
        msgsEl.textContent = ''; msgsEl.appendChild(errorNode(e));
      }
    }

    function renderMessages(msgs) {
      var nearBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 80;
      msgsEl.textContent = '';
      var bodyWrap = el('div', { class: 'wza-chat__msglist' });
      var lastDay = null;
      msgs.forEach(function (m) {
        if (!sameDay(lastDay, m.createdAt)) {
          bodyWrap.appendChild(el('div', { class: 'wza-chat__day' }, fmtDay(m.createdAt)));
          lastDay = m.createdAt;
        }
        var mine = String(m.senderRole || '').toUpperCase() === 'ADMIN';
        var rowEl = el('div', { class: 'wza-chat__msgrow ' + (mine ? 'me' : 'them') });
        if (!mine) rowEl.appendChild(el('div', { class: 'wza-chat__msgav' }, 'U'));
        rowEl.appendChild(el('div', { class: 'wza-chat__bubble' }, m.message || ''));
        rowEl.appendChild(el('span', { class: 'wza-chat__msgtime' }, fmtMsgTime(m.createdAt)));
        bodyWrap.appendChild(rowEl);
      });
      msgsEl.appendChild(bodyWrap);

      // 입력창(한 번만 생성)
      var input = convo.querySelector('.wza-chat__input');
      if (!input) {
        input = el('div', { class: 'wza-chat__input' });
        var txt = el('input', { class: 'wza-chat__textinput', type: 'text', maxlength: '2000', placeholder: '메시지를 입력하세요' });
        var send = el('button', { class: 'wza-chat__send', type: 'button', 'aria-label': '전송', html: ICON.send });
        function doSend() { sendMessage(txt); }
        txt.addEventListener('keydown', function (e) { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
        send.addEventListener('click', doSend);
        input.appendChild(txt); input.appendChild(send);
        convo.appendChild(input);
      }
      if (nearBottom) msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    async function sendMessage(txt) {
      var msg = (txt.value || '').trim();
      if (!msg || !state.activeId) return;
      txt.value = '';
      var roomId = state.activeId;
      // 소켓 가능하면 소켓으로(서버가 message:new 브로드캐스트). 아니면 REST.
      var sentViaSocket = false;
      if (state.socket && state.socket.connected) {
        try { state.socket.emit('message:send', { roomId: roomId, message: msg }); sentViaSocket = true; } catch (_) {}
      }
      if (!sentViaSocket) {
        try {
          await window.api.post('/chat/admin/rooms/' + encodeURIComponent(roomId) + '/messages', { message: msg });
          await loadMessages(roomId, true);
        } catch (e) { alertModal('전송 실패', (e && e.message) || '메시지를 보내지 못했습니다.'); txt.value = msg; }
      }
      loadRooms(true);
      setTimeout(function () { txt.focus(); }, 0);
    }

    // 실시간 수신/송신용 소켓. 인증은 httpOnly accessToken 쿠키로(withCredentials) — JS 로 토큰을 못 읽으므로.
    // 연결 후 selectRoom 이 admin:join 으로 해당 방에 합류. 실패해도 폴링이 받쳐줌.
    function tryConnectSocket() {
      if (typeof window.io !== 'function') return;
      try {
        var socket = window.io({ withCredentials: true, transports: ['websocket', 'polling'] });
        // 연결되면 현재 보고 있는 방에 재합류(연결 끊겼다 재연결 시에도).
        socket.on('connect', function () { if (state.activeId) { try { socket.emit('admin:join', state.activeId); } catch (_) {} } });
        socket.on('message:new', function (m) {
          if (!m) return;
          if (state.activeId && m.roomId === state.activeId) loadMessages(state.activeId, true);
          loadRooms(true);
        });
        socket.on('connect_error', function () { /* 폴링으로 충분 — 표시 안 함 */ });
        state.socket = socket;
      } catch (_) { state.socket = null; }
    }

    function roomById(id) { for (var i = 0; i < state.rooms.length; i++) if (state.rooms[i].id === id) return state.rooms[i]; return null; }
  }

  function sameDay(a, b) {
    if (!a || !b) return false;
    var da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  }
  function fmtDay(s) {
    var d = new Date(s); if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.';
  }
  function fmtMsgTime(s) {
    var d = new Date(s); if (isNaN(d.getTime())) return '';
    var h = d.getHours(); var m = String(d.getMinutes()).padStart(2, '0');
    var ampm = h >= 12 ? '오후' : '오전'; h = h % 12 || 12;
    return ampm + ' ' + h + ':' + m;
  }
  function fmtRoomTime(s) {
    if (!s) return '';
    var d = new Date(s); if (isNaN(d.getTime())) return '';
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return fmtMsgTime(s);
    return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
  }

  /* ============================================================
   * 8) 로그·오류
   * ============================================================ */
  // 디자인하기 라이브러리 관리 — 무료 디자인 / 자수 패치 추가·삭제.
  function renderLibrary(panel) {
    panel.appendChild(panelHead('디자인 · 패치 관리', '디자인하기 에디터의 "무료 디자인"·"자수 패치"를 추가/삭제합니다. 배경 투명 PNG 권장(5MB 미만).'));
    var state = { kind: 'free' };
    var KINDS = [{ k: 'free', label: '무료 디자인' }, { k: 'patch', label: '자수 패치' }];
    var chips = el('div', { class: 'wza-chips' });
    KINDS.forEach(function (t) {
      var chip = el('button', { class: 'wza-chip' + (t.k === state.kind ? ' is-active' : ''), type: 'button' }, t.label);
      chip.addEventListener('click', function () {
        state.kind = t.k;
        chips.querySelectorAll('.wza-chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active'); load();
      });
      chips.appendChild(chip);
    });
    panel.appendChild(chips);

    var form = el('div', { class: 'wza-libform' });
    var nameIn = el('input', { class: 'wza-input', type: 'text', placeholder: '이름(예: 별, A 패치)', maxlength: '40' });
    var fileIn = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', class: 'wza-libfile' });
    var addBtn = el('button', { class: 'wza-btn wza-btn--primary', type: 'button' }, '추가');
    addBtn.addEventListener('click', function () {
      var f = fileIn.files && fileIn.files[0];
      if (!f) { alert('이미지를 선택해 주세요'); return; }
      if (f.size > 5 * 1024 * 1024) { alert('이미지는 5MB 미만만 가능합니다'); return; }
      var fr = new FileReader();
      fr.onload = function () {
        addBtn.disabled = true;
        window.api.post('/admin/library', { kind: state.kind, name: nameIn.value.trim(), image: fr.result })
          .then(function () { nameIn.value = ''; fileIn.value = ''; load(); })
          .catch(function (e) { alert('추가 실패: ' + ((e && e.message) || '오류')); })
          .finally(function () { addBtn.disabled = false; });
      };
      fr.onerror = function () { alert('이미지를 읽지 못했습니다'); };
      fr.readAsDataURL(f);
    });
    form.append(nameIn, fileIn, addBtn);
    panel.appendChild(form);

    var slot = el('div', {}); panel.appendChild(slot);
    function load() {
      slot.replaceChildren(el('div', { class: 'wza-muted' }, '불러오는 중…'));
      window.api.get('/library?kind=' + state.kind).then(function (res) {
        var items = (res && res.items) || [];
        slot.replaceChildren();
        if (!items.length) { slot.appendChild(el('div', { class: 'wza-muted' }, '등록된 항목이 없어요. 위에서 추가하세요.')); return; }
        var grid = el('div', { class: 'wza-libgrid' });
        items.forEach(function (it) {
          var cell = el('div', { class: 'wza-libitem' });
          cell.append(el('div', { class: 'wza-libimg' }, el('img', { src: it.image, alt: it.name || '', loading: 'lazy' })), el('div', { class: 'wza-libname' }, it.name || ''));
          var del = el('button', { class: 'wza-libdel', type: 'button', title: '삭제' }, '×');
          del.addEventListener('click', function () { if (!confirm('「' + (it.name || '') + '」 삭제할까요?')) return; window.api.del('/admin/library/' + it.id).then(load).catch(function () { alert('삭제 실패'); }); });
          cell.appendChild(del);
          grid.appendChild(cell);
        });
        slot.appendChild(grid);
      }).catch(function () { slot.replaceChildren(el('div', { class: 'wza-muted' }, '불러오지 못했어요.')); });
    }
    load();
  }

  function renderLogs(panel) {
    panel.appendChild(panelHead('로그·오류', '시스템 감사 로그(audit_logs)를 최신순으로 봅니다. 오류는 적색으로 강조됩니다.'));
    var state = { level: 'all' };
    var LEVELS = [{ k: 'all', label: '전체' }, { k: 'error', label: '오류' }, { k: 'warn', label: '경고' }, { k: 'info', label: '정보' }];
    var chips = el('div', { class: 'wza-chips' });
    LEVELS.forEach(function (lv) {
      var chip = el('button', { class: 'wza-chip' + (lv.k === state.level ? ' is-active' : ''), type: 'button' }, lv.label);
      chip.addEventListener('click', function () {
        state.level = lv.k;
        chips.querySelectorAll('.wza-chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        loadLogs(slot, state.level);
      });
      chips.appendChild(chip);
    });
    panel.appendChild(chips);
    var slot = el('div', {}); panel.appendChild(slot);
    // 알림처럼: 탭을 열면 먼저 목록을 보여준 뒤(새 에러는 적색) 미확인 에러를 자동 확인 처리 → 배지 0.
    // 다음 방문부터 그 에러들은 흐리게(확인됨) 표시되고, 새로 들어온 것만 적색으로 부각.
    loadLogs(slot, state.level).then(function () {
      window.api.post('/admin/logs/ack-all', {}).then(function () { setBadgeFor('logs', 0); }).catch(function () {});
    });
  }

  async function loadLogs(slot, level) {
    slot.textContent = ''; slot.appendChild(loadingNode());
    try {
      var res = await window.api.get('/admin/logs?level=' + encodeURIComponent(level) + '&limit=100');
      var items = (res && res.items) || [];
      slot.textContent = '';
      if (!items.length) { slot.appendChild(emptyNode('표시할 로그가 없습니다.')); return; }
      var wrap = el('div', { class: 'wza-tablewrap' });
      var table = el('table', { class: 'wza-table' });
      table.appendChild(el('thead', {}, el('tr', {},
        el('th', {}, '시각'), el('th', {}, '레벨'), el('th', {}, '소스'), el('th', {}, '메시지'))));
      var tbody = el('tbody', {});
      items.forEach(function (lg) { tbody.appendChild(logRow(lg)); });
      table.appendChild(tbody);
      wrap.appendChild(table); slot.appendChild(wrap);
    } catch (e) { slot.textContent = ''; slot.appendChild(errorNode(e)); }
  }

  function logRow(lg) {
    var lvl = String(lg.level || 'info').toLowerCase();
    var tr = el('tr', { class: lvl === 'error' ? 'is-error' : '' });
    tr.appendChild(el('td', { class: 'wza-table__muted', style: 'white-space:nowrap' }, fmtDateTime(lg.createdAt)));
    var lvlClass = lvl === 'error' ? 'wza-lvl--error' : (lvl === 'warn' ? 'wza-lvl--warn' : 'wza-lvl--info');
    tr.appendChild(el('td', {}, el('span', { class: 'wza-lvl ' + lvlClass }, lvl.toUpperCase())));
    tr.appendChild(el('td', { class: 'wza-table__muted' }, lg.source || '-'));

    var msgTd = el('td', {});
    msgTd.appendChild(el('div', { class: 'wza-table__name', style: 'font-weight:600' }, lg.message || '-'));
    var meta = lg.meta;
    var hasMeta = meta && typeof meta === 'object' && Object.keys(meta).length > 0;
    if (hasMeta || lg.userId) {
      var box = el('div', { class: 'wza-meta' });
      var toggle = el('button', { class: 'wza-meta__toggle', type: 'button' }, 'meta 보기');
      var pre = el('pre', { class: 'wza-meta__pre' });
      var metaObj = {};
      if (lg.userId) metaObj.userId = lg.userId;
      if (hasMeta) Object.keys(meta).forEach(function (k) { metaObj[k] = meta[k]; });
      try { pre.textContent = JSON.stringify(metaObj, null, 2); } catch (_) { pre.textContent = String(metaObj); }
      toggle.addEventListener('click', function () {
        var open = box.classList.toggle('is-open');
        toggle.textContent = open ? 'meta 닫기' : 'meta 보기';
      });
      box.appendChild(toggle); box.appendChild(pre);
      msgTd.appendChild(box);
    }
    tr.appendChild(msgTd);
    // 알림식 확인: 이전에 본(확인된) 에러는 흐리게(is-ack, 적색 해제), 새로 들어온 에러는 적색.
    // 확인은 탭을 여는 순간 자동 처리(renderLogs 에서 ack-all) — 별도 버튼 없음.
    if (lg.acknowledgedAt) tr.classList.add('is-ack');
    return tr;
  }

  /* ============================================================
   * 모달 (확인 / 사유 입력) — 공용
   * ============================================================ */
  function modalBack() {
    var back = el('div', { class: 'wza-modal-back' });
    back.addEventListener('click', function (e) { if (e.target === back) back.remove(); });
    document.addEventListener('keydown', function onEsc(ev) {
      if (ev.key === 'Escape') { back.remove(); document.removeEventListener('keydown', onEsc); }
    });
    return back;
  }

  function confirmModal(opts) {
    var back = modalBack();
    var modal = el('div', { class: 'wza-modal' });
    modal.appendChild(el('div', { class: 'wza-modal__title' }, opts.title));
    modal.appendChild(el('p', { class: 'wza-modal__desc' }, opts.desc));
    if (opts.note) modal.appendChild(el('p', { class: 'wza-modal__note' }, opts.note));
    var act = el('div', { class: 'wza-modal__actions' });
    var cancel = el('button', { class: 'wza-modal__btn wza-modal__btn--ghost', type: 'button' }, '취소');
    cancel.addEventListener('click', function () { back.remove(); });
    var ok = el('button', { class: 'wza-modal__btn ' + (opts.okClass || 'wza-modal__btn--primary'), type: 'button' }, opts.okLabel || '확인');
    ok.addEventListener('click', async function () {
      ok.disabled = true; cancel.disabled = true; ok.textContent = '처리 중…';
      try { await opts.onOk(); back.remove(); }
      catch (e) { ok.disabled = false; cancel.disabled = false; ok.textContent = opts.okLabel || '확인'; alertModal('실패', (e && e.message) || '처리에 실패했습니다.'); }
    });
    act.appendChild(cancel); act.appendChild(ok); modal.appendChild(act);
    back.appendChild(modal); document.body.appendChild(back);
  }

  function reasonModal(opts) {
    var back = modalBack();
    var modal = el('div', { class: 'wza-modal' });
    modal.appendChild(el('div', { class: 'wza-modal__title' }, opts.title));
    modal.appendChild(el('p', { class: 'wza-modal__desc' }, opts.desc));
    var ta = el('textarea', { placeholder: opts.placeholder || '사유 (선택)', maxlength: '500' });
    modal.appendChild(ta);
    var act = el('div', { class: 'wza-modal__actions' });
    var cancel = el('button', { class: 'wza-modal__btn wza-modal__btn--ghost', type: 'button' }, '취소');
    cancel.addEventListener('click', function () { back.remove(); });
    var ok = el('button', { class: 'wza-modal__btn ' + (opts.okClass || 'wza-modal__btn--primary'), type: 'button' }, opts.okLabel || '확인');
    ok.addEventListener('click', async function () {
      ok.disabled = true; cancel.disabled = true; ok.textContent = '처리 중…';
      try { await opts.onOk((ta.value || '').trim()); back.remove(); }
      catch (e) { ok.disabled = false; cancel.disabled = false; ok.textContent = opts.okLabel || '확인'; alertModal('실패', (e && e.message) || '처리에 실패했습니다.'); }
    });
    act.appendChild(cancel); act.appendChild(ok); modal.appendChild(act);
    back.appendChild(modal); document.body.appendChild(back);
    setTimeout(function () { ta.focus(); }, 0);
  }

  // 다중 필드 입력 모달. fields: [{key,label,type:'text'|'number'|'textarea',value,placeholder}]. onOk(values)→Promise.
  function formModal(opts) {
    var back = modalBack();
    var modal = el('div', { class: 'wza-modal' });
    modal.appendChild(el('div', { class: 'wza-modal__title' }, opts.title));
    if (opts.desc) modal.appendChild(el('p', { class: 'wza-modal__desc' }, opts.desc));
    var inputs = {};
    (opts.fields || []).forEach(function (f) {
      modal.appendChild(el('label', { class: 'wza-flabel' }, f.label));
      var inp;
      if (f.type === 'textarea') inp = el('textarea', { placeholder: f.placeholder || '', maxlength: String(f.maxlength || 1000) });
      else inp = el('input', { class: 'wza-finput', type: f.type === 'number' ? 'number' : 'text', placeholder: f.placeholder || '', maxlength: String(f.maxlength || 100) });
      if (f.value != null) inp.value = f.value;
      inputs[f.key] = inp;
      modal.appendChild(inp);
    });
    var act = el('div', { class: 'wza-modal__actions' });
    var cancel = el('button', { class: 'wza-modal__btn wza-modal__btn--ghost', type: 'button' }, '취소');
    cancel.addEventListener('click', function () { back.remove(); });
    var ok = el('button', { class: 'wza-modal__btn ' + (opts.okClass || 'wza-modal__btn--primary'), type: 'button' }, opts.okLabel || '확인');
    ok.addEventListener('click', async function () {
      var values = {}; Object.keys(inputs).forEach(function (k) { values[k] = (inputs[k].value || '').trim(); });
      ok.disabled = true; cancel.disabled = true; ok.textContent = '처리 중…';
      try { await opts.onOk(values); back.remove(); }
      catch (e) { ok.disabled = false; cancel.disabled = false; ok.textContent = opts.okLabel || '확인'; alertModal('실패', (e && e.message) || '처리에 실패했습니다.'); }
    });
    act.appendChild(cancel); act.appendChild(ok); modal.appendChild(act);
    back.appendChild(modal); document.body.appendChild(back);
    setTimeout(function () { var first = inputs[Object.keys(inputs)[0]]; if (first) first.focus(); }, 0);
  }

  function alertModal(title, msg) {
    var back = modalBack();
    var modal = el('div', { class: 'wza-modal' });
    modal.appendChild(el('div', { class: 'wza-modal__title' }, title));
    modal.appendChild(el('p', { class: 'wza-modal__desc' }, msg));
    var act = el('div', { class: 'wza-modal__actions' });
    var ok = el('button', { class: 'wza-modal__btn wza-modal__btn--primary', type: 'button' }, '확인');
    ok.addEventListener('click', function () { back.remove(); });
    act.appendChild(ok); modal.appendChild(act);
    back.appendChild(modal); document.body.appendChild(back);
  }
})();
