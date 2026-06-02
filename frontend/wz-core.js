/* =====================================================================
 * 두띵 — 와디즈 클론 공통 셸 (from scratch). 전역 WZ 로 노출.
 * 데이터/로직만 재사용: window.api(api.js), window.DT_CATEGORIES(categories.js),
 *   window.categoryIconSvg(category-icons.js), window.MOCK_PRODUCTS·calcAchievementRate(mock-data.js)
 * 이모지 금지 — 아이콘은 인라인 SVG(stroke=currentColor).
 * ===================================================================== */
(function () {
  /* 앱(Capacitor) 전용: 같은-origin <a> 클릭을 WebView 안에서 이동시킨다.
   * Capacitor 는 .linkActivated(앵커 클릭) 같은-origin 도 일부 환경에서 외부 브라우저로 내보내는데,
   * location.assign 은 navigationType 이 .other 라 항상 WebView 안에서 열린다.
   * target=_blank / 크로스-origin / 이미 처리된(preventDefault) 클릭은 건드리지 않는다(외부 열기 유지).
   * 웹(브라우저)에선 비활성 → 데스크톱 cmd+클릭 새탭 등 기본 동작 보존. */
  (function inAppLinkRouter() {
    var isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (!isApp) return;
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var t = (a.getAttribute('target') || '').toLowerCase();
      if (t === '_blank' || t === '_system') return; // 의도적 외부 열기 유지
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(href)) return;
      var url;
      try { url = new URL(a.href, location.href); } catch (_) { return; }
      if (url.origin !== location.origin) return; // 크로스-origin 은 Capacitor 가 외부로
      e.preventDefault();
      location.assign(url.href); // 같은-origin → WebView 내 이동 강제
    }, false);
  })();

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
  /* 마감까지 남은 일수 — 한국시간(KST, UTC+9) 캘린더 날짜 기준.
   * 서버(버지니아=UTC)·뷰어 타임존과 무관하게 항상 KST 로 계산 → 카드(밖)·상세(안) D-day 가 항상 일치.
   * 반환: 정수(0=오늘 마감, 1=내일=D-1, ...), 마감 지났으면 음수, deadline 없으면 null. */
  function dday(deadline) {
    if (!deadline) return null;
    const ms = new Date(deadline).getTime();
    if (!isFinite(ms)) return null;
    const KST = 9 * 3600000;
    const dayOf = (t) => Math.floor((t + KST) / 86400000); // KST 캘린더 일(epoch day)
    return dayOf(ms) - dayOf(Date.now());
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
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>',
  };

  /* 로그인 상태 — 직전 로그인 여부를 localStorage 플래그(dt_authed)로 캐싱해
   * 새로고침 시 헤더 우측 깜빡임(로그인링크↔프로필) 제거. */
  const AUTH_FLAG = 'dt_authed';
  function wasAuthed() { try { return localStorage.getItem(AUTH_FLAG) === '1'; } catch (_) { return false; } }
  function setAuthed(v) {
    try { if (v) localStorage.setItem(AUTH_FLAG, '1'); else localStorage.removeItem(AUTH_FLAG); } catch (_) {}
  }
  let _me;
  async function fetchMe() {
    if (_me !== undefined) return _me;
    try { _me = await window.api.get('/auth/me', { silentAuthFail: true }); }
    catch (_) { _me = null; }
    setAuthed(!!_me); // 확정 결과로 캐시 갱신/삭제
    return _me;
  }
  function logout(e) {
    if (e) e.preventDefault();
    ['liked_', 'reserved_', 'paid_', 'selectedSize_'].forEach((pre) => {
      Object.keys(localStorage).filter((k) => k.indexOf(pre) === 0).forEach((k) => localStorage.removeItem(k));
    });
    try { localStorage.removeItem('recentFunds'); } catch (_) {}
    setAuthed(false);
    // 로그아웃 후엔 운영사이트 홈(main)으로 — 랜딩은 별개 페이지라 로그인/로그아웃 흐름과 섞지 않는다.
    (window.api.post('/auth/logout', {}).catch(() => {})).finally(() => { location.href = '/main.html'; });
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

  /* 모든 떠있는 팝오버(메가패널/사용자메뉴/관심목록) 닫기 — 동시에 둘 이상 열리지 않게 */
  function closeAllPops() {
    document.querySelectorAll('.wz-mega, .wz-usermenu, .wz-likedpop').forEach((n) => n.remove());
    document.querySelectorAll('.wz-hd__menubtn[aria-expanded="true"], .wz-hd__heart[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }

  /* ============ 헤더 (상단바) ============ */
  function Header() {
    const hd = el('header', { class: 'wz-hd' });
    const top = el('div', { class: 'wz-hd__top' });

    /* 로고 (두띵 공식 로고 /assets/logo.png, 실패 시 텍스트 폴백) */
    const logo = el('a', { class: 'wz-hd__logo', href: '/main.html', 'aria-label': '두띵 홈' });
    const logoImg = el('img', { src: '/assets/logo.png', alt: 'doothing' });
    logoImg.addEventListener('error', () => { logo.textContent = 'doothing'; logo.classList.add('wz-hd__logo--text'); });
    logo.appendChild(logoImg);

    /* ☰ 메뉴 = 사용자 편의 바로가기 드롭다운(절대 카테고리 아님) */
    const menuBtn = el('button', { class: 'wz-hd__menubtn', type: 'button', 'aria-label': '바로가기 메뉴', 'aria-expanded': 'false' });
    menuBtn.innerHTML = ICON.menu + '<span>메뉴</span>';
    menuBtn.addEventListener('click', (e) => { e.stopPropagation(); openUserMenu(menuBtn); });

    const homeLink = el('a', { class: 'wz-hd__home', href: '/main.html' }, '홈');
    homeLink.addEventListener('click', (e) => { e.preventDefault(); go({}); });

    const right = el('div', { class: 'wz-hd__right' });
    function iconLink(name, label, href) {
      return el('a', { class: 'wz-hd__icon', href, 'aria-label': label, title: label, html: ICON[name] });
    }

    /* 언어 토글(KR/EN) — localStorage 'wz_lang' 저장 후 reload. wz-i18n.js 가 EN 일 때 DOM 을 번역. */
    let curLang = 'ko';
    try { curLang = localStorage.getItem('wz_lang') === 'en' ? 'en' : 'ko'; } catch (_) { /* */ }
    function switchLang(v) { try { localStorage.setItem('wz_lang', v); } catch (_) {} location.reload(); }
    const langWrap = el('div', { class: 'wz-hd__lang', role: 'group', 'aria-label': '언어 선택' });
    const koBtn = el('button', { class: 'wz-hd__langbtn' + (curLang === 'ko' ? ' is-on' : ''), type: 'button', 'data-no-i18n': '' }, 'KR');
    const enBtn = el('button', { class: 'wz-hd__langbtn' + (curLang === 'en' ? ' is-on' : ''), type: 'button', 'data-no-i18n': '' }, 'EN');
    koBtn.addEventListener('click', () => { if (curLang !== 'ko') switchLang('ko'); });
    enBtn.addEventListener('click', () => { if (curLang !== 'en') switchLang('en'); });
    langWrap.append(koBtn, enBtn);
    right.appendChild(langWrap);
    /* 헤더 하트 = 관심목록 팝오버(페이지 이동 X). 클릭 시 드롭다운 열기/닫기. */
    const heartBtn = el('button', { class: 'wz-hd__icon wz-hd__heart', type: 'button', 'aria-label': '관심 목록', title: '관심 목록', 'aria-expanded': 'false', html: ICON.heart });
    heartBtn.addEventListener('click', (e) => { e.stopPropagation(); openLikedPop(heartBtn); });
    right.appendChild(heartBtn);
    /* 종(알림) — 버튼(페이지 이동 없음). id=wz-bell 로 notification.js 가 클릭 시 wz 알림 패널 오픈.
     * 폴백: 버튼이라 notification.js 의 앵커 가로채기가 안 걸려도 여기서 직접 openNotification 호출. */
    const bell = el('button', { class: 'wz-hd__icon', type: 'button', id: 'wz-bell', 'aria-label': '알림', title: '알림', html: ICON.bell });
    bell.addEventListener('click', (e) => { e.stopPropagation(); if (typeof window.openNotification === 'function') window.openNotification(); });
    right.appendChild(bell);

    /* 인증 슬롯: 깜빡임 방지 — 직전 로그인 여부 캐시로 초기 렌더 결정.
     *   캐시 있음 → 중립 아바타 스켈레톤(빈 원형), 캐시 없음 → 빈 슬롯.
     *   로그인 안 한 사용자에게 아바타가 잘못 보이지 않고, 로그인 사용자에게 로그인 링크가 깜빡이지 않음. */
    const authSlot = el('span', { class: 'wz-hd__authslot' });
    if (wasAuthed()) {
      authSlot.appendChild(el('span', { class: 'wz-hd__avatar wz-hd__avatar--skeleton', 'aria-hidden': 'true' }));
    }
    right.appendChild(authSlot);
    right.appendChild(el('span', { class: 'wz-hd__divider' }));
    right.appendChild(el('a', { class: 'wz-hd__create', href: '/fund-create.html' }, '프로젝트 만들기'));

    top.append(logo, menuBtn, homeLink, right);
    hd.appendChild(top);

    /* 둘째 줄(텀블벅형): [☰ 카테고리] [인기] [신규] [마감임박] */
    const nav2 = el('nav', { class: 'wz-hd__nav2', 'aria-label': '둘러보기' });
    const nav2inner = el('div', { class: 'wz-hd__nav2-inner' });

    const catBtn = el('button', { class: 'wz-hd__catbtn', type: 'button', 'aria-label': '카테고리 전체', 'aria-expanded': 'false' });
    catBtn.innerHTML = ICON.grid + '<span>카테고리</span>' + '<i class="wz-hd__catchev">' + ICON.chev + '</i>';
    catBtn.addEventListener('click', (e) => { e.stopPropagation(); openCategoryMega(catBtn, hd); });
    nav2inner.appendChild(catBtn);

    [['인기', { sort: 'popular' }], ['신규', { sort: 'latest' }], ['마감임박', { sort: 'ending' }]].forEach(([label, params]) => {
      const a = el('a', { class: 'wz-hd__nav2link', href: '#' }, label);
      a.addEventListener('click', (e) => { e.preventDefault(); closeAllPops(); go(params); });
      nav2inner.appendChild(a);
    });
    // 공개예정 — 홈 인플레이스 필터 대상이 아님(go() X). 전용 브라우즈 페이지로 직접 이동.
    const soonLink = el('a', { class: 'wz-hd__nav2link wz-hd__nav2link--soon', href: '/feed.html?feed=scheduled' }, '공개예정');
    soonLink.addEventListener('click', (e) => { e.preventDefault(); closeAllPops(); location.href = '/feed.html?feed=scheduled'; });
    nav2inner.appendChild(soonLink);
    // 커뮤니티 게시판 진입(공개예정 옆)
    const boardLink = el('a', { class: 'wz-hd__nav2link wz-hd__nav2link--board', href: '/board.html' }, '게시판');
    boardLink.addEventListener('click', (e) => { e.preventDefault(); closeAllPops(); location.href = '/board.html'; });
    nav2inner.appendChild(boardLink);
    nav2.appendChild(nav2inner);
    hd.appendChild(nav2);

    fetchMe().then((me) => {
      authSlot.innerHTML = '';
      if (!me) {
        // 확정 비로그인 → 로그인/회원가입 링크 (캐시 없을 땐 슬롯이 비어 있었으므로 깜빡임 없음)
        authSlot.appendChild(el('a', { class: 'wz-hd__login', href: '/login.html?return=' + currentReturn() }, '로그인'));
        return;
      }
      const name = me.nickname || me.name || '회원';
      const av = el('button', { class: 'wz-hd__avatar', type: 'button', 'aria-label': '내 프로필 메뉴' });
      if (me.picture) { const i = el('img', { src: me.picture, alt: name }); i.addEventListener('error', () => i.remove()); av.appendChild(i); }
      else { av.style.background = 'radial-gradient(circle at 50% 38%,#c9ccd6 0 36%,transparent 38%),radial-gradient(circle at 50% 100%,#c9ccd6 0 50%,transparent 52%) , #eef0f4'; }
      av.addEventListener('click', (e) => { e.stopPropagation(); openProfileMenu(av, me); });
      authSlot.appendChild(av);
    });
    return hd;
  }

  /* ============ 헤더 하트 → 관심 목록 팝오버 ============
   * 서버 찜(GET /api/me/likes) ∩ GET /api/groupbuys 교차 = 실제 존재하는 관심 프로젝트만.
   * 미로그인이면 로그인 유도. 헤더 바깥 클릭 / Esc 로 닫힘. */
  function currentReturn() {
    return encodeURIComponent(location.pathname + location.search + location.hash);
  }
  function openLikedPop(anchor) {
    if (document.querySelector('.wz-likedpop')) { closeAllPops(); return; }
    closeAllPops();
    anchor.setAttribute('aria-expanded', 'true');

    const pop = el('div', { class: 'wz-menu wz-likedpop', role: 'dialog', 'aria-label': '관심 목록' });
    const head = el('div', { class: 'wz-likedpop__head' });
    head.append(el('strong', {}, '관심 목록'), el('a', { class: 'wz-likedpop__all', href: '/profile.html#liked' }, '전체보기'));
    pop.appendChild(head);
    const body = el('div', { class: 'wz-likedpop__body' });
    body.appendChild(el('p', { class: 'wz-likedpop__loading' }, '불러오는 중…'));
    pop.appendChild(body);

    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = (r.bottom + 8) + 'px';
    // 모바일: 하트가 헤더 중앙에 있어 우측 정렬하면 폭(300px)이 화면 왼쪽 밖으로 넘어간다 → 화면 좌우 여백에 맞춰 펼침.
    if (window.innerWidth <= 600) {
      pop.style.left = '12px'; pop.style.right = '12px'; pop.style.width = 'auto';
    } else {
      pop.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    }

    const close = (ev) => { if (!pop.contains(ev.target) && ev.target !== anchor && !anchor.contains(ev.target)) { closeAllPops(); detach(); } };
    const onKey = (ev) => { if (ev.key === 'Escape') { closeAllPops(); detach(); } };
    function detach() { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); }
    setTimeout(() => { document.addEventListener('click', close); document.addEventListener('keydown', onKey); }, 0);

    // 로그인 확인 → 내 찜 id(GET /api/me/likes) ∩ 공개 목록(GET /api/groupbuys)
    fetchMe().then((me) => {
      if (!me) { renderLikedLogin(body); return; }
      Promise.all([
        window.api.get('/me/likes', { silentAuthFail: true }).catch(() => null),
        window.api.get('/groupbuys?limit=100', { silentAuthFail: true }).catch(() => null),
      ]).then(([likesData, listData]) => {
        const ids = (likesData && Array.isArray(likesData.ids)) ? likesData.ids : [];
        if (!ids.length) { renderLikedEmpty(body); return; }
        const items = (listData && Array.isArray(listData.items)) ? listData.items : [];
        const idSet = {}; ids.forEach((id) => { idSet[String(id)] = true; });
        const liked = items.filter((p) => idSet[String(p.id)]);
        if (!liked.length) { renderLikedEmpty(body); return; }
        body.innerHTML = '';
        const list = el('div', { class: 'wz-likedpop__list' });
        liked.slice(0, 12).forEach((p) => list.appendChild(LikedRow(p)));
        body.appendChild(list);
      }).catch(() => renderLikedEmpty(body));
    }).catch(() => renderLikedEmpty(body));
  }
  function renderLikedEmpty(body) {
    body.innerHTML = '';
    const empty = el('div', { class: 'wz-likedpop__empty' });
    empty.append(el('p', {}, '관심 목록이 비어 있어요'));
    body.appendChild(empty);
  }
  /* 미로그인 — 로그인 유도(현재 페이지로 복귀). */
  function renderLikedLogin(body) {
    body.innerHTML = '';
    const box = el('div', { class: 'wz-likedpop__empty' });
    box.append(
      el('p', {}, '로그인하고 관심 프로젝트를 모아보세요'),
      el('a', { class: 'wz-btn wz-btn--primary', href: '/login.html?return=' + currentReturn() }, '로그인하기')
    );
    body.appendChild(box);
  }
  function LikedRow(p) {
    const a = el('a', { class: 'wz-likedpop__row', href: '/detail.html?id=' + encodeURIComponent(p.id) });
    const th = el('div', { class: 'wz-likedpop__thumb' });
    fillThumb(th, { imageUrl: p.coverImageUrl || '', title: p.title, category: p.category });
    const info = el('div', { class: 'wz-likedpop__info' });
    const rateVal = (typeof p.achievementRate === 'number') ? p.achievementRate : rate(p);
    info.append(
      el('p', { class: 'wz-likedpop__title' }, p.title || ''),
      el('p', { class: 'wz-likedpop__rate' }, rateVal + '% 달성')
    );
    a.append(th, info);
    return a;
  }

  /* ☰ 메뉴(상단) — 사용자 편의 바로가기 드롭다운 (카테고리 아님) */
  const USER_SHORTCUTS = [
    [['내 정보', '/settings.html#profile'], ['계정', '/settings.html#account'], ['결제수단', '/settings.html#payment'], ['배송지', '/settings.html#address'], ['알림 설정', '/settings.html#notification']],
    [['관심 프로젝트', '/profile.html#liked'], ['후원한 프로젝트', '/profile.html#backings'], ['내 메이커 페이지', '/maker.html?me=1']],
  ];
  function openUserMenu(anchor) {
    if (document.querySelector('.wz-usermenu')) { closeAllPops(); return; }
    closeAllPops();
    anchor.setAttribute('aria-expanded', 'true');
    const m = el('div', { class: 'wz-menu wz-usermenu', role: 'menu' });
    /* ☰ 바로가기 메뉴는 편의 링크만 — 로그아웃은 아바타 드롭다운(openProfileMenu)에만 둔다. */
    USER_SHORTCUTS.forEach((g) => { const sec = el('div', { class: 'wz-menu__grp' }); g.forEach(([l, h]) => sec.appendChild(el('a', { class: 'wz-menu__item', href: h }, l))); m.appendChild(sec); });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 8) + 'px'; m.style.left = Math.max(8, r.left) + 'px';
    const close = (ev) => { if (!m.contains(ev.target) && ev.target !== anchor && !anchor.contains(ev.target)) { closeAllPops(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  /* 내 프로필 아바타 드롭다운 (로그인 상태) */
  function openProfileMenu(anchor, me) {
    if (document.querySelector('.wz-usermenu')) { closeAllPops(); return; }
    closeAllPops();
    const isAdmin = String(me && me.role || '').toUpperCase() === 'ADMIN';
    const m = el('div', { class: 'wz-menu wz-usermenu', role: 'menu' });
    const head = el('a', { class: 'wz-menu__me', href: '/profile.html' });
    head.append(el('strong', {}, me && (me.nickname || me.name) || '회원'));
    if (me && me.email) head.append(el('small', {}, me.email));
    m.appendChild(head);
    const groups = [
      [['프로필', '/profile.html'], ['후원한 프로젝트', '/profile.html#backings'], ['관심 프로젝트', '/profile.html#liked'], ['내 메이커 페이지', '/maker.html?me=1']],
      /* 알림은 href 이동이 아니라 wz 알림 패널 오픈 → 아래에서 별도 처리(구 notice.html 로 가지 않음) */
      [['프로젝트 만들기', '/fund-create.html'], ['__notif__', '알림'], ['설정', '/settings.html#profile']],
    ];
    if (isAdmin) groups.push([['관리자', '/admin.html']]);
    groups.forEach((g) => {
      const sec = el('div', { class: 'wz-menu__grp' });
      g.forEach(([l, h]) => {
        if (l === '__notif__') {
          /* 알림: 다른 항목과 동일한 텍스트 링크형(.wz-menu__item). 페이지 이동 대신 wz 알림 패널 오픈. */
          const it = el('a', { class: 'wz-menu__item', href: '#' }, h);
          it.addEventListener('click', (ev) => { ev.preventDefault(); closeAllPops(); if (typeof window.openNotification === 'function') window.openNotification(); });
          sec.appendChild(it);
        } else {
          sec.appendChild(el('a', { class: 'wz-menu__item', href: h }, l));
        }
      });
      m.appendChild(sec);
    });
    const og = el('div', { class: 'wz-menu__grp' });
    const out = el('a', { class: 'wz-menu__item', href: '#' }, '로그아웃'); out.addEventListener('click', logout);
    og.appendChild(out); m.appendChild(og);
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 8) + 'px'; m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    const close = (ev) => { if (!m.contains(ev.target) && ev.target !== anchor && !anchor.contains(ev.target)) { closeAllPops(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  /* ☰ 카테고리(둘째 줄) — 아이콘 그리드 메가 패널. 클릭 시 W.go({category}) 로 홈 인플레이스 필터 */
  function openCategoryMega(anchor, hd) {
    if (document.querySelector('.wz-mega')) { closeAllPops(); return; }
    closeAllPops();
    anchor.setAttribute('aria-expanded', 'true');

    const panel = el('div', { class: 'wz-mega', role: 'menu', 'aria-label': '카테고리' });
    const inner = el('div', { class: 'wz-mega__inner' });
    const head = el('div', { class: 'wz-mega__head' });
    head.appendChild(el('span', { class: 'wz-mega__title' }, '카테고리'));
    const x = el('button', { class: 'wz-mega__close', type: 'button', 'aria-label': '닫기', html: ICON.close });
    x.addEventListener('click', () => closeAllPops());
    head.appendChild(x);
    inner.appendChild(head);

    const grid = el('div', { class: 'wz-mega__grid' });
    function cell(slug, key, label) {
      const a = el('a', { class: 'wz-mega__cell', href: '/main.html' + (slug === 'all' ? '' : '?category=' + encodeURIComponent(slug)) });
      const ic = el('div', { class: 'wz-mega__ic' });
      if (slug === 'all') ic.innerHTML = ICON.grid;
      else if (typeof window.categoryIconSvg === 'function') ic.innerHTML = window.categoryIconSvg(key);
      a.append(ic, el('span', { class: 'wz-mega__label' }, label));
      a.addEventListener('click', (e) => { e.preventDefault(); closeAllPops(); go(slug === 'all' ? { category: 'all' } : { category: slug }); });
      return a;
    }
    grid.appendChild(cell('all', 'all', '전체'));
    (window.DT_CATEGORIES || []).forEach((c) => grid.appendChild(cell(c.slug, c.key, c.label)));
    inner.appendChild(grid);
    panel.appendChild(inner);

    /* 헤더 바로 아래에 펼침(메가 패널). 위치는 헤더 하단에 고정. */
    document.body.appendChild(panel);
    const r = (hd || document.querySelector('.wz-hd')).getBoundingClientRect();
    panel.style.top = r.bottom + 'px';
    const close = (ev) => { if (!panel.contains(ev.target) && ev.target !== anchor && !anchor.contains(ev.target)) { closeAllPops(); document.removeEventListener('click', close); } };
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
    const sec = el('div', { class: 'wz-cats is-start' });
    const row = el('div', { class: 'wz-cats__row' });
    (window.DT_CATEGORIES || []).forEach((c) => {
      const a = el('a', { class: 'wz-cat', href: '/main.html?category=' + encodeURIComponent(c.slug) });
      a.addEventListener('click', (e) => { e.preventDefault(); go({ category: c.slug }); });
      const ic = el('div', { class: 'wz-cat__ic' });
      if (typeof window.categoryIconSvg === 'function') ic.innerHTML = window.categoryIconSvg(c.key);
      a.append(ic, el('span', { class: 'wz-cat__label' }, c.label));
      row.appendChild(a);
    });

    // 좌우 화살표 버튼(데스크톱) — 한 번에 약 한 화면씩 부드럽게 스크롤.
    const CHEV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
    const CHEV_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
    const prev = el('button', { class: 'wz-cats__arrow wz-cats__arrow--prev', type: 'button', 'aria-label': '이전 카테고리', 'data-no-i18n': '', html: CHEV_L });
    const next = el('button', { class: 'wz-cats__arrow wz-cats__arrow--next', type: 'button', 'aria-label': '다음 카테고리', 'data-no-i18n': '', html: CHEV_R });
    const step = () => Math.max(row.clientWidth * 0.8, 200);
    prev.addEventListener('click', () => row.scrollBy({ left: -step(), behavior: 'smooth' }));
    next.addEventListener('click', () => row.scrollBy({ left: step(), behavior: 'smooth' }));

    // 스크롤 위치에 따라 화살표 표시/숨김(시작/끝/넘침없음).
    function update() {
      const max = row.scrollWidth - row.clientWidth;
      sec.classList.toggle('is-noscroll', max <= 2);
      sec.classList.toggle('is-start', row.scrollLeft <= 1);
      sec.classList.toggle('is-end', row.scrollLeft >= max - 1);
    }
    row.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    setTimeout(update, 0); setTimeout(update, 300);

    // 마우스 드래그 스크롤(데스크톱). 터치 기기는 네이티브 스크롤을 그대로 사용.
    let down = false, moved = false, sx = 0, sl = 0;
    row.addEventListener('pointerdown', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      down = true; moved = false; sx = e.clientX; sl = row.scrollLeft; row.classList.add('is-grabbing');
    });
    row.addEventListener('pointermove', (e) => {
      if (!down) return; const dx = e.clientX - sx; if (Math.abs(dx) > 4) moved = true; row.scrollLeft = sl - dx;
    });
    const endDrag = () => { if (down) { down = false; row.classList.remove('is-grabbing'); } };
    row.addEventListener('pointerup', endDrag);
    row.addEventListener('pointerleave', endDrag);
    row.addEventListener('pointercancel', endDrag);
    // 드래그 직후의 클릭은 카테고리 이동으로 처리하지 않음(드래그=스크롤만).
    row.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);

    sec.append(row, prev, next);
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
    [['이용약관', '/terms.html'], ['개인정보처리방침', '/privacy.html'], ['프로젝트 심사 기준', '/review-policy.html'], ['공지사항', '/announcements.html'], ['고객지원', '/support.html'], ['광고 문의', '/support.html']]
      .forEach(([l, h]) => links.appendChild(el('a', { href: h }, l)));
    inner.appendChild(links);
    inner.appendChild(el('div', {}, '두띵(doothing) · 국민대학교 굿즈 크라우드펀딩 플랫폼'));
    inner.appendChild(el('div', {}, '두띵은 통신판매중개자로서 거래 당사자가 아니며, 굿즈·후원·환불 등에 대한 책임은 각 프로젝트 창작자에게 있습니다.'));
    inner.appendChild(el('div', { class: 'wz-footer__copy' }, '© 2026 doothing. All rights reserved.'));
    f.appendChild(inner);
    return f;
  }

  /* 자동 마운트: #wz-header / #wz-footer 있으면 채움 */
  /* 파비콘 — 브라우저 탭에 두띵 로고 마크 주입(1회). 이미 있으면 스킵. */
  function injectFavicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;
    head.appendChild(el('link', { rel: 'icon', type: 'image/png', href: '/assets/logo-mark.png' }));
    head.appendChild(el('link', { rel: 'apple-touch-icon', href: '/assets/logo-mark.png' }));
  }

  /* ===== 스크롤 잠금 누수 복구 워치독 =====
   * 모달은 열릴 때 html/body 의 overflow 를 hidden 으로 만들어 배경 스크롤을 잠근다.
   * 닫힘 경로에서 복원이 누락되면 페이지 스크롤이 영구히 막힌다(scrollIntoView 같은 프로그램 스크롤만 동작, 휠/터치 불가).
   * → 스크롤 잠금 모달이 하나도 없는데 overflow 가 hidden 이면 해제. 모달이 떠 있으면 절대 건드리지 않는다(정상 잠금 보존). */
  // 실제로 body/html inline overflow 를 잠그는 백드롭만 화이트리스트 — 비-잠금 오버레이/죽은 셀렉터를 넣으면
  // 워치독이 정상 잠금을 잘못 풀거나(스크롤 새어나옴) 누수를 못 풀어(영구 스크롤락) 양방향 오작동함.
  var SCROLL_LOCK_OVERLAYS = '.wzc-over, .adr-modal-back, .wzs-modal-back, .wz-mp-modal-back, .wz-rp, .bd-modal';
  function releaseStuckScroll() {
    try {
      if (document.querySelector(SCROLL_LOCK_OVERLAYS)) return; // 모달 떠 있음 → 정상 잠금, 유지
      var de = document.documentElement, b = document.body;
      if (de && de.style.overflow === 'hidden') de.style.overflow = '';
      if (b && b.style.overflow === 'hidden') b.style.overflow = '';
    } catch (_) {}
  }
  function installScrollGuard() {
    if (window.__wzScrollGuard) return;
    window.__wzScrollGuard = true;
    // 사용자가 스크롤/입력을 시도하는 순간 점검 → 누수된 잠금을 즉시 해제(모달 없을 때만)
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) {
      window.addEventListener(ev, releaseStuckScroll, { passive: true });
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) releaseStuckScroll(); });
    window.addEventListener('pageshow', releaseStuckScroll);
    window.addEventListener('focus', releaseStuckScroll);
  }

  /* ===== 맨 위로(scroll-to-top) 버튼 =====
   * 모든 wz 페이지 공통. mount() 에서 1회 주입(중복 방지 플래그).
   * 우하단 고정. 헤더/모달보다 낮은 z-index(아래 wz.css 의 .wz-totop).
   * 스크롤이 400px 이상 내려가면 노출, 클릭 시 부드럽게 최상단으로. */
  var SCROLL_TOP_THRESHOLD = 400;
  function injectScrollTop() {
    if (window.__wzTopBtn) return;
    window.__wzTopBtn = true;
    var btn = el('button', {
      class: 'wz-totop', type: 'button', 'aria-label': '맨 위로', title: '맨 위로',
      'aria-hidden': 'true', html: ICON.arrowUp,
    });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(btn);

    var shown = false;
    function sync() {
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      var next = y > SCROLL_TOP_THRESHOLD;
      if (next === shown) return; // 상태 바뀔 때만 클래스 토글(불필요 reflow 방지)
      shown = next;
      btn.classList.toggle('is-shown', shown);
      btn.setAttribute('aria-hidden', shown ? 'false' : 'true');
    }
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync, { passive: true });
    sync(); // 초기(이미 내려가 있는 상태 대비)
  }

  function mount() {
    document.body.classList.add('wz-body');
    injectFavicon();
    installScrollGuard();
    injectScrollTop();
    const h = document.getElementById('wz-header'); if (h && !h.dataset.done) { h.dataset.done = '1'; h.appendChild(Header()); }
    // 2줄 헤더의 실제 높이를 CSS 변수로 노출 — 상세 등 sticky 오프셋 계산에 사용(겹침 방지)
    function setHeaderH() { const hh = document.getElementById('wz-header'); if (hh) document.documentElement.style.setProperty('--wz-hd-h', hh.offsetHeight + 'px'); }
    setHeaderH(); window.addEventListener('resize', setHeaderH);
    const f = document.getElementById('wz-footer'); if (f && !f.dataset.done) { f.dataset.done = '1'; f.appendChild(Footer()); }
    // 알림 컨트롤러(종 배지+wz 패널)는 헤더(#wz-bell)가 그려진 뒤 1회 주입 — 모든 wz 페이지에서 종 동작.
    if (h && !document.getElementById('wz-notif-js')) {
      const ns = document.createElement('script');
      ns.id = 'wz-notif-js'; ns.src = '/notification.js'; ns.defer = true;
      document.body.appendChild(ns);
    }
    // 가입 동의 게이트(있을 때만 가드 호출)
    try { if (window.WZConsent && typeof window.WZConsent.ensure === 'function') window.WZConsent.ensure(); } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  // ── 공용 로딩 스켈레톤 — 데이터 도착 전 '틀 + shimmer' 노출(빈 화면/팝인 체감 완화). CSS 클래스는 wz.css 전역(.wz-skel 등). ──
  function skelLines(n) {
    const box = el('div', { class: 'wz-skel-lines' });
    for (let i = 0; i < (n || 2); i++) box.appendChild(el('div', { class: 'wz-skel wz-skel-line' + (i === 0 ? ' wz-skel-line--sm' : '') }));
    return box;
  }
  function skelCard() {
    const c = el('div', { class: 'wz-pcard wz-pcard--skel', 'aria-hidden': 'true' });
    c.appendChild(el('div', { class: 'wz-pcard__thumb wz-skel' }));
    c.appendChild(skelLines(3));
    return c;
  }
  function skelGrid(n) {
    const g = el('div', { class: 'wz-grid' });
    for (let i = 0; i < (n || 8); i++) g.appendChild(skelCard());
    return g;
  }
  // 기존 그리드(예: .wz-mp-grid) 의 직접 자식으로 흘려보낼 스켈레톤 카드들(프래그먼트).
  function skelCardsFrag(n) {
    const f = document.createDocumentFragment();
    for (let i = 0; i < (n || 6); i++) f.appendChild(skelCard());
    return f;
  }
  // 가로/세로 박스 한 개(임의 크기) — 상세 커버, 측면 패널 등.
  function skelBox(cls) { return el('div', { class: 'wz-skel ' + (cls || '') }); }

  window.WZ = { el, esc, money, rate, dday, ICON, fetchMe, logout, fillThumb, Header, Footer, SearchRow, CategoryCircles, CategoryMenu, go, isHome, skelLines, skelCard, skelGrid, skelCardsFrag, skelBox };
})();
