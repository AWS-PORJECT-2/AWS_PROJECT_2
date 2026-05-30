/**
 * 관리자 콘솔 (wz 디자인 시스템) — SPA. 새창 금지, 좌측 사이드 탭으로 섹션 전환.
 *
 * 진입 가드: GET /api/admin/me -> 403/에러면 "관리자 권한이 필요합니다" + 홈 링크만.
 *
 * 섹션:
 *   1) 대시보드   GET /api/admin/stats — KPI + 순수 SVG 차트(가입/펀드 추이, 카테고리, 상태 분포)
 *   2) 펀드 심사  GET /api/admin/funds?status= , POST .../approve|reject(사유)
 *   3) 입금 확인  GET /api/admin/deposits?status= , POST .../deposits/:id/confirm
 *   4) 삭제 요청  GET /api/admin/fund-delete-requests , POST .../funds/:id/delete
 *   5) 사용자     GET /api/admin/users(+클라 검색) , POST .../users/:id/role
 *   6) 로그·오류  GET /api/admin/logs?level=
 *   7) 문의 채팅  -> /admin-chat.html (별도 페이지 링크)
 *
 * 모든 응답 키는 백엔드 핸들러(admin-insights/funds/users, reward-orders) 실측값.
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
    chev:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  };

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
    { id: 'deposits',  label: '입금 확인', icon: 'deposit', render: renderDeposits },
    { id: 'deletes',   label: '삭제 요청', icon: 'trash',   render: renderDeletes },
    { id: 'users',     label: '사용자 관리', icon: 'users', render: renderUsers },
    { id: 'logs',      label: '로그·오류', icon: 'logs',    render: renderLogs },
  ];

  var root, sideEl, panelEl;
  var current = 'dashboard';
  var pendingBadgeEl = null;   // 펀드 심사 탭 배지
  var deleteBadgeEl = null;    // 삭제 요청 탭 배지

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

    sideEl = el('nav', { class: 'wza-side', 'aria-label': '관리자 섹션' });
    SECTIONS.forEach(function (s) {
      var btn = el('button', { class: 'wza-tab', type: 'button', 'data-sec': s.id });
      btn.appendChild(el('span', { class: 'wza-tab__ic', html: ICON[s.icon] }));
      btn.appendChild(document.createTextNode(s.label));
      if (s.id === 'funds') { pendingBadgeEl = el('span', { class: 'wza-tab__badge', style: 'display:none' }); btn.appendChild(pendingBadgeEl); }
      if (s.id === 'deletes') { deleteBadgeEl = el('span', { class: 'wza-tab__badge', style: 'display:none' }); btn.appendChild(deleteBadgeEl); }
      btn.addEventListener('click', function () { select(s.id); });
      sideEl.appendChild(btn);
    });
    sideEl.appendChild(el('div', { class: 'wza-side__sep' }));
    // 문의 채팅 — 별도 페이지 링크(SPA 외부)
    var chatLink = el('a', { class: 'wza-tab wza-tab--link', href: '/admin-chat.html' });
    chatLink.appendChild(el('span', { class: 'wza-tab__ic', html: ICON.chat }));
    chatLink.appendChild(document.createTextNode('문의 채팅'));
    sideEl.appendChild(chatLink);
    var ordLink = el('a', { class: 'wza-tab wza-tab--link', href: '/admin-orders.html' });
    ordLink.appendChild(el('span', { class: 'wza-tab__ic', html: ICON.box }));
    ordLink.appendChild(document.createTextNode('주문 승인'));
    sideEl.appendChild(ordLink);
    shell.appendChild(sideEl);

    panelEl = el('section', { class: 'wza-panel' });
    shell.appendChild(panelEl);

    root.appendChild(shell);
  }

  function select(id) {
    var sec = sectionById(id) || SECTIONS[0];
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
  }

  /* 사이드 탭 배지(심사대기/삭제요청 건수) — 대시보드 진입 전에도 표시 */
  async function loadBadges() {
    try {
      var s = await window.api.get('/admin/stats');
      if (pendingBadgeEl) setBadge(pendingBadgeEl, s && s.funds ? s.funds.pending_review : 0);
      if (deleteBadgeEl) setBadge(deleteBadgeEl, s && s.funds ? s.funds.deleteRequested : 0);
    } catch (_) { /* 배지는 부가 정보 — 실패해도 무시 */ }
  }
  function setBadge(node, n) {
    n = Number(n) || 0;
    if (n > 0) { node.textContent = String(n); node.style.display = ''; }
    else { node.style.display = 'none'; }
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

    // KPI
    var u = s.users || {}, f = s.funds || {}, o = s.orders || {};
    var kpis = el('div', { class: 'wza-kpis' });
    kpis.appendChild(kpiCard('전체 사용자', (u.total || 0).toLocaleString(), '신규 7일', (u.new7d || 0).toLocaleString() + '명', ''));
    kpis.appendChild(kpiCard('전체 펀드', (f.total || 0).toLocaleString(), '심사 대기', (f.pending_review || 0).toLocaleString() + '건', 'mint'));
    kpis.appendChild(kpiCard('거래액 (GMV)', money(o.gmv || 0), '입금 확정 기준', null, 'coral'));
    kpis.appendChild(kpiCard('결제 주문수', (o.paid || 0).toLocaleString(), '전체 주문', (o.total || 0).toLocaleString() + '건', 'sky'));
    slot.appendChild(kpis);

    // 차트
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
        loadFunds(list, status); loadBadges();
      },
    });
  }

  /* ============================================================
   * 3) 입금 확인
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
            loadDeposits(list, status);
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
   * 4) 삭제 요청
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
          var res = await window.api.post('/admin/funds/' + encodeURIComponent(f.id) + '/delete', {});
          var refundable = (res && res.refundable) || [];
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
   * 5) 사용자 관리
   * ============================================================ */
  function renderUsers(panel) {
    panel.appendChild(panelHead('사용자 관리', '가입한 사용자 목록과 권한을 관리합니다.'));
    var search = el('input', { class: 'wza-search', type: 'text', placeholder: '이름·이메일 검색', 'aria-label': '사용자 검색' });
    panel.appendChild(search);
    var slot = el('div', {}); panel.appendChild(slot);
    var all = [];

    function render(rows) {
      slot.textContent = '';
      if (!rows.length) { slot.appendChild(emptyNode('사용자가 없습니다.')); return; }
      var wrap = el('div', { class: 'wza-tablewrap' });
      var table = el('table', { class: 'wza-table' });
      var thead = el('thead', {}, el('tr', {},
        el('th', {}, '이름'), el('th', {}, '이메일'), el('th', {}, '권한'),
        el('th', {}, '가입일'), el('th', {}, '최근 로그인'), el('th', { class: 'wza-table__right' }, '관리')));
      table.appendChild(thead);
      var tbody = el('tbody', {});
      rows.forEach(function (u) { tbody.appendChild(userRow(u)); });
      table.appendChild(tbody);
      wrap.appendChild(table); slot.appendChild(wrap);
    }

    function filter() {
      var q = (search.value || '').trim().toLowerCase();
      if (!q) { render(all); return; }
      render(all.filter(function (u) {
        return (u.email || '').toLowerCase().indexOf(q) !== -1 || (u.name || '').toLowerCase().indexOf(q) !== -1;
      }));
    }
    search.addEventListener('input', filter);

    async function reload() {
      slot.textContent = ''; slot.appendChild(loadingNode());
      try {
        var res = await window.api.get('/admin/users');
        all = (res && res.items) || [];
        filter();
      } catch (e) { slot.textContent = ''; slot.appendChild(errorNode(e)); }
    }
    renderUsers._reload = reload;
    reload();

    function userRow(u) {
      var tr = el('tr', {});
      tr.appendChild(el('td', { class: 'wza-table__name' }, u.name || '(이름없음)'));
      tr.appendChild(el('td', {}, u.email || '-'));
      var roleTd = el('td', {});
      if ((u.role || 'USER') === 'ADMIN') roleTd.appendChild(el('span', { class: 'wza-badge wza-badge--admin' }, '관리자'));
      else roleTd.appendChild(el('span', { class: 'wza-table__muted' }, '일반'));
      tr.appendChild(roleTd);
      tr.appendChild(el('td', { class: 'wza-table__muted' }, fmtDate(u.createdAt)));
      tr.appendChild(el('td', { class: 'wza-table__muted' }, u.lastLoginAt ? fmtDate(u.lastLoginAt) : '-'));

      var actTd = el('td', { class: 'wza-table__right' });
      var makeAdmin = (u.role || 'USER') !== 'ADMIN';
      var btn = el('button', { class: 'wza-btn ' + (makeAdmin ? 'wza-btn--primary' : 'wza-btn--outline'), type: 'button' }, makeAdmin ? '관리자 지정' : '관리자 해제');
      btn.addEventListener('click', function () {
        confirmModal({
          title: makeAdmin ? '관리자 지정' : '관리자 해제',
          desc: '“' + (u.name || u.email || '사용자') + '”의 권한을 ' + (makeAdmin ? '관리자(ADMIN)' : '일반(USER)') + '(으)로 변경하시겠습니까?',
          okLabel: '변경', okClass: 'wza-modal__btn--primary',
          onOk: async function () {
            await window.api.post('/admin/users/' + encodeURIComponent(u.id) + '/role', { role: makeAdmin ? 'ADMIN' : 'USER' });
            renderUsers._reload();
          },
        });
      });
      actTd.appendChild(btn);
      tr.appendChild(actTd);
      return tr;
    }
  }

  /* ============================================================
   * 6) 로그·오류
   * ============================================================ */
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
    loadLogs(slot, state.level);
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
