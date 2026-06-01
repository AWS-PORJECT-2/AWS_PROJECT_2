/* =====================================================================
 * 두띵 — 프로젝트 전체목록 페이지. 홈(둘러보기/팔로잉)에서 "전체보기"로 진입.
 *   ?feed=following  → GET /api/me/following-feed (팔로우 창작자 전체)
 *   ?feed=scheduled  → GET /api/groupbuys/scheduled (공개 예정 — open_at 오름차순, 알림신청)
 *   그 외            → GET /api/groupbuys (?sort/?category) 전체 그리드
 *   ?q=<검색어>      → 위 결과를 제목/창작자 기준으로 클라이언트 필터(헤더 검색바)
 * 카드/그리드/D-day/하트는 홈(wz-home.js)과 동일 스타일을 재현.
 * ===================================================================== */
(function () {
  const W = window.WZ;
  const SORTS = [['popular', '인기순'], ['latest', '신규순'], ['ending', '마감임박순']];
  const state = { feed: '', sort: 'popular', category: 'all', q: '', lastItems: [] };

  /* 카드 달성률 — 서버 계약의 금액 기준 achievementRate 우선, 없으면 공용 W.rate(수량 기준) 폴백.
   * (카드는 .wz-pcard__rate 한 줄만 — 목표/모인 금액 보조 표기는 카드 CSS(wz.css, 미배정) 의존이라 상세에서만 노출) */
  function cardRate(p) {
    return (p && typeof p.achievementRate === 'number') ? Math.max(0, Math.round(p.achievementRate)) : W.rate(p);
  }

  function run() {
    const root = document.getElementById('wz-feed');
    if (!root || !W) return;

    const q = new URLSearchParams(location.search);
    state.feed = q.get('feed') || '';
    state.sort = q.get('sort') || 'popular';
    state.category = q.get('category') || 'all';
    state.q = (q.get('q') || '').trim();
    if (SORTS.findIndex(([k]) => k === state.sort) === -1) state.sort = 'popular';

    const isFollowing = state.feed === 'following';
    const isScheduled = state.feed === 'scheduled';
    // 정렬/카테고리/검색 필터가 없는 단순 피드(팔로잉·공개예정) — open_at·생성순 그대로 노출.
    const isSimple = isFollowing || isScheduled;

    const wrap = W.el('div', { class: 'wz-feedpage' + (isScheduled ? ' wz-feedpage--scheduled' : '') });
    root.appendChild(wrap);

    // 제목
    const head = W.el('div', { class: 'wz-feedpage__head' });
    const titleEl = W.el('h1', { class: 'wz-feedpage__title' }, titleText(isFollowing));
    head.appendChild(titleEl);
    // 공개예정 피드는 부제(알림신청 안내) 노출
    if (isScheduled) head.appendChild(W.el('p', { class: 'wz-feedpage__sub' }, '곧 만나볼 수 있어요 — 알림 신청하고 놓치지 마세요'));
    // 검색결과/전체보기에서 그 자리 재검색용 검색바(단순 피드는 제외)
    if (!isSimple) head.appendChild(SearchBar().node);
    wrap.appendChild(head);

    // 필터(단순 피드는 정렬/카테고리 필터 없이 그대로 전체)
    const filters = W.el('div', { class: 'wz-feedpage__filters' });
    if (!isSimple) {
      const sortRow = W.el('div', { class: 'wz-browse__sorts' });
      SORTS.forEach(([k, label]) => {
        const b = W.el('button', { class: 'wz-rank__tab' + (state.sort === k ? ' is-active' : ''), type: 'button' }, label);
        b.addEventListener('click', () => { if (state.sort !== k) { state.sort = k; pushUrl(); load(); } });
        sortRow.appendChild(b);
      });
      const chipRow = W.el('div', { class: 'wz-browse__chips' });
      const cats = [{ slug: 'all', label: '전체' }].concat(window.DT_CATEGORIES || []);
      cats.forEach((c) => {
        const b = W.el('button', { class: 'wz-chip' + (state.category === c.slug ? ' is-active' : ''), type: 'button' }, c.label);
        b.addEventListener('click', () => { if (state.category !== c.slug) { state.category = c.slug; pushUrl(); load(); } });
        chipRow.appendChild(b);
      });
      filters.append(sortRow, chipRow);
      wrap.appendChild(filters);
    }

    const body = W.el('div', { class: 'wz-feedpage__body' });
    wrap.appendChild(body);

    function pushUrl() {
      const p = new URLSearchParams();
      if (isFollowing) p.set('feed', 'following');
      else if (isScheduled) p.set('feed', 'scheduled');
      else {
        if (state.sort) p.set('sort', state.sort);
        if (state.category && state.category !== 'all') p.set('category', state.category);
      }
      if (state.q) p.set('q', state.q);
      try { history.replaceState({}, '', '/feed.html' + (p.toString() ? '?' + p.toString() : '')); } catch (_) {}
      // 활성 필터 칩/탭 갱신
      if (!isSimple) {
        filters.querySelectorAll('.wz-rank__tab').forEach((b, i) => b.classList.toggle('is-active', SORTS[i][0] === state.sort));
        const cats = [{ slug: 'all' }].concat(window.DT_CATEGORIES || []);
        filters.querySelectorAll('.wz-chip').forEach((b, i) => b.classList.toggle('is-active', cats[i] && cats[i].slug === state.category));
      }
    }

    // 검색결과 제목 텍스트(현재 q 기준)
    function titleText(following) {
      if (following) return '팔로잉';
      if (isScheduled) return '공개 예정';
      return state.q ? '"' + state.q + '" 검색 결과' : '프로젝트 전체보기';
    }

    // q 변경 적용 — URL/제목 갱신 후 캐시된 목록을 그 자리에서 재필터(네트워크 호출 없음).
    function applyQuery() {
      pushUrl();
      titleEl.textContent = titleText(isFollowing);
      render(body, state.lastItems, isFollowing);
    }

    // 검색결과 헤더 검색바 — 현재 q 프리필 + 디바운스(300ms) 라이브 + 엔터/버튼 즉시 재검색.
    function SearchBar() {
      // CSS 파일을 건드리지 않으므로 색/배경은 인라인으로 명확히(흰 배경·진한 글자).
      const node = W.el('form', {
        class: 'wz-feedpage__search', role: 'search',
        style: 'display:flex;align-items:center;gap:8px;max-width:420px;margin:12px 0 4px;'
          + 'background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:6px 10px;',
      });
      const input = W.el('input', {
        class: 'wz-feedpage__searchinput', type: 'search',
        placeholder: '검색어를 입력하세요', 'aria-label': '검색', value: state.q || '',
        style: 'flex:1;min-width:0;border:0;outline:none;background:transparent;'
          + 'color:#111;font-size:15px;line-height:1.4;',
      });
      const btn = W.el('button', {
        class: 'wz-feedpage__searchbtn', type: 'submit', 'aria-label': '검색', html: W.ICON.search,
        style: 'display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;'
          + 'flex:0 0 auto;border:0;background:transparent;color:#8B5CF6;cursor:pointer;padding:0;',
      });
      const svg = btn.querySelector('svg'); // 아이콘 크기 명시(외부 CSS 없이도 또렷이)
      if (svg) { svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); }
      node.append(input, btn);

      let timer = null;
      function commit() {
        if (timer) { clearTimeout(timer); timer = null; }
        const v = input.value.trim();
        if (v === state.q) return; // 변동 없음
        state.q = v;
        applyQuery();
      }
      input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(commit, 300); // 라이브(디바운스) 재검색
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); } // 엔터 즉시
      });
      node.addEventListener('submit', (e) => { e.preventDefault(); commit(); }); // 버튼 즉시
      return { node, input };
    }

    function load() {
      body.replaceChildren(W.skelGrid(12));   // 텍스트 로딩 대신 스켈레톤 카드(틀+shimmer)
      const onItems = (items) => { state.lastItems = items || []; render(body, state.lastItems, isFollowing); };
      const onError = () => { state.lastItems = []; render(body, [], isFollowing); };
      if (isScheduled) {
        // 공개 예정 — open_at 오름차순(서버 정렬 그대로). 비로그인도 목록은 노출.
        window.api.get('/groupbuys/scheduled?limit=200', { silentAuthFail: true })
          .then((data) => onItems((data && Array.isArray(data.items)) ? data.items : []))
          .catch(onError);
      } else if (isFollowing) {
        window.api.get('/me/following-feed?limit=200', { silentAuthFail: true })
          .then((data) => onItems((data && Array.isArray(data.items)) ? data.items : []))
          .catch(onError);
      } else {
        const qs = new URLSearchParams();
        qs.set('sort', state.sort);
        if (state.category && state.category !== 'all') qs.set('category', state.category);
        qs.set('limit', '200');
        window.api.get('/groupbuys?' + qs.toString(), { silentAuthFail: true })
          .then((data) => onItems((data && Array.isArray(data.items)) ? data.items : []))
          .catch(onError);
      }
    }

    load();
  }

  /* 검색어(?q) 클라이언트 필터 — 제목/창작자명 부분일치(대소문자 무시) */
  function filterByQuery(items, q) {
    if (!q) return items;
    const needle = q.toLowerCase();
    return items.filter((p) => {
      const t = String(p.title || '').toLowerCase();
      const a = String(p.creatorName || p.author || '').toLowerCase();
      return t.indexOf(needle) !== -1 || a.indexOf(needle) !== -1;
    });
  }

  function render(body, items, isFollowing) {
    const scheduled = state.feed === 'scheduled';
    const arr = filterByQuery(items, state.q);
    if (!arr.length) {
      body.replaceChildren(EmptyState(isFollowing));
      return;
    }
    const count = W.el('p', { class: 'wz-feedpage__count' }, arr.length + '개의 프로젝트');
    const grid = W.el('div', { class: 'wz-grid' });
    arr.forEach((p) => grid.appendChild(scheduled ? ScheduledCard(p) : Card(p)));
    body.replaceChildren(count, grid);
  }

  function EmptyState(isFollowing) {
    const empty = W.el('div', { class: 'wz-sec__empty' });
    if (state.feed === 'scheduled') {
      const img = W.el('img', { src: '/assets/empty-feed.png', alt: '' });
      img.addEventListener('error', () => img.remove());
      empty.append(img, W.el('p', {}, '공개 예정인 프로젝트가 없어요'),
        W.el('a', { class: 'wz-btn wz-btn--outline', href: '/feed.html' }, '전체 프로젝트 보기'));
    } else if (isFollowing) {
      const img = W.el('img', { src: '/assets/empty-following.png', alt: '' });
      img.addEventListener('error', () => img.remove());
      empty.append(img, W.el('p', {}, '팔로우한 창작자의 프로젝트가 없어요'));
    } else if (state.q) {
      const img = W.el('img', { src: '/assets/empty-feed.png', alt: '' });
      img.addEventListener('error', () => img.remove());
      empty.append(img, W.el('p', {}, '검색 결과가 없어요'),
        W.el('a', { class: 'wz-btn wz-btn--outline', href: '/feed.html' }, '전체 보기'));
    } else {
      const img = W.el('img', { src: '/assets/empty-feed.png', alt: '' });
      img.addEventListener('error', () => img.remove());
      empty.append(img, W.el('p', {}, '아직 등록된 프로젝트가 없어요'),
        W.el('a', { class: 'wz-btn wz-btn--primary', href: '/fund-create.html' }, '프로젝트 만들기'));
    }
    return empty;
  }

  /* 남은 기간 배지 — wz-home.js 와 동일 규칙(D-7 / D-1 / 오늘 마감 / 마감). */
  function ddayInfo(deadline) {
    const n = W.dday(deadline); // 한국시간(KST) 캘린더 기준 — 상세 페이지와 동일
    if (n == null) return null;
    if (n < 0) return { label: '마감', cls: 'closed' };
    if (n === 0) return { label: '오늘 마감', cls: 'urgent' };
    if (n <= 3) return { label: 'D-' + n, cls: 'urgent' };
    return { label: 'D-' + n, cls: '' };
  }
  function DdayBadge(p) {
    const info = ddayInfo(p.deadline);
    if (!info) return null;
    return W.el('span', { class: 'wz-dday' + (info.cls ? ' wz-dday--' + info.cls : '') }, info.label);
  }

  /* 카드 — 홈과 동일 스타일. 목록/팔로잉 양쪽 직렬화(coverImageUrl/creatorName/achievementRate) 흡수. */
  function Card(p) {
    const card = W.el('a', { class: 'wz-pcard', href: '/detail.html?id=' + encodeURIComponent(p.id) });
    const th = W.el('div', { class: 'wz-pcard__thumb' });
    W.fillThumb(th, { imageUrl: p.coverImageUrl || p.imageUrl || '', title: p.title, category: p.category });
    const badge = DdayBadge(p);
    if (badge) th.appendChild(badge);
    const liked = (typeof window.isLiked === 'function') && window.isLiked(p.id);
    const heart = W.el('button', { class: 'wz-pcard__heart' + (liked ? ' is-on' : ''), type: 'button', 'aria-label': '찜', html: W.ICON.heart });
    heart.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (typeof window.toggleLike !== 'function') return;
      const on = window.toggleLike(p.id);
      heart.classList.toggle('is-on', on);
      if (on) { heart.classList.remove('is-pop'); void heart.offsetWidth; heart.classList.add('is-pop'); }
    });
    th.appendChild(heart);
    card.appendChild(th);
    card.appendChild(W.el('p', { class: 'wz-pcard__rate' }, cardRate(p) + '% 달성'));
    card.appendChild(W.el('p', { class: 'wz-pcard__title' }, p.title || ''));
    card.appendChild(W.el('p', { class: 'wz-pcard__author' }, p.creatorName || p.author || '익명'));
    return card;
  }

  /* 공개 D-day 배지 — open_at 까지 남은 일수(KST). "오늘 공개"/"공개 D-N". 지났으면 "곧 공개". */
  function openDday(openAt) {
    const n = W.dday(openAt);
    if (n == null) return { label: '공개 예정', cls: '' };
    if (n < 0) return { label: '곧 공개', cls: 'soon' };
    if (n === 0) return { label: '오늘 공개', cls: 'soon' };
    return { label: '공개 D-' + n, cls: '' };
  }

  /* 공개 예정 카드 — D-day 대신 "공개 D-day" 배지 + 알림신청 버튼(구독 수 표시).
   * 카드 클릭은 상세(/detail.html?id=)로, 알림 버튼 클릭은 카드 이동을 막고 구독 토글. */
  function ScheduledCard(p) {
    const card = W.el('a', { class: 'wz-pcard wz-scard', href: '/detail.html?id=' + encodeURIComponent(p.id) });
    const th = W.el('div', { class: 'wz-pcard__thumb' });
    W.fillThumb(th, { imageUrl: p.coverImageUrl || p.imageUrl || '', title: p.title, category: p.category });
    const info = openDday(p.openAt);
    th.appendChild(W.el('span', { class: 'wz-soon' + (info.cls ? ' wz-soon--' + info.cls : '') }, info.label));
    card.appendChild(th);
    card.appendChild(W.el('p', { class: 'wz-pcard__title' }, p.title || ''));
    card.appendChild(W.el('p', { class: 'wz-pcard__author' }, p.creatorName || p.author || '익명'));
    card.appendChild(SubscribeBtn(p));
    return card;
  }

  /* 알림신청/취소 버튼 — POST/DELETE /api/groupbuys/:id/subscribe → {subscribed, count}.
   * 미로그인 클릭 시 api 가 401 → /login.html?return= 으로 보냄(silentAuthFail 미사용).
   * 구독 수(count|subscriberCount)를 함께 노출. 카드(<a>) 안의 버튼이므로 클릭 전파/기본이동 차단. */
  function SubscribeBtn(p) {
    let subscribed = !!p.subscribed;
    let count = Number(p.subscriberCount) || 0;
    const btn = W.el('button', { class: 'wz-subscribe', type: 'button' });
    const cnt = W.el('span', { class: 'wz-subscribe__cnt' });
    function paint() {
      btn.classList.toggle('is-on', subscribed);
      // 버튼 라벨은 텍스트 노드로(XSS 안전). 종 아이콘 + 라벨 + 수.
      btn.innerHTML = W.ICON.bell;
      const svg = btn.querySelector('svg');
      if (svg) { svg.setAttribute('width', '15'); svg.setAttribute('height', '15'); }
      btn.appendChild(document.createTextNode(subscribed ? '알림취소' : '알림신청'));
      cnt.textContent = count > 0 ? String(count) : '';
      cnt.style.display = count > 0 ? '' : 'none';
      btn.appendChild(cnt);
      btn.setAttribute('aria-pressed', subscribed ? 'true' : 'false');
    }
    paint();
    let busy = false;
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (busy) return;
      busy = true; btn.disabled = true;
      const path = '/groupbuys/' + encodeURIComponent(p.id) + '/subscribe';
      const req = subscribed ? window.api.del(path) : window.api.post(path, {});
      req.then((data) => {
        if (data && typeof data.subscribed === 'boolean') subscribed = data.subscribed;
        else subscribed = !subscribed;
        if (data && typeof data.count === 'number') count = data.count;
        else count = Math.max(0, count + (subscribed ? 1 : -1));
        paint();
      }).catch(() => { /* 401 은 api 가 로그인으로 리다이렉트. 그 외 오류는 상태 유지 */ })
        .finally(() => { busy = false; btn.disabled = false; });
    });
    return btn;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
