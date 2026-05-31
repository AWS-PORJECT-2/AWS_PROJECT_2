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
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-9"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    search2: W.ICON.search,
  };

  /* 사이드바 메뉴 정의. view: 메인 패널 식별자(있으면 클릭 시 전환). soon: 준비 중(비활성). href: 외부 페이지 이동. hash: 해시 동기화용. */
  var NAV = {
    activity: [
      { key: 'recent',     label: '최근 본 프로젝트',  icon: 'clock',  view: 'recent' },
      { key: 'liked',      label: '관심 프로젝트',     icon: 'heart',  view: 'liked',     hash: 'liked' },
      { key: 'backings',   label: '후원한 프로젝트',  icon: 'box',    view: 'backings',  hash: 'backings' },
      { key: 'funds',      label: '개설한 프로젝트',  icon: 'box',    view: 'funds',     hash: 'funds' },
      { key: 'drafts',     label: '개설 중인 프로젝트', icon: 'edit',  view: 'drafts',    hash: 'drafts' },
      { key: 'friends',    label: '사용자 검색',       icon: 'users',  view: 'friends',   hash: 'friends' },
      { key: 'maker',      label: '내 메이커 페이지로 가기', icon: 'crown', href: '/maker.html?me=1' },
      { key: 'create',     label: '프로젝트 만들기',   icon: 'plus',   href: '/fund-create.html' },
      { key: 'settings',   label: '설정',             icon: 'gear',   href: '/settings.html' },
    ],
  };

  /* 상태(스탯/패널 공유) */
  var state = { me: null, funds: null, backings: null, drafts: null, likedCount: null };
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
    // 진입 라우팅: #hash(관심/후원/개설 등) 우선 → 해당 패널 즉시 오픈, 없으면 ?tab=, 둘 다 없으면 홈.
    // showHome() 이 location.hash 를 지워버리므로(주소창 정리) 반드시 라우팅을 먼저 판단해야
    // 1클릭 딥링크(#liked/#backings 등)가 첫 로드에 곧장 해당 탭으로 열린다.
    if (!routeFromLocation()) {
      // 해시/탭 없음 → 기본(홈) 패널. 데이터 도착하면 갱신
      showHome();
    }

    // 데이터 로드 (모두 silentAuthFail 로 미로그인 무소음)
    loadAll();

    // 해시 변경(브라우저 뒤로/링크) 반응
    window.addEventListener('hashchange', routeFromLocation);
  }

  /* location.hash / ?tab= 으로 패널 직접 오픈. (#liked, #backings, #funds, #friends, #recent)
   * 반환: 패널을 열었으면 true(=홈 폴백 불필요), 아무것도 라우팅하지 않았으면 false. */
  function routeFromLocation() {
    var hash = (location.hash || '').replace(/^#/, '').toLowerCase();
    var byHash = NAV.activity.find(function (n) { return n.hash === hash; });
    if (byHash && byHash.view) { selectView(byHash.view, true); return true; }
    if (hash) { return false; } // 알 수 없는 해시면 현재 화면 유지(라우팅 안 함)
    var tab = (new URLSearchParams(location.search).get('tab') || '').toLowerCase();
    if (tab === 'backings') { selectView('backings', true); return true; }
    if (tab === 'funds') { selectView('funds', true); return true; }
    if (tab === 'liked' || tab === 'likes') { selectView('liked', true); return true; }
    if (tab === 'friends') { selectView('friends', true); return true; }
    if (tab === 'drafts') { selectView('drafts', true); return true; }
    if (tab === 'recent') { selectView('recent', true); return true; }
    return false;
  }

  /* 로그인 여부가 확정될 때까지 기다렸다가 콜백 실행.
   * state.me 가 이미 채워졌으면 즉시, 아니면 컨테이너에 로딩을 띄우고 fetchMe 결과로 분기.
   * (딥링크 직접 진입 시 state.me 가 아직 null 이어도 로그인 사용자에게 로그인 유도가 잘못 뜨지 않게.) */
  function whenMeKnown(cb, container) {
    if (state.me) { cb(state.me); return; }
    if (container && typeof container.replaceChildren === 'function') container.replaceChildren(loading());
    W.fetchMe().then(function (me) { state.me = me || null; cb(state.me); })
      .catch(function () { cb(state.me); });
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
      .then(function (r) { state.backings = backingItems(r); afterStats(); })
      .catch(function () { state.backings = state.backings || null; });
    window.api.get('/me/drafts', { silentAuthFail: true })
      .then(function (r) { state.drafts = (r && r.items) || []; afterStats(); })
      .catch(function () { state.drafts = state.drafts || null; });
    // 관심 수: 서버 찜(GET /api/me/likes)을 공개 목록과 교차해 "실제 존재하는" 개수로 정확화
    refreshLikedCount();
  }

  /* 관심 프로젝트 수 정확화 — panelLiked 와 동일한 교차필터.
   * GET /api/me/likes(로그인 시) ∩ GET /api/groupbuys 결과 개수.
   * 미로그인이면 0. 공개 목록에 없는(삭제/종료된) id 는 카운트에서 제외. */
  function refreshLikedCount() {
    window.api.get('/me/likes', { silentAuthFail: true })
      .then(function (r) {
        var likedIds = (r && Array.isArray(r.ids)) ? r.ids : [];
        if (!likedIds.length) { state.likedCount = 0; afterStats(); return; }
        window.api.get('/groupbuys?sort=latest&limit=200', { silentAuthFail: true })
          .then(function (r2) {
            var items = (r2 && r2.items) || [];
            var present = {};
            items.forEach(function (it) { if (it && it.id != null) present[String(it.id)] = true; });
            var matched = likedIds.filter(function (id) { return present[String(id)]; });
            state.likedCount = matched.length;
            afterStats();
          })
          .catch(function () { /* 목록 조회 실패 시 보수적으로 기존 추정 유지 */ });
      })
      .catch(function () { state.likedCount = 0; afterStats(); }); // 미로그인/실패 → 0
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
    // "내 프로필"(아바타+이름) 클릭 → 마이페이지 홈(개요). 미로그인은 로그인으로 유도.
    var profBtn = W.el('button', { class: 'wz-mp-side__prof', type: 'button', 'aria-label': me ? '내 프로필' : '로그인하기' });
    profBtn.append(av, nameWrap);
    profBtn.addEventListener('click', function () {
      if (!state.me) { location.href = '/login.html'; return; }
      showHome();
    });
    var setBtn = W.el('button', { class: 'wz-mp-side__settings', type: 'button', html: IC.gear + '<span>설정</span>' });
    setBtn.addEventListener('click', function (e) { e.stopPropagation(); location.href = '/settings.html'; });
    card.append(profBtn, setBtn);
    side.appendChild(card);

    // 메뉴 그룹
    side.appendChild(navGroup('나의 활동', NAV.activity));
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
      if (it.href) {
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
      var item = NAV.activity.find(function (n) { return n.key === b.dataset.key; });
      b.classList.toggle('is-active', !!(item && item.view && item.view === refs.curView));
    });
  }

  /* =================== 메인: 홈(기본) =================== */
  function showHome() {
    refs.curView = 'home';
    // 패널에서 홈으로 돌아오면 해시 제거(주소창 정리)
    if (location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} }
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
    // 교차필터로 확정된 값(state.likedCount)이 있으면 그것을, 로드 전엔 0(서버 기준)
    var likedN = (typeof state.likedCount === 'number') ? state.likedCount : 0;
    var draftsN = Array.isArray(state.drafts) ? state.drafts.length : 0;
    var cards = [
      statCard('개설한 프로젝트', String(fundsN), function () { selectView('funds'); }),
      statCard('후원한 프로젝트', String(backN), function () { selectView('backings'); }),
      statCard('관심 프로젝트', String(likedN), function () { selectView('liked'); }),
    ];
    // 작성 중인 초안이 있을 때만 노출(빈 0개 카드 노이즈 방지)
    if (draftsN > 0) cards.push(statCard('작성 중', String(draftsN), function () { selectView('drafts'); }));
    cards.push(statCardMore('사용자 검색', '검색', function () { selectView('friends'); }));
    refs.statsRow.replaceChildren.apply(refs.statsRow, cards);
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
    // 로고 마크 이미지(폴백: 기존 깃발 아이콘)
    var ic = W.el('div', { class: 'wz-mp-banner__ic' });
    var logo = W.el('img', { class: 'wz-mp-banner__logo', src: '/assets/logo-mark.png', alt: '두띵' });
    logo.addEventListener('error', function () { logo.remove(); ic.innerHTML = IC.flag; });
    ic.appendChild(logo);
    b.appendChild(ic);
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
    sec.appendChild(head);

    var grid = W.el('div', { class: 'wz-mp-grid' });
    grid.appendChild(loading());
    sec.appendChild(grid);

    // 삭제된 프로젝트는 조회 후 정리 → 살아있는 것만 렌더.
    pruneRecent().then(function (recent) {
      if (refs.recentSec !== sec) return; // 그 사이 재렌더됐으면 무시
      if (recent.length) {
        var more = W.el('button', { class: 'wz-mp-sec__more', type: 'button' }, '더보기');
        more.addEventListener('click', function () { selectView('recent'); });
        head.appendChild(more);
      }
      grid.replaceChildren();
      if (!recent.length) {
        grid.appendChild(emptyState('clock', '아직 둘러본 프로젝트가 없어요', '프로젝트 구경하기', '/feed.html'));
      } else {
        recent.slice(0, 4).forEach(function (it) { grid.appendChild(recentCard(it)); });
      }
    });
  }

  /* =================== 패널 전환 =================== */
  // fromHash=true 면 해시를 다시 쓰지 않음(hashchange 무한루프 방지)
  function selectView(view, fromHash) {
    if (!fromHash) syncHash(view);
    if (view === 'recent') return panelRecent();
    if (view === 'liked') return panelLiked();
    if (view === 'backings') return panelBackings();
    if (view === 'funds') return panelFunds();
    if (view === 'drafts') return panelDrafts();
    if (view === 'friends') return panelFriends();
    showHome();
  }

  // 패널 view -> location.hash 동기화(해당 NAV 항목에 hash 가 있을 때만)
  function syncHash(view) {
    var item = NAV.activity.find(function (n) { return n.view === view; });
    var target = item && item.hash ? ('#' + item.hash) : '';
    var cur = location.hash || '';
    if (target && cur.toLowerCase() !== target.toLowerCase()) {
      try { history.replaceState(null, '', target); } catch (_) { location.hash = target; }
    }
  }

  // 패널 헤더(뒤로 + 제목)만 그리고 main 을 반환. view 인자로 활성 상태 동기화.
  function panelHead(title, view) {
    if (view) refs.curView = view;
    syncActive();
    var main = refs.main;
    main.replaceChildren();
    var head = W.el('div', { class: 'wz-mp-panelhead' });
    var back = W.el('button', { class: 'wz-mp-back', type: 'button', html: IC.chevL });
    back.appendChild(W.el('span', {}, '마이페이지'));
    back.addEventListener('click', showHome);
    head.append(back, W.el('h1', { class: 'wz-mp-paneltitle' }, title));
    main.appendChild(head);
    return main;
  }
  // 헤더 + 카드 그리드. 그리드를 반환.
  function panelShell(title) {
    var main = panelHead(title, arguments[1] || refs.curView);
    var grid = W.el('div', { class: 'wz-mp-grid' });
    main.appendChild(grid);
    return grid;
  }

  /* 패널: 최근 본 프로젝트 */
  function panelRecent() {
    refs.curView = 'recent';
    var grid = panelShell('최근 본 프로젝트', 'recent');
    grid.appendChild(loading());
    // 삭제된 프로젝트는 조회 후 정리 → 살아있는 것만 렌더.
    pruneRecent().then(function (recent) {
      if (refs.curView !== 'recent') return; // 그 사이 다른 패널로 이동했으면 무시
      grid.replaceChildren();
      if (!recent.length) {
        grid.appendChild(emptyState('clock', '아직 둘러본 프로젝트가 없어요', '프로젝트 구경하기', '/feed.html'));
        return;
      }
      recent.forEach(function (it) { grid.appendChild(recentCard(it)); });
    });
  }

  /* 패널: 관심 프로젝트 (좋아요/찜) — 서버 찜 기준.
   *  GET /api/me/likes(로그인 시) ∩ GET /api/groupbuys 목록 교차필터.
   *  실제 공개 목록에 존재하는 관심 프로젝트만 노출(없으면 빈 상태). 미로그인은 로그인 유도. */
  function panelLiked() {
    refs.curView = 'liked';
    var grid = panelShell('관심 프로젝트', 'liked');
    grid.appendChild(loading());
    // 내 찜 id 조회. 미로그인(401)이면 로그인 유도. (state.me 가 아직 미확정인 직접 진입도 안전하게 처리)
    window.api.get('/me/likes', { silentAuthFail: true })
      .then(function (r) {
        var likedIds = (r && Array.isArray(r.ids)) ? r.ids : [];
        if (!likedIds.length) { fillLiked(grid, []); return; }
        // 공개 목록과 교차필터(실제 존재하는 관심 프로젝트만).
        return window.api.get('/groupbuys?sort=latest&limit=200', { silentAuthFail: true })
          .then(function (r2) {
            var items = (r2 && r2.items) || [];
            var byId = {};
            items.forEach(function (it) { if (it && it.id != null) byId[String(it.id)] = it; });
            var matched = likedIds.map(function (id) { return byId[String(id)]; }).filter(Boolean);
            fillLiked(grid, matched);
          });
      })
      .catch(function (e) {
        if (e && e.status === 401) { grid.replaceChildren(loginEmpty('관심(찜)한 프로젝트를 보려면 로그인하세요')); return; }
        fillLiked(grid, []);
      });
  }
  // 공개 목록(/api/groupbuys)에 존재하는 관심 프로젝트만 노출. 매칭 0개면 빈 상태.
  function fillLiked(grid, matched) {
    // 패널이 그린 실제 개수로 스탯도 동기화(홈 복귀 시 일치)
    state.likedCount = matched.length;
    grid.replaceChildren();
    if (!matched.length) {
      grid.appendChild(emptyState('heart', '아직 관심(찜)한 프로젝트가 없어요', '프로젝트 둘러보기', '/feed.html', '/assets/empty-likes.png'));
      return;
    }
    matched.forEach(function (f) { grid.appendChild(likedCard(f)); });
  }

  /* 패널: 후원한 프로젝트 (GET /api/me/backings) */
  function panelBackings() {
    refs.curView = 'backings';
    var grid = panelShell('후원한 프로젝트', 'backings');
    // 딥링크 직접 진입(state.me 미확정)도 안전: 로그인 여부가 확정될 때까지 로딩 표시 후 분기.
    whenMeKnown(function (me) {
      if (refs.curView !== 'backings') return; // 그 사이 다른 패널로 이동했으면 무시
      if (!me) { grid.replaceChildren(loginEmpty('후원 내역을 보려면 로그인하세요')); return; }
      if (Array.isArray(state.backings)) return fillBackings(grid, state.backings);
      window.api.get('/me/backings')
        .then(function (r) { state.backings = backingItems(r); fillBackings(grid, state.backings); refreshStats(); })
        .catch(function () { grid.replaceChildren(errorState()); });
    }, grid);
  }
  // /me/backings 응답({items}) 과 /me/orders 응답({orders}) 양쪽 형태를 모두 수용
  function backingItems(r) {
    if (!r) return [];
    if (Array.isArray(r.items)) return r.items;
    if (Array.isArray(r.orders)) return r.orders;
    return Array.isArray(r) ? r : [];
  }
  function fillBackings(grid, items) {
    grid.replaceChildren();
    if (!items.length) {
      grid.appendChild(emptyState('box', '아직 후원한 프로젝트가 없어요', '프로젝트 둘러보기', '/feed.html', '/assets/empty-backings.png'));
      return;
    }
    items.forEach(function (o) { grid.appendChild(backingCard(o)); });
  }

  /* 패널: 개설한 프로젝트 (GET /api/me/funds) */
  function panelFunds() {
    refs.curView = 'funds';
    var grid = panelShell('개설한 프로젝트', 'funds');
    whenMeKnown(function (me) {
      if (refs.curView !== 'funds') return;
      if (!me) { grid.replaceChildren(loginEmpty('개설한 프로젝트를 보려면 로그인하세요')); return; }
      if (Array.isArray(state.funds)) return fillFunds(grid, state.funds);
      window.api.get('/me/funds')
        .then(function (r) { state.funds = (r && r.items) || []; fillFunds(grid, state.funds); refreshStats(); })
        .catch(function () { grid.replaceChildren(errorState()); });
    }, grid);
  }
  function fillFunds(grid, items) {
    grid.replaceChildren();
    if (!items.length) {
      grid.appendChild(emptyState('box', '아직 개설한 프로젝트가 없어요', '프로젝트 만들기', '/fund-create.html', '/assets/empty-funds.png'));
      return;
    }
    items.forEach(function (f) { grid.appendChild(fundCard(f)); });
  }

  /* 패널: 개설 중인 프로젝트 (임시저장 초안, GET /api/me/drafts)
   *  각 카드: 제목(없으면 "제목 미정") · 카테고리 요약 · 수정일
   *           + [이어서 만들기](/fund-create.html?draft=<id>) + [삭제](DELETE /api/me/drafts/:id, 확인). */
  function panelDrafts() {
    refs.curView = 'drafts';
    var main = panelHead('개설 중인 프로젝트', 'drafts');
    var list = W.el('div', { class: 'wz-mp-drafts' });
    main.appendChild(list);
    whenMeKnown(function (me) {
      if (refs.curView !== 'drafts') return;
      if (!me) { list.replaceChildren(loginEmpty('작성 중인 프로젝트를 보려면 로그인하세요')); return; }
      if (Array.isArray(state.drafts)) return fillDrafts(list, state.drafts);
      window.api.get('/me/drafts')
        .then(function (r) { state.drafts = (r && r.items) || []; fillDrafts(list, state.drafts); refreshStats(); })
        .catch(function () { list.replaceChildren(errorState()); });
    }, list);
  }
  function fillDrafts(list, items) {
    list.replaceChildren();
    if (!items.length) {
      list.appendChild(emptyState('edit', '아직 작성 중인 프로젝트가 없어요', '프로젝트 만들기', '/fund-create.html'));
      return;
    }
    items.forEach(function (d) { list.appendChild(draftRow(d, list)); });
  }

  /* 초안 한 줄. d: { id, title, category(slug), updatedAt } */
  function draftRow(d, list) {
    var row = W.el('div', { class: 'wz-mp-draft' });

    var body = W.el('div', { class: 'wz-mp-draft__body' });
    body.appendChild(W.el('p', { class: 'wz-mp-draft__title' }, (d.title && String(d.title).trim()) ? d.title : '제목 미정'));
    var metas = [];
    var cat = d.category ? (window.dtCategory && window.dtCategory(d.category)) : null;
    if (cat) metas.push(cat.label);
    var when = relTime(d.updatedAt);
    if (when) metas.push(when + ' 수정');
    if (metas.length) {
      var meta = W.el('p', { class: 'wz-mp-draft__meta' });
      metas.forEach(function (m, i) {
        if (i) meta.appendChild(W.el('span', { class: 'wz-mp-draft__dot' }, '·'));
        meta.appendChild(W.el('span', {}, m));
      });
      body.appendChild(meta);
    }

    var actions = W.el('div', { class: 'wz-mp-draft__actions' });
    var go = W.el('a', { class: 'wz-btn wz-btn--primary wz-mp-draft__go', href: '/fund-create.html?draft=' + encodeURIComponent(d.id) }, '이어서 만들기');
    var del = W.el('button', { class: 'wz-mp-draft__del', type: 'button', 'aria-label': '초안 삭제', title: '삭제', html: IC.trash });
    var busy = false;
    del.addEventListener('click', function () {
      if (busy) return;
      var label = (d.title && String(d.title).trim()) ? d.title : '제목 미정';
      if (!window.confirm('「' + label + '」 초안을 삭제할까요?')) return;
      busy = true;
      del.disabled = true;
      window.api.del('/me/drafts/' + encodeURIComponent(d.id))
        .then(function () {
          if (Array.isArray(state.drafts)) {
            state.drafts = state.drafts.filter(function (x) { return String(x.id) !== String(d.id); });
          }
          row.remove();
          if (Array.isArray(state.drafts) && !state.drafts.length) fillDrafts(list, state.drafts);
          refreshStats();
        })
        .catch(function () { busy = false; del.disabled = false; });
    });
    actions.append(go, del);

    row.append(body, actions);
    return row;
  }

  /* =================== 패널: 친구 (검색 / 팔로잉 / 팔로워) ===================
   *  탭 3종:
   *   - 검색   : 이름/닉네임 검색(디바운스) -> GET /api/users/search?q=
   *   - 팔로잉 : 내가 팔로우한 사람 -> GET /api/users/:myId/following
   *   - 팔로워 : 나를 팔로우한 사람 -> GET /api/users/:myId/followers
   *  각 행: [아바타 · 이름 · @닉네임/아이디] + 팔로우 버튼(POST/DELETE /api/users/:id/follow)
   *  행 클릭 시 /maker.html?id= 로 이동(버튼 클릭은 이동 차단). */
  function panelFriends() {
    refs.curView = 'friends';
    var main = panelHead('친구', 'friends');

    var box = W.el('div', { class: 'wz-mp-friends' });

    // 탭 바
    var tabs = W.el('div', { class: 'wz-mp-ftabs', role: 'tablist' });
    var tabDefs = [
      { key: 'search',    label: '사용자 검색' },
      { key: 'following', label: '팔로잉' },
      { key: 'followers', label: '팔로워' },
    ];
    var list = W.el('div', { class: 'wz-mp-friendlist' });

    var tabBtns = {};
    tabDefs.forEach(function (t) {
      var b = W.el('button', { class: 'wz-mp-ftab', type: 'button', role: 'tab' }, t.label);
      b.addEventListener('click', function () { switchTab(t.key); });
      tabBtns[t.key] = b;
      tabs.appendChild(b);
    });
    box.appendChild(tabs);

    // 검색 입력(검색 탭에서만 노출)
    var sform = W.el('div', { class: 'wz-mp-search' });
    var inp = W.el('input', {
      class: 'wz-mp-search__input', type: 'search', autocomplete: 'off',
      placeholder: '이름 또는 닉네임으로 사용자 검색', 'aria-label': '사용자 검색',
    });
    sform.appendChild(W.el('span', { class: 'wz-mp-search__ic', html: IC.search2 }));
    sform.appendChild(inp);
    box.appendChild(sform);

    box.appendChild(list);
    main.appendChild(box);

    var timer = null;
    var seq = 0; // 응답 경합 방지
    inp.addEventListener('input', function () {
      var q = inp.value.trim();
      if (timer) clearTimeout(timer);
      if (!q) { friendsHint(list, '이름이나 닉네임을 입력해 사용자를 검색해 보세요'); return; }
      timer = setTimeout(function () { doFriendSearch(q, list, ++seq, function () { return seq; }); }, 300);
    });

    function switchTab(key) {
      Object.keys(tabBtns).forEach(function (k) { tabBtns[k].classList.toggle('is-active', k === key); });
      sform.style.display = (key === 'search') ? '' : 'none';
      if (key === 'search') {
        var q = inp.value.trim();
        if (q) doFriendSearch(q, list, ++seq, function () { return seq; });
        else friendsHint(list, '이름이나 닉네임을 입력해 사용자를 검색해 보세요');
        try { inp.focus(); } catch (_) {}
      } else {
        loadFollowList(list, key);
      }
    }

    switchTab('search');
  }

  /* 팔로잉/팔로워 목록 로드. kind: 'following' | 'followers'. (myId = state.me.userId) */
  function loadFollowList(list, kind) {
    if (!state.me) {
      list.replaceChildren(loginEmpty(kind === 'following' ? '팔로잉 목록을 보려면 로그인하세요' : '팔로워 목록을 보려면 로그인하세요'));
      return;
    }
    var myId = state.me.userId;
    list.replaceChildren(loading());
    window.api.get('/users/' + encodeURIComponent(myId) + '/' + kind, { silentAuthFail: true })
      .then(function (rows) {
        renderFollowRows(list, Array.isArray(rows) ? rows : [], kind);
      })
      .catch(function () {
        friendsHint(list, '목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      });
  }

  function renderFollowRows(list, rows, kind) {
    list.replaceChildren();
    if (!rows.length) {
      friendsHint(list, kind === 'following' ? '아직 팔로우한 사람이 없어요' : '아직 나를 팔로우한 사람이 없어요', kind === 'following' ? '/assets/empty-following.png' : '/assets/empty-friends.png');
      return;
    }
    rows.forEach(function (u) { list.appendChild(friendRow(u)); });
  }

  function doFriendSearch(q, list, mySeq, curSeq) {
    list.replaceChildren(loading());
    window.api.get('/users/search?q=' + encodeURIComponent(q), { silentAuthFail: true })
      .then(function (rows) {
        if (curSeq() !== mySeq) return; // 더 최근 검색이 있으면 폐기
        renderFriendRows(list, Array.isArray(rows) ? rows : []);
      })
      .catch(function () {
        if (curSeq() !== mySeq) return;
        friendsHint(list, '검색 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.');
      });
  }

  function renderFriendRows(list, rows) {
    list.replaceChildren();
    if (!rows.length) {
      friendsHint(list, '검색 결과가 없어요', '/assets/empty-friends.png');
      return;
    }
    rows.forEach(function (u) { list.appendChild(friendRow(u)); });
  }

  function friendRow(u) {
    var idOrSlug = u.slug || u.userId;
    var row = W.el('div', { class: 'wz-mp-friend' });
    // 아바타
    var av = W.el('div', { class: 'wz-mp-friend__av' });
    if (u.picture) {
      var img = W.el('img', { src: u.picture, alt: u.name || '' });
      img.addEventListener('error', function () { img.remove(); av.innerHTML = IC.user; });
      av.appendChild(img);
    } else { av.innerHTML = IC.user; }
    // 이름 + @아이디
    var info = W.el('div', { class: 'wz-mp-friend__info' });
    info.appendChild(W.el('p', { class: 'wz-mp-friend__name' }, u.name || u.nickname || '회원'));
    var handle = u.nickname || u.slug;
    if (handle) info.appendChild(W.el('p', { class: 'wz-mp-friend__handle' }, '@' + handle));
    // 본인이면 팔로우 버튼 대신 클릭 불가한 '본인' 라벨, 아니면 팔로우 버튼.
    var myId = state.me && state.me.userId;
    var action;
    if (myId && u.userId === myId) {
      action = W.el('span', {
        class: 'wz-mp-follow wz-mp-follow--self',
        style: 'background:#e5e7eb;color:#6b7280;cursor:default;pointer-events:none',
        'aria-disabled': 'true',
      }, '본인');
    } else {
      // 팔로우 버튼 — 서버가 isFollowing 을 주면(팔로잉/팔로워 목록) 그 상태로 시작
      var btn = W.el('button', { class: 'wz-mp-follow', type: 'button' });
      setFollowBtn(btn, !!u.isFollowing);
      var busy = false;
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (busy || !u.userId) return;
        // 미로그인이면 로그인 유도
        if (!state.me) { location.href = '/login.html'; return; }
        busy = true;
        var willFollow = btn.getAttribute('data-on') !== '1';
        var req = willFollow
          ? window.api.post('/users/' + encodeURIComponent(u.userId) + '/follow', {})
          : window.api.del('/users/' + encodeURIComponent(u.userId) + '/follow');
        req.then(function (r) {
          setFollowBtn(btn, r ? !!r.following : willFollow);
        }).catch(function () { /* 실패 시 상태 유지 */ }).then(function () { busy = false; });
      });
      action = btn;
    }

    row.append(av, info, action);
    // 행 클릭 -> 메이커 페이지
    row.addEventListener('click', function () {
      location.href = '/maker.html?id=' + encodeURIComponent(idOrSlug);
    });
    row.style.cursor = 'pointer';
    return row;
  }

  function setFollowBtn(btn, on) {
    btn.setAttribute('data-on', on ? '1' : '0');
    btn.classList.toggle('is-on', on);
    btn.replaceChildren(document.createTextNode(on ? '팔로잉' : '팔로우'));
  }

  // image(선택): /assets/empty-*.png. 로드 실패 시 users 아이콘으로 폴백.
  function friendsHint(list, msg, image) {
    var hint = W.el('div', { class: 'wz-mp-friends__hint' });
    var iconBox = W.el('div', { class: 'wz-mp-empty__ic', html: IC.users });
    if (image) {
      var art = W.el('div', { class: 'wz-mp-empty__art' });
      var img = W.el('img', { src: image, alt: '' });
      img.addEventListener('error', function () { art.replaceWith(iconBox); });
      art.appendChild(img);
      hint.appendChild(art);
    } else {
      hint.appendChild(iconBox);
    }
    hint.appendChild(W.el('p', {}, msg));
    list.appendChild(hint);
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

    /* 분석 진입(요금제별):
     *  - /me/funds 목록 응답엔 plan/tier 가 없으므로 카드 단위로 분석 API(tier)를 한 번 조회해 분기.
     *  - plus/pro → "분석 리포트" 버튼 → 전용 창(analytics.html?id=).
     *  - basic    → 전용 창/버튼 없음(사용자 명시). 후원자 수/달성률/좋아요만 인라인 간단 요약.
     *  조회 실패/심사중(분석 미제공)은 아무것도 추가하지 않음(조용히 생략). */
    var hook = W.el('div', { class: 'wz-mp-card__analytics' });
    card.appendChild(hook);
    window.api.get('/me/funds/' + encodeURIComponent(f.id) + '/analytics', { silentAuthFail: true })
      .then(function (a) { fillFundAnalyticsHook(hook, f, a || {}); })
      .catch(function () { /* 미제공/오류 → 진입점 생략 */ });
    return card;
  }

  /* 카드 분석 진입점 렌더. tier 로 분기.
   *  plus/pro: "분석 리포트" 버튼(전용 창 이동). basic: 인라인 간단 요약. */
  function fillFundAnalyticsHook(hook, f, a) {
    hook.replaceChildren();
    var tier = (a && a.tier) || 'basic';
    if (tier === 'plus' || tier === 'pro') {
      // 카드(<a>) 내부 버튼 — 클릭 시 카드 이동을 막고 전용 분석 창으로.
      var btn = W.el('button', { class: 'wz-mp-card__analyze', type: 'button', html: IC.chart });
      btn.appendChild(W.el('span', {}, '분석 리포트'));
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        location.href = '/analytics.html?id=' + encodeURIComponent(f.id);
      });
      hook.appendChild(btn);
      return;
    }
    // basic — 전용 창 없이 아주 간단한 요약만(후원자/달성률/좋아요).
    // wz-profile.css 미배정 → 인라인 style 로 자급(보라 토큰 사용).
    var s = (a && a.summary) || {};
    var backerCount = Number(s.backerCount) || 0;
    var rate = (typeof s.achievementRate === 'number') ? s.achievementRate
      : ((typeof f.achievementRate === 'number') ? f.achievementRate : W.rate(f));
    var likeCount = Number(s.likeCount) || 0;
    var sum = W.el('div', { class: 'wz-mp-card__sum' });
    sum.style.cssText = 'display:flex;gap:10px;margin-top:9px;padding:9px 11px;border:1px solid var(--c-divider);border-radius:8px;background:var(--c-bg);';
    sum.append(
      cardSumItem('후원자', String(backerCount) + '명'),
      cardSumItem('달성률', rate + '%'),
      cardSumItem('관심', String(likeCount))
    );
    hook.appendChild(sum);
  }
  function cardSumItem(label, value) {
    var box = W.el('div', { class: 'wz-mp-card__sumitem' });
    box.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex:1 1 0;min-width:0;';
    var l = W.el('span', { class: 'wz-mp-card__sumlabel' }, label);
    l.style.cssText = 'font-size:11px;color:var(--c-text-muted);font-weight:600;';
    var v = W.el('span', { class: 'wz-mp-card__sumval' }, value);
    v.style.cssText = 'font-size:14px;font-weight:800;color:var(--c-primary-700);line-height:1.15;';
    box.append(l, v);
    return box;
  }

  /* 관심 프로젝트 카드 — <groupbuy 목록 아이템>(coverImageUrl/achievementRate 등) */
  function likedCard(f) {
    var card = W.el('a', { class: 'wz-mp-card', href: '/detail.html?id=' + encodeURIComponent(f.id) });
    var th = W.el('div', { class: 'wz-mp-card__thumb' });
    W.fillThumb(th, { id: f.id, title: f.title, imageUrl: f.coverImageUrl || f.imageUrl, category: f.category });
    var st = FUND_STATUS[String(f.status || '').toLowerCase()];
    if (st && st.label) th.appendChild(W.el('span', { class: 'wz-mp-card__badge wz-mp-card__badge--' + st.cls }, st.label));
    // 좋아요(찜) 하트 표식
    th.appendChild(W.el('span', { class: 'wz-mp-card__like', html: IC.heart, 'aria-hidden': 'true' }));
    card.appendChild(th);
    var rate = (typeof f.achievementRate === 'number') ? f.achievementRate : W.rate(f);
    card.appendChild(W.el('p', { class: 'wz-mp-card__rate' }, rate + '% 달성'));
    card.appendChild(W.el('p', { class: 'wz-mp-card__title' }, f.title || '프로젝트'));
    if (f.creatorName) card.appendChild(W.el('p', { class: 'wz-mp-card__meta' }, f.creatorName));
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

  /* =================== 공용 빈/로딩/에러 상태 ===================
   * image(선택): /assets/empty-*.png. 로드 실패 시 icon SVG 로 폴백. */
  function emptyState(icon, msg, btnLabel, btnHref, image) {
    var box = W.el('div', { class: 'wz-mp-empty' });
    var iconBox = W.el('div', { class: 'wz-mp-empty__ic', html: IC[icon] || IC.box });
    if (image) {
      var art = W.el('div', { class: 'wz-mp-empty__art' });
      var img = W.el('img', { src: image, alt: '' });
      img.addEventListener('error', function () { art.replaceWith(iconBox); });
      art.appendChild(img);
      box.appendChild(art);
    } else {
      box.appendChild(iconBox);
    }
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

  /* 상대시간(방금 전 / N분 전 / N시간 전 / N일 전 / YYYY.MM.DD) — wz-comments 와 동일 규칙 */
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

  /* recentFunds — detail.js가 { id, title, imageUrl } 로 저장. */
  function readRecent() {
    try {
      var l = JSON.parse(localStorage.getItem('recentFunds') || '[]');
      return Array.isArray(l) ? l.filter(function (x) { return x && x.id != null; }) : [];
    } catch (_) { return []; }
  }
  function writeRecent(list) {
    try { localStorage.setItem('recentFunds', JSON.stringify(list.slice(0, 20))); } catch (_) { /* 무시 */ }
  }

  /* 최근 본 프로젝트 정리 — 각 펀드를 조회해 404/GROUPBUY_NOT_FOUND(관리자 삭제·없음)면
   * localStorage(recentFunds)에서 제거하고, 살아있는 것만(저장 순서 유지) 반환한다.
   * 네트워크/기타 일시 오류는 삭제로 보지 않고 그대로 유지(오프라인 시 목록 보존). */
  function pruneRecent() {
    var list = readRecent();
    if (!list.length) return Promise.resolve(list);
    return Promise.all(list.map(function (it) {
      return window.api.get('/groupbuys/' + encodeURIComponent(it.id), { silentAuthFail: true })
        .then(function (f) { return (f && f.id != null) ? { keep: true, it: it } : { keep: false, it: it }; })
        .catch(function (e) {
          // 삭제/없음만 제거. 그 외(네트워크 등)는 보존(keep).
          if (e && (e.status === 404 || e.code === 'GROUPBUY_NOT_FOUND')) return { keep: false, it: it };
          return { keep: true, it: it };
        });
    })).then(function (results) {
      var alive = results.filter(function (r) { return r.keep; }).map(function (r) { return r.it; });
      if (alive.length !== list.length) writeRecent(alive); // 죽은 항목이 있었으면 정리 저장
      return alive;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
