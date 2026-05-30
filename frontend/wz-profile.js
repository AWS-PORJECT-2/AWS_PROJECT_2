/* =====================================================================
 * 두띵 — 마이페이지(와디즈 클론, from scratch). 전역 WZ(wz-core.js) 사용.
 *
 * 레이아웃: 좌측 사이드바(아바타+이름+설정 / 나의 활동 / 혜택) + 메인.
 * 메인 기본 화면: 인사 + 스탯 카드 + "최근에 봤어요" + 안내 배너.
 * 사이드바 메뉴 클릭 시 메인이 전용 패널로 전환:
 *   - 최근 본 프로젝트  = localStorage recentFunds
 *   - 후원한 프로젝트    = GET /api/me/backings
 *   - 개설한 프로젝트    = GET /api/me/funds
 *   - 미구현(간편결제/문의/팔로잉 등) = "준비 중" 비활성
 *
 * 데이터: GET /api/auth/me, /api/me/funds, /api/me/backings.
 * 미로그인은 silentAuthFail 로 무소음 처리, 로그인 유도 빈상태.
 * 이모지 금지 — 아이콘은 인라인 SVG(stroke=currentColor). 사용자값은 문자열 자식(textContent).
 * ===================================================================== */
(function () {
  var W = window.WZ;

  /* ---- 전용 아이콘(헤더와 별개로 마이페이지에서만 쓰는 것들) ---- */
  var IC = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 6.9 4.2l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1A4 4 0 0 1 16 11"/></svg>',
    heart: W.ICON.heart,
    box: W.ICON.box,
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7z"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3z"/><path d="M19 14l.8 2.2 2.2.8-2.2.8L19 20l-.8-2.2-2.2-.8 2.2-.8L19 14z"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z"/><path d="M9 6v12"/></svg>',
    coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h3.2a1.8 1.8 0 0 1 0 3.6H9.5h3.6a1.8 1.8 0 0 1 0 3.6H9.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V4M4 4h13l-2 4 2 4H4"/></svg>',
  };

  /* 사이드바 메뉴 정의. view: 메인 패널 식별자(있으면 클릭 시 전환). soon: 준비 중(비활성). href: 외부 페이지 이동. */
  var NAV = {
    activity: [
      { key: 'recent',     label: '최근 본 프로젝트',  icon: 'clock',  view: 'recent' },
      { key: 'following',  label: '팔로잉',           icon: 'users',  soon: true },
      { key: 'backings',   label: '후원한 프로젝트',  icon: 'heart',  view: 'backings' },
      { key: 'funds',      label: '개설한 프로젝트',  icon: 'box',    view: 'funds' },
      { key: 'pay',        label: '간편결제 설정',     icon: 'card',   soon: true },
      { key: 'inquiry',    label: '메이커 문의내역',   icon: 'chat',   soon: true },
      { key: 'create',     label: '프로젝트 만들기',   icon: 'plus',   href: '/fund-create.html' },
      { key: 'settings',   label: '설정',             icon: 'gear',   href: '/settings.html' },
    ],
    benefit: [
      { key: 'club',       label: '서포터클럽',       icon: 'crown',  soon: true },
      { key: 'trial',      label: '펀딩 체험단',       icon: 'sparkle', soon: true },
    ],
  };

  /* 상태(스탯/패널 공유) */
  var state = { me: null, funds: null, backings: null };
  var refs = {};

  function run() {
    var root = document.getElementById('wz-mypage');
    if (!root || !W) return;

    var wrap = W.el('div', { class: 'wz-mp' });
    var layout = W.el('div', { class: 'wz-mp__layout' });
    refs.side = W.el('aside', { class: 'wz-mp-side' });
    refs.main = W.el('div', { class: 'wz-mp-main' });
    layout.append(refs.side, refs.main);
    wrap.appendChild(layout);
    root.appendChild(wrap);

    // 사이드바 골격 즉시 렌더(데이터 없이도). 이름/아바타는 fetchMe 후 채움.
    renderSidebar();
    // 기본(홈) 패널 먼저 그림. 데이터 도착하면 갱신
    showHome();

    // 데이터 로드 (모두 silentAuthFail 로 미로그인 무소음)
    loadAll();

    // 진입 시 ?tab= 으로 패널 직접 오픈 가능(헤더 메뉴 호환: backings/likes)
    var tab = new URLSearchParams(location.search).get('tab');
    if (tab === 'backings') selectView('backings');
    else if (tab === 'funds') selectView('funds');
    else if (tab === 'likes' || tab === 'recent') selectView('recent');
  }

  /* ---- 데이터 로드 ---- */
  function loadAll() {
    W.fetchMe().then(function (me) {
      state.me = me || null;
      renderSidebar();
      if (refs.curView === 'home' || !refs.curView) refreshGreeting();
    });
    // 스탯(개설/후원 수)을 미리 채우기 위해 진입 시 silentAuthFail 로 선조회
    window.api.get('/me/funds', { silentAuthFail: true })
      .then(function (r) { state.funds = (r && r.items) || []; afterStats(); })
      .catch(function () { state.funds = state.funds || null; });
    window.api.get('/me/backings', { silentAuthFail: true })
      .then(function (r) { state.backings = (r && r.items) || []; afterStats(); })
      .catch(function () { state.backings = state.backings || null; });
  }
  function afterStats() {
    if (refs.curView === 'home' || !refs.curView) refreshStats();
  }

  /* =================== 사이드바 =================== */
  function renderSidebar() {
    var me = state.me;
    var name = me ? (me.nickname || me.name || '회원') : '';
    var side = refs.side;
    side.replaceChildren();

    // 프로필 카드
    var card = W.el('div', { class: 'wz-mp-side__card' });
    var av = W.el('div', { class: 'wz-mp-side__avatar' });
    if (me && me.picture) {
      var img = W.el('img', { src: me.picture, alt: name });
      img.addEventListener('error', function () { img.remove(); av.innerHTML = IC.user; });
      av.appendChild(img);
    } else { av.innerHTML = IC.user; }
    var nameWrap = W.el('div', { class: 'wz-mp-side__namewrap' });
    nameWrap.append(
      W.el('p', { class: 'wz-mp-side__name' }, me ? name : '로그인이 필요해요'),
      W.el('p', { class: 'wz-mp-side__email' }, me ? (me.email || '') : '로그인하고 내 활동을 확인하세요')
    );
    var setBtn = W.el('button', { class: 'wz-mp-side__settings', type: 'button', html: IC.gear + '<span>설정</span>' });
    setBtn.addEventListener('click', function () { location.href = '/settings.html'; });
    card.append(av, nameWrap, setBtn);
    side.appendChild(card);

    // 메뉴 그룹
    side.appendChild(navGroup('나의 활동', NAV.activity));
    side.appendChild(navGroup('혜택', NAV.benefit));
  }

  function navGroup(title, items) {
    var g = W.el('div', { class: 'wz-mp-side__group' });
    g.appendChild(W.el('p', { class: 'wz-mp-side__gtitle' }, title));
    var ul = W.el('ul', { class: 'wz-mp-side__list' });
    items.forEach(function (it) {
      var li = W.el('li', {});
      var btn = W.el('button', {
        class: 'wz-mp-side__btn' + (refs.curView === it.view && it.view ? ' is-active' : ''),
        type: 'button',
        html: (IC[it.icon] || ''),
      });
      btn.dataset.key = it.key;
      btn.appendChild(W.el('span', {}, it.label));
      if (it.soon) {
        btn.appendChild(W.el('span', { class: 'wz-mp-side__soon' }, '준비 중'));
        btn.disabled = true;
      } else if (it.href) {
        btn.addEventListener('click', function () { location.href = it.href; });
      } else if (it.view) {
        btn.addEventListener('click', function () { selectView(it.view); });
      }
      li.appendChild(btn);
      ul.appendChild(li);
    });
    g.appendChild(ul);
    return g;
  }

  function syncActive() {
    refs.side.querySelectorAll('.wz-mp-side__btn').forEach(function (b) {
      var item = NAV.activity.concat(NAV.benefit).find(function (n) { return n.key === b.dataset.key; });
      b.classList.toggle('is-active', !!(item && item.view && item.view === refs.curView));
    });
  }

  /* =================== 메인: 홈(기본) =================== */
  function showHome() {
    refs.curView = 'home';
    syncActive();
    var main = refs.main;
    main.replaceChildren();

    // 인사
    refs.greet = W.el('h1', { class: 'wz-mp-greet' });
    main.appendChild(refs.greet);
    refreshGreeting();

    // 스탯 카드 행
    refs.statsRow = W.el('div', { class: 'wz-mp-stats' });
    refs.walletRow = W.el('div', { class: 'wz-mp-wallet' });
    main.append(refs.statsRow, refs.walletRow);
    refreshStats();

    // 최근에 봤어요
    refs.recentSec = W.el('section', { class: 'wz-mp-sec' });
    main.appendChild(refs.recentSec);
    renderRecentSection();

    // 안내 배너
    main.appendChild(Banner());
  }

  function refreshGreeting() {
    if (!refs.greet) return;
    var me = state.me;
    var name = me ? (me.nickname || me.name || '회원') : '';
    refs.greet.replaceChildren();
    if (me) {
      refs.greet.append(W.el('b', {}, name), document.createTextNode('님, 안녕하세요'));
    } else {
      refs.greet.append(document.createTextNode('로그인하고 내 활동을 확인하세요'));
    }
  }

  function refreshStats() {
    if (!refs.statsRow) return;
    var fundsN = Array.isArray(state.funds) ? state.funds.length : 0;
    var backN = Array.isArray(state.backings) ? state.backings.length : 0;
    refs.statsRow.replaceChildren(
      statCard('펀딩+', String(fundsN), function () { selectView('funds'); }),
      statCard('스토어', String(backN), function () { selectView('backings'); }),
      statCardMore('지지서명', '보기', function () { selectView('recent'); }),
      statCardMore('알림신청', '보기', function () { location.href = '/notice.html'; })
    );
    refs.walletRow.replaceChildren(
      walletItem('coin', '포인트', '0P'),
      walletItem('ticket', '쿠폰', '0장')
    );
  }

  function statCard(label, value, onClick) {
    var c = W.el('button', { class: 'wz-mp-stat', type: 'button' });
    c.addEventListener('click', onClick);
    c.append(W.el('span', { class: 'wz-mp-stat__label' }, label), W.el('span', { class: 'wz-mp-stat__value' }, value));
    return c;
  }
  function statCardMore(label, more, onClick) {
    var c = W.el('button', { class: 'wz-mp-stat', type: 'button' });
    c.addEventListener('click', onClick);
    c.append(
      W.el('span', { class: 'wz-mp-stat__label' }, label),
      W.el('span', { class: 'wz-mp-stat__more', html: '' + W.esc(more) + IC.arrow })
    );
    return c;
  }
  function walletItem(icon, label, value) {
    return W.el('div', { class: 'wz-mp-wallet__item' },
      W.el('span', { class: 'wz-mp-wallet__label', html: IC[icon] }, W.el('span', {}, label)),
      W.el('span', { class: 'wz-mp-wallet__value' }, value));
  }

  function Banner() {
    var b = W.el('div', { class: 'wz-mp-banner' });
    b.appendChild(W.el('div', { class: 'wz-mp-banner__ic', html: IC.flag }));
    var body = W.el('div', { class: 'wz-mp-banner__body' });
    body.append(
      W.el('p', { class: 'wz-mp-banner__title' }, '나만의 굿즈, 직접 만들어볼까요?'),
      W.el('p', { class: 'wz-mp-banner__desc' }, '아이디어만 있다면 누구나 펀딩 프로젝트를 개설할 수 있어요.')
    );
    b.appendChild(body);
    b.appendChild(W.el('div', { class: 'wz-mp-banner__cta' },
      W.el('a', { class: 'wz-btn wz-btn--primary', href: '/fund-create.html' }, '프로젝트 만들기')));
    return b;
  }

  /* "최근에 봤어요" 섹션(홈 안에 인라인) */
  function renderRecentSection() {
    var sec = refs.recentSec;
    sec.replaceChildren();
    var me = state.me;
    var name = me ? (me.nickname || me.name || '회원') : '';
    var head = W.el('div', { class: 'wz-mp-sec__head' });
    var title = W.el('h2', { class: 'wz-mp-sec__title' });
    if (me) title.append(W.el('b', {}, name), document.createTextNode('님이 최근에 봤어요'));
    else title.append(document.createTextNode('최근에 본 프로젝트'));
    head.appendChild(title);
    var recent = readRecent();
    if (recent.length) {
      var more = W.el('button', { class: 'wz-mp-sec__more', type: 'button' }, '더보기');
      more.addEventListener('click', function () { selectView('recent'); });
      head.appendChild(more);
    }
    sec.appendChild(head);

    var grid = W.el('div', { class: 'wz-mp-grid' });
    if (!recent.length) {
      grid.appendChild(emptyState('clock', '아직 둘러본 프로젝트가 없어요', '프로젝트 구경하기', '/feed.html'));
    } else {
      recent.slice(0, 4).forEach(function (it) { grid.appendChild(recentCard(it)); });
    }
    sec.appendChild(grid);
  }

  /* =================== 패널 전환 =================== */
  function selectView(view) {
    if (view === 'recent') return panelRecent();
    if (view === 'backings') return panelBackings();
    if (view === 'funds') return panelFunds();
    showHome();
  }

  function panelShell(title) {
    refs.curView = arguments[1] || refs.curView;
    syncActive();
    var main = refs.main;
    main.replaceChildren();
    var head = W.el('div', { class: 'wz-mp-panelhead' });
    var back = W.el('button', { class: 'wz-mp-back', type: 'button', html: IC.chevL });
    back.appendChild(W.el('span', {}, '마이페이지'));
    back.addEventListener('click', showHome);
    head.append(back, W.el('h1', { class: 'wz-mp-paneltitle' }, title));
    main.appendChild(head);
    var grid = W.el('div', { class: 'wz-mp-grid' });
    main.appendChild(grid);
    return grid;
  }

  /* 패널: 최근 본 프로젝트 */
  function panelRecent() {
    refs.curView = 'recent';
    var grid = panelShell('최근 본 프로젝트', 'recent');
    var recent = readRecent();
    if (!recent.length) {
      grid.appendChild(emptyState('clock', '아직 둘러본 프로젝트가 없어요', '프로젝트 구경하기', '/feed.html'));
      return;
    }
    recent.forEach(function (it) { grid.appendChild(recentCard(it)); });
  }

  /* 패널: 후원한 프로젝트 (GET /api/me/backings) */
  function panelBackings() {
    refs.curView = 'backings';
    var grid = panelShell('후원한 프로젝트', 'backings');
    if (!state.me) { grid.appendChild(loginEmpty('후원 내역을 보려면 로그인하세요')); return; }
    if (Array.isArray(state.backings)) return fillBackings(grid, state.backings);
    grid.appendChild(loading());
    window.api.get('/me/backings')
      .then(function (r) { state.backings = (r && r.items) || []; fillBackings(grid, state.backings); refreshStats(); })
      .catch(function () { grid.replaceChildren(errorState()); });
  }
  function fillBackings(grid, items) {
    grid.replaceChildren();
    if (!items.length) {
      grid.appendChild(emptyState('heart', '아직 후원한 프로젝트가 없어요', '프로젝트 둘러보기', '/feed.html'));
      return;
    }
    items.forEach(function (o) { grid.appendChild(backingCard(o)); });
  }

  /* 패널: 개설한 프로젝트 (GET /api/me/funds) */
  function panelFunds() {
    refs.curView = 'funds';
    var grid = panelShell('개설한 프로젝트', 'funds');
    if (!state.me) { grid.appendChild(loginEmpty('개설한 프로젝트를 보려면 로그인하세요')); return; }
    if (Array.isArray(state.funds)) return fillFunds(grid, state.funds);
    grid.appendChild(loading());
    window.api.get('/me/funds')
      .then(function (r) { state.funds = (r && r.items) || []; fillFunds(grid, state.funds); refreshStats(); })
      .catch(function () { grid.replaceChildren(errorState()); });
  }
  function fillFunds(grid, items) {
    grid.replaceChildren();
    if (!items.length) {
      grid.appendChild(emptyState('box', '아직 개설한 프로젝트가 없어요', '프로젝트 만들기', '/fund-create.html'));
      return;
    }
    items.forEach(function (f) { grid.appendChild(fundCard(f)); });
  }

  /* =================== 카드 렌더 (WZ.fillThumb 사용) =================== */
  function recentCard(it) {
    var card = W.el('a', { class: 'wz-mp-card', href: '/detail.html?id=' + encodeURIComponent(it.id) });
    var th = W.el('div', { class: 'wz-mp-card__thumb' });
    W.fillThumb(th, { id: it.id, title: it.title, imageUrl: it.imageUrl, category: it.category });
    card.appendChild(th);
    card.appendChild(W.el('p', { class: 'wz-mp-card__title' }, it.title || '프로젝트'));
    return card;
  }

  var FUND_STATUS = {
    open:     { label: '진행 중', cls: 'open' },
    pending:  { label: '심사 중', cls: 'pending' },
    rejected: { label: '반려',    cls: 'rejected' },
    closed:   { label: '종료',    cls: 'done' },
    ended:    { label: '종료',    cls: 'done' },
    success:  { label: '성공',    cls: 'done' },
  };
  function fundCard(f) {
    var card = W.el('a', { class: 'wz-mp-card', href: '/detail.html?id=' + encodeURIComponent(f.id) });
    var th = W.el('div', { class: 'wz-mp-card__thumb' });
    W.fillThumb(th, { id: f.id, title: f.title, imageUrl: f.imageUrl, category: f.category });
    var st = FUND_STATUS[String(f.status || '').toLowerCase()] || { label: String(f.status || ''), cls: 'pending' };
    if (st.label) th.appendChild(W.el('span', { class: 'wz-mp-card__badge wz-mp-card__badge--' + st.cls }, st.label));
    card.appendChild(th);
    var rate = (typeof f.achievementRate === 'number') ? f.achievementRate : W.rate(f);
    card.appendChild(W.el('p', { class: 'wz-mp-card__rate' }, rate + '% 달성'));
    card.appendChild(W.el('p', { class: 'wz-mp-card__title' }, f.title || '프로젝트'));
    card.appendChild(W.el('p', { class: 'wz-mp-card__meta' },
      (Number(f.currentQuantity) || 0) + ' / ' + (Number(f.targetQuantity) || 0) + '명 참여'));
    return card;
  }

  var BACK_STATUS = {
    awaiting_deposit: { label: '입금 대기', cls: 'awaiting' },
    confirmed:        { label: '참여 확정', cls: 'confirmed' },
    cancelled:        { label: '취소됨',    cls: 'cancelled' },
  };
  function backingCard(o) {
    var fid = o.fundId || o.fund_id;
    var card = W.el('a', { class: 'wz-mp-card', href: '/detail.html?id=' + encodeURIComponent(fid || '') });
    var th = W.el('div', { class: 'wz-mp-card__thumb' });
    W.fillThumb(th, { id: fid, title: o.fundTitle, imageUrl: o.fundImageUrl });
    var st = BACK_STATUS[String(o.status || '').toLowerCase()] || { label: String(o.status || ''), cls: 'awaiting' };
    if (st.label) th.appendChild(W.el('span', { class: 'wz-mp-card__badge wz-mp-card__badge--' + st.cls }, st.label));
    card.appendChild(th);
    card.appendChild(W.el('p', { class: 'wz-mp-card__title' }, o.fundTitle || '프로젝트'));
    if (o.rewardTitle) card.appendChild(W.el('p', { class: 'wz-mp-card__meta' }, o.rewardTitle));
    card.appendChild(W.el('p', { class: 'wz-mp-card__amount' }, W.money(o.amount)));
    return card;
  }

  /* =================== 공용 빈/로딩/에러 상태 =================== */
  function emptyState(icon, msg, btnLabel, btnHref) {
    var box = W.el('div', { class: 'wz-mp-empty' });
    box.appendChild(W.el('div', { class: 'wz-mp-empty__ic', html: IC[icon] || IC.box }));
    box.appendChild(W.el('p', {}, msg));
    if (btnLabel) box.appendChild(W.el('a', { class: 'wz-btn wz-btn--outline', href: btnHref }, btnLabel));
    return box;
  }
  function loginEmpty(msg) {
    var box = W.el('div', { class: 'wz-mp-empty' });
    box.appendChild(W.el('div', { class: 'wz-mp-empty__ic', html: IC.user }));
    box.appendChild(W.el('p', {}, msg));
    box.appendChild(W.el('a', { class: 'wz-btn wz-btn--primary', href: '/login.html' }, '로그인하기'));
    return box;
  }
  function loading() { return W.el('div', { class: 'wz-mp-loading' }, '불러오는 중...'); }
  function errorState() {
    return W.el('div', { class: 'wz-mp-empty' },
      W.el('div', { class: 'wz-mp-empty__ic', html: IC.box }),
      W.el('p', {}, '목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'));
  }

  /* recentFunds — detail.js가 { id, title, imageUrl } 로 저장. */
  function readRecent() {
    try {
      var l = JSON.parse(localStorage.getItem('recentFunds') || '[]');
      return Array.isArray(l) ? l.filter(function (x) { return x && x.id != null; }) : [];
    } catch (_) { return []; }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
