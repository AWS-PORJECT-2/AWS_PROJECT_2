/* =====================================================================
 * DOOTHING — 마이페이지 Archive (profile.html 전용, 다크 테마).
 * @핸들 + 스탯(크루/드롭/탑승) + MADE(내가 만든)/BOARDED(내가 탑승한) 2탭 그리드.
 * 데이터: /auth/me, /me/funds(MADE), /me/backings(BOARDED). 없으면 데모 시드.
 * ===================================================================== */
(function () {
  const W = window.WZ;
  if (!W) return;

  const SVG = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  };

  /* 데모 시드 — 비로그인/무데이터 시 목업 시연 */
  const DEMO_ME = { handle: 'gildong', crew: 12, drop: 3, board: 7, bio: '"그저 그런 학교 굿즈 말고, 네 취향을 입어."' };
  const DEMO_MADE = [
    { id: 'd1', state: 'live', title: 'ESSENTIAL 001', sub: '89명 탑승', image: 'https://images.unsplash.com/photo-1523398002811-999ca8dec234?w=600&q=80' },
    { id: 'd2', state: 'done', title: 'RAW ISSUE 002', sub: '34명 탑승', image: 'https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=600&q=80' },
  ];
  const DEMO_BOARD = [
    { id: 'b1', state: 'done', title: 'BOXY SEASON', sub: '탑승 완료', image: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=600&q=80' },
  ];

  const STATE_LABEL = { live: 'LIVE DROP', done: 'DONE', fail: 'FAIL' };
  function stateOf(f) {
    const s = String(f.status || f.state || '').toLowerCase();
    if (s === 'active' || s === 'open' || s === 'live') return 'live';
    if (s === 'failed' || s === 'fail' || s === 'cancelled') return 'fail';
    if (s === 'ended' || s === 'success' || s === 'closed' || s === 'done' || s === 'achieved' || s === 'completed') return 'done';
    return f.state || 'live';
  }

  function Header() {
    const hd = W.el('header', { class: 'dt-lbhd' });
    const logo = W.el('a', { class: 'dt-lbhd__logo', href: '/main.html', 'aria-label': 'DOOTHING' });
    const logoImg = W.el('img', { class: 'dt-lbhd__logoimg', src: '/assets/logo-doothing.png', alt: 'DOOTHING' });
    logoImg.addEventListener('error', () => { logoImg.remove(); logo.textContent = 'DOOTHING'; });
    logo.appendChild(logoImg);
    hd.appendChild(logo);
    const acts = W.el('div', { class: 'dt-lbhd__actions' });
    const heart = W.el('button', { class: 'dt-lbhd__ic', type: 'button', 'aria-label': '알림 센터', html: SVG.heart });
    heart.addEventListener('click', (e) => { e.stopPropagation(); if (typeof window.openHeartCenter === 'function') window.openHeartCenter(); });
    acts.appendChild(heart);
    // 설정(햄버거) — 기존 settings 페이지로 이동
    const menu = W.el('a', { class: 'dt-lbhd__ic', href: '/settings.html', 'aria-label': '설정', html: SVG.menu });
    acts.appendChild(menu);
    hd.appendChild(acts);
    return hd;
  }

  function Card(c) {
    const st = stateOf(c);
    const card = W.el('a', { class: 'dt-arcard', href: '/main.html?feed=live' });
    const thumb = W.el('div', { class: 'dt-arcard__thumb' });
    if (c.image) { const im = W.el('img', { src: c.image, alt: c.title || '', loading: 'lazy' }); thumb.appendChild(im); }
    thumb.appendChild(W.el('span', { class: 'dt-arcard__badge dt-arcard__badge--' + st }, STATE_LABEL[st] || 'LIVE'));
    card.appendChild(thumb);
    const meta = W.el('div', { class: 'dt-arcard__meta' });
    meta.append(
      W.el('p', { class: 'dt-arcard__title' }, c.title || '무제'),
      W.el('p', { class: 'dt-arcard__sub' }, c.sub || '')
    );
    card.appendChild(meta);
    // 카드 클릭 → 메인 릴스 피드로, 이 게시물을 맨 위에 얹어 보이게(상세 페이지 없음).
    const isDemo = String(c.id).indexOf('d') === 0 || String(c.id).indexOf('b') === 0;
    card.addEventListener('click', (e) => {
      e.preventDefault();
      var item = { id: c.id, title: c.title || '', image: c.image || '', status: 'active' };
      try { sessionStorage.setItem('dt_live_feed', JSON.stringify([item])); } catch (_) {}
      location.href = '/main.html?feed=live';
    });
    return card;
  }

  function mapFund(p) {
    return { id: p.id, status: p.status, title: (p.title || '무제').toUpperCase(),
      sub: (p.backerCount != null ? p.backerCount + '명 탑승' : ''),
      image: p.imageUrl || p.coverImageUrl || '' };
  }
  function mapBacking(o) {
    return { id: o.fundId || o.groupBuyId || o.id, status: o.fundStatus || 'ended',
      title: (o.fundTitle || o.title || '무제').toUpperCase(), sub: '탑승',
      image: o.fundImageUrl || o.coverImageUrl || o.fundCoverImageUrl || '' };
  }

  function run() {
    const root = document.getElementById('wz-mypage');
    if (!root) return;
    document.body.classList.add('dt-dark');
    const hdHost = document.getElementById('wz-header');
    if (hdHost) { hdHost.replaceChildren(); hdHost.appendChild(Header()); }
    root.replaceChildren();

    const ar = W.el('div', { class: 'dt-ar' });
    root.appendChild(ar);

    // 헤더(프로필) 자리 — me 로드 후 채움
    const head = W.el('div', { class: 'dt-ar__head' });
    const bio = W.el('div', { class: 'dt-ar__bio' });
    ar.append(head, bio);

    // 탭
    const tabs = W.el('div', { class: 'dt-ar__tabs' });
    const tabMade = W.el('button', { class: 'dt-ar__tab is-active', type: 'button' }, '내가 만든');
    const tabBoard = W.el('button', { class: 'dt-ar__tab', type: 'button' }, '내가 탑승한');
    tabs.append(tabMade, tabBoard);
    ar.appendChild(tabs);

    const grid = W.el('div', { class: 'dt-ar__grid' });
    grid.appendChild(W.el('div', { class: 'dt-ar__load' }, '불러오는 중…'));
    ar.appendChild(grid);

    let madeItems = null, boardItems = null, cur = 'made';

    function paint() {
      const items = cur === 'made' ? madeItems : boardItems;
      grid.replaceChildren();
      if (!items || !items.length) {
        grid.appendChild(W.el('div', { class: 'dt-ar__empty' }, cur === 'made' ? '아직 만든 드롭이 없어요' : '아직 탑승한 드롭이 없어요'));
        return;
      }
      items.forEach((c) => grid.appendChild(Card(c)));
    }
    tabMade.addEventListener('click', () => { cur = 'made'; tabMade.classList.add('is-active'); tabBoard.classList.remove('is-active'); paint(); });
    tabBoard.addEventListener('click', () => { cur = 'board'; tabBoard.classList.add('is-active'); tabMade.classList.remove('is-active'); paint(); });

    function renderHead(me, madeCount, boardCount) {
      const handle = me ? (me.nickname || me.slug || me.name || 'me') : DEMO_ME.handle;
      const av = W.el('div', { class: 'dt-ar__avatar' });
      if (me && me.picture) { const im = W.el('img', { src: me.picture, alt: handle }); im.addEventListener('error', () => { im.remove(); av.innerHTML = SVG.user; }); av.appendChild(im); }
      else av.innerHTML = SVG.user;
      const id = W.el('div', { class: 'dt-ar__id' });
      id.appendChild(W.el('p', { class: 'dt-ar__handle' }, '@' + handle));
      const stats = W.el('div', { class: 'dt-ar__stats' });
      const crewN = me ? (me.crewCount != null ? me.crewCount : DEMO_ME.crew) : DEMO_ME.crew;
      function stat(n, label) { const s = W.el('div', { class: 'dt-ar__stat' }); s.append(W.el('b', {}, String(n)), document.createTextNode(label)); return s; }
      stats.append(stat(crewN, '크루'), stat(madeCount, '드롭'), stat(boardCount, '탑승'));
      id.appendChild(stats);
      const edit = W.el('button', { class: 'dt-ar__edit', type: 'button' }, '닉네임 변경');
      edit.addEventListener('click', () => { location.href = '/settings.html#profile'; });
      head.replaceChildren(av, id, edit);
      bio.textContent = (me && me.bio) ? me.bio : DEMO_ME.bio;
    }

    // 로드
    W.fetchMe().then((me) => {
      Promise.all([
        window.api.get('/me/funds', { silentAuthFail: true }).catch(() => null),
        window.api.get('/me/backings', { silentAuthFail: true }).catch(() => null),
      ]).then(([fundsR, backR]) => {
        const funds = (fundsR && Array.isArray(fundsR.items)) ? fundsR.items : [];
        const backs = (backR && Array.isArray(backR.items)) ? backR.items : (Array.isArray(backR) ? backR : []);
        madeItems = me && funds.length ? funds.map(mapFund) : (me ? [] : DEMO_MADE);
        boardItems = me && backs.length ? backs.map(mapBacking) : (me ? [] : DEMO_BOARD);
        renderHead(me, me ? funds.length : DEMO_ME.drop, me ? backs.length : DEMO_ME.board);
        paint();
      });
    }).catch(() => {
      madeItems = DEMO_MADE; boardItems = DEMO_BOARD;
      renderHead(null, DEMO_ME.drop, DEMO_ME.board); paint();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
