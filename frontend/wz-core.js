/* =====================================================================
 * 두띵 — 와디즈 클론 공통 셸 (from scratch). 전역 WZ 로 노출.
 * 데이터/로직만 재사용: window.api(api.js), window.DT_CATEGORIES(categories.js),
 *   window.categoryIconSvg(category-icons.js), window.MOCK_PRODUCTS·calcAchievementRate(mock-data.js)
 * 이모지 금지 — 아이콘은 인라인 SVG(stroke=currentColor).
 * ===================================================================== */
(function () {
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'onClick') n.addEventListener('click', v);
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function money(n) { return (Math.max(0, Math.floor(Number(n) || 0))).toLocaleString() + '원'; }
  function rate(p) {
    if (typeof window.calcAchievementRate === 'function') return window.calcAchievementRate(p);
    if (p && p.targetQuantity > 0) return Math.round((p.currentQuantity / p.targetQuantity) * 100);
    return 0;
  }

  /* ===== 홈 단일 둘러보기 허브 라우팅 =====
   * 홈에서 인기/신규/마감임박/카테고리 클릭 → 새 페이지로 가지 않고 홈 그리드만 그 자리에서 갱신.
   * 홈이 아닌 페이지에서 클릭 → 홈(/main.html)으로 파라미터 들고 이동. */
  const HOME_PATHS = ['/main.html', '/', '/index.html'];
  function isHome() { return HOME_PATHS.indexOf(location.pathname) !== -1; }
  function go(params) {
    params = params || {};
    const qs = new URLSearchParams();
    if (params.sort) qs.set('sort', params.sort);
    if (params.category && params.category !== 'all') qs.set('category', params.category);
    const url = '/main.html' + (qs.toString() ? '?' + qs.toString() : '');
    if (isHome()) {
      try { history.pushState({}, '', url); } catch (_) {}
      window.dispatchEvent(new CustomEvent('wz:browse', { detail: params }));
    } else {
      location.href = url;
    }
  }

  const ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M3 9h18"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  };

  /* 로그인 상태 */
  let _me;
  async function fetchMe() {
    if (_me !== undefined) return _me;
    try { _me = await window.api.get('/auth/me', { silentAuthFail: true }); }
    catch (_) { _me = null; }
    return _me;
  }
  function logout(e) {
    if (e) e.preventDefault();
    ['liked_', 'reserved_', 'paid_', 'selectedSize_'].forEach((pre) => {
      Object.keys(localStorage).filter((k) => k.indexOf(pre) === 0).forEach((k) => localStorage.removeItem(k));
    });
    try { localStorage.removeItem('recentFunds'); } catch (_) {}
    (window.api.post('/auth/logout', {}).catch(() => {})).finally(() => { location.href = '/landing.html'; });
  }

  /* 썸네일 채우기 — 이미지 or 카테고리 아이콘 */
  function fillThumb(node, p) {
    if (p && p.imageUrl) {
      const img = el('img', { src: p.imageUrl, alt: p.title || '', loading: 'lazy' });
      img.addEventListener('error', () => { img.remove(); iconInto(node, p); });
      node.appendChild(img);
    } else { iconInto(node, p); }
  }
  function iconInto(node, p) {
    const key = (window.dtCategory && p && window.dtCategory(p.category)) ? window.dtCategory(p.category).key : ((p && p.category) || 'etc');
    if (typeof window.categoryIconSvg === 'function') node.innerHTML = window.categoryIconSvg(key);
  }

  /* ============ 헤더 (상단바) ============ */
  function Header() {
    const path = location.pathname;
    const hd = el('header', { class: 'wz-hd' });
    const top = el('div', { class: 'wz-hd__top' });

    const logo = el('a', { class: 'wz-hd__logo', href: '/main.html', 'aria-label': '두띵 홈' });
    const logoImg = el('img', { src: '/assets/logo.png', alt: 'doothing' });
    logoImg.addEventListener('error', () => { logo.textContent = 'doothing'; logo.classList.add('wz-hd__logo--text'); });
    logo.appendChild(logoImg);

    // ☰ 메뉴(카테고리 드롭다운) + 홈
    const menuBtn = el('button', { class: 'wz-hd__menubtn', type: 'button', 'aria-label': '카테고리 메뉴' });
    menuBtn.innerHTML = ICON.menu + '<span>메뉴</span>';
    menuBtn.addEventListener('click', (e) => { e.stopPropagation(); openCatMenu(menuBtn); });
    const homeLink = el('a', { class: 'wz-hd__home', href: '/main.html' }, '홈');
    homeLink.addEventListener('click', (e) => { e.preventDefault(); go({}); });

    const right = el('div', { class: 'wz-hd__right' });
    function iconLink(name, label, href) {
      const a = el('a', { class: 'wz-hd__icon', href, 'aria-label': label, html: ICON[name] });
      return a;
    }
    right.appendChild(iconLink('heart', '관심 프로젝트', '/profile.html?tab=likes'));
    right.appendChild(iconLink('bell', '알림', '/notice.html'));
    const authSlot = el('span', { class: 'wz-hd__authslot' });
    authSlot.appendChild(el('a', { class: 'wz-hd__login', href: '/login.html' }, '로그인/회원가입'));
    right.appendChild(authSlot);
    right.appendChild(el('span', { class: 'wz-hd__divider' }));
    right.appendChild(el('a', { class: 'wz-hd__create', href: '/fund-create.html' }, '프로젝트 만들기'));

    top.append(logo, menuBtn, homeLink, right);
    hd.appendChild(top);

    // 둘째 줄: 텀블벅형 정렬 내비 (인기/신규/마감임박) — 홈 그리드 인플레이스 갱신
    const nav2 = el('nav', { class: 'wz-hd__nav2', 'aria-label': '정렬' });
    const nav2inner = el('div', { class: 'wz-hd__nav2-inner' });
    [['인기', { sort: 'popular' }], ['신규', { sort: 'latest' }], ['마감임박', { sort: 'ending' }]].forEach(([label, params]) => {
      const a = el('a', { class: 'wz-hd__nav2link', href: '#' }, label);
      a.addEventListener('click', (e) => { e.preventDefault(); go(params); });
      nav2inner.appendChild(a);
    });
    nav2.appendChild(nav2inner);
    hd.appendChild(nav2);

    fetchMe().then((me) => {
      if (!me) return;
      authSlot.innerHTML = '';
      const name = me.nickname || me.name || '회원';
      const isAdmin = String(me.role || '').toUpperCase() === 'ADMIN';
      const av = el('button', { class: 'wz-hd__avatar', type: 'button', 'aria-label': '내 메뉴' });
      if (me.picture) { const i = el('img', { src: me.picture, alt: name }); i.addEventListener('error', () => i.remove()); av.appendChild(i); }
      else { av.style.background = 'radial-gradient(circle at 50% 38%,#c9ccd6 0 36%,transparent 38%),radial-gradient(circle at 50% 100%,#c9ccd6 0 50%,transparent 52%) , #eef0f4'; }
      av.addEventListener('click', (e) => { e.stopPropagation(); openMenu(av, name, isAdmin); });
      authSlot.appendChild(av);
    });
    return hd;
  }

  /* ☰ 메뉴 → 카테고리 드롭다운 (클릭 시 홈 그리드 필터 or 홈 이동) */
  function openCatMenu(anchor) {
    const ex = document.querySelector('.wz-catpop'); if (ex) { ex.remove(); return; }
    const m = el('div', { class: 'wz-menu wz-catpop', role: 'menu' });
    const grp = el('div', { class: 'wz-menu__grp' });
    grp.appendChild((function () { const a = el('a', { class: 'wz-menu__item', href: '/main.html' }, '전체 프로젝트'); a.addEventListener('click', (e) => { e.preventDefault(); go({ category: 'all' }); m.remove(); }); return a; })());
    (window.DT_CATEGORIES || []).forEach((c) => {
      const a = el('a', { class: 'wz-menu__item', href: '/main.html?category=' + encodeURIComponent(c.slug) }, c.label);
      a.addEventListener('click', (e) => { e.preventDefault(); go({ category: c.slug }); m.remove(); });
      grp.appendChild(a);
    });
    m.appendChild(grp);
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 8) + 'px'; m.style.left = r.left + 'px'; m.style.maxHeight = '70vh'; m.style.overflowY = 'auto';
    const close = (ev) => { if (!m.contains(ev.target) && ev.target !== anchor) { m.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  function openMenu(anchor, name, isAdmin) {
    const ex = document.querySelector('.wz-menu:not(.wz-catpop)'); if (ex) { ex.remove(); return; }
    const m = el('div', { class: 'wz-menu', role: 'menu' });
    const groups = [
      [['프로필', '/profile.html'], ['후원한 프로젝트', '/profile.html?tab=backings'], ['관심 프로젝트', '/profile.html?tab=likes']],
      [['프로젝트 만들기', '/fund-create.html'], ['알림', '/notice.html'], ['설정', '/settings.html']],
    ];
    if (isAdmin) groups.push([['관리자', '/admin.html']]);
    groups.forEach((g) => { const sec = el('div', { class: 'wz-menu__grp' }); g.forEach(([l, h]) => sec.appendChild(el('a', { class: 'wz-menu__item', href: h }, l))); m.appendChild(sec); });
    const out = el('a', { class: 'wz-menu__item', href: '#' }, '로그아웃'); out.addEventListener('click', logout);
    const og = el('div', { class: 'wz-menu__grp' }); og.appendChild(out); m.appendChild(og);
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 8) + 'px'; m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    const close = (ev) => { if (!m.contains(ev.target) && ev.target !== anchor) { m.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  /* ============ 검색바 (홈) ============ */
  function SearchRow() {
    const row = el('div', { class: 'wz-searchrow' });
    const form = el('form', { class: 'wz-search', role: 'search' });
    const input = el('input', { type: 'text', placeholder: '새로운 일상이 필요하신가요?', 'aria-label': '검색' });
    const btn = el('button', { class: 'wz-search__btn', type: 'submit', 'aria-label': '검색', html: ICON.search });
    form.append(input, btn);
    form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value.trim(); location.href = '/feed.html' + (q ? '?q=' + encodeURIComponent(q) : ''); });
    row.appendChild(form);
    return row;
  }

  /* ============ 원형 카테고리 ============ */
  function CategoryCircles() {
    const sec = el('div', { class: 'wz-cats' });
    const row = el('div', { class: 'wz-cats__row' });
    (window.DT_CATEGORIES || []).forEach((c) => {
      const a = el('a', { class: 'wz-cat', href: '/main.html?category=' + encodeURIComponent(c.slug) });
      a.addEventListener('click', (e) => { e.preventDefault(); go({ category: c.slug }); });
      const ic = el('div', { class: 'wz-cat__ic' });
      if (typeof window.categoryIconSvg === 'function') ic.innerHTML = window.categoryIconSvg(c.key);
      a.append(ic, el('span', { class: 'wz-cat__label' }, c.label));
      row.appendChild(a);
    });
    sec.appendChild(row);
    return sec;
  }

  /* ============ 텍스트 카테고리 메뉴 ============ */
  function CategoryMenu() {
    const bar = el('nav', { class: 'wz-catmenu', 'aria-label': '카테고리' });
    const inner = el('div', { class: 'wz-catmenu__inner' });
    (window.DT_CATEGORIES || []).forEach((c) => {
      const a = el('a', { href: '/main.html?category=' + encodeURIComponent(c.slug) }, c.label);
      a.addEventListener('click', (e) => { e.preventDefault(); go({ category: c.slug }); });
      inner.appendChild(a);
    });
    bar.appendChild(inner);
    return bar;
  }

  /* ============ 푸터 ============ */
  function Footer() {
    const f = el('footer', { class: 'wz-footer' });
    const inner = el('div', { class: 'wz-footer__inner' });
    const links = el('div', { class: 'wz-footer__links' });
    [['이용약관', '/terms.html'], ['개인정보처리방침', '/privacy.html'], ['프로젝트 심사 기준', '/support.html'], ['공지사항', '/announcements.html'], ['고객지원', '/support.html']]
      .forEach(([l, h]) => links.appendChild(el('a', { href: h }, l)));
    inner.appendChild(links);
    inner.appendChild(el('div', {}, '두띵(doothing) · 국민대학교 굿즈 크라우드펀딩 플랫폼'));
    inner.appendChild(el('div', {}, '두띵은 통신판매중개자로서 거래 당사자가 아니며, 굿즈·후원·환불 등에 대한 책임은 각 프로젝트 창작자에게 있습니다.'));
    inner.appendChild(el('div', { class: 'wz-footer__copy' }, '© 2026 doothing. All rights reserved.'));
    f.appendChild(inner);
    return f;
  }

  /* 자동 마운트: #wz-header / #wz-footer 있으면 채움 */
  function mount() {
    document.body.classList.add('wz-body');
    const h = document.getElementById('wz-header'); if (h && !h.dataset.done) { h.dataset.done = '1'; h.appendChild(Header()); }
    const f = document.getElementById('wz-footer'); if (f && !f.dataset.done) { f.dataset.done = '1'; f.appendChild(Footer()); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  window.WZ = { el, esc, money, rate, ICON, fetchMe, logout, fillThumb, Header, Footer, SearchRow, CategoryCircles, CategoryMenu, go, isHome };
})();
