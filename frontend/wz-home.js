/* =====================================================================
 * 두띵 홈 (와디즈 클론) — 단일 둘러보기 허브.
 * 검색 → 원형 카테고리 → 텍스트 카테고리 → [히어로 | 실시간 베스트]
 *  → 둘러보기(정렬 탭 + 카테고리 칩 + 그리드, 그 자리에서 필터)
 * 헤더 내비(인기/신규/마감임박)·카테고리 클릭은 새 페이지가 아니라 wz:browse 이벤트로 홈 그리드만 갱신.
 * ===================================================================== */
(function () {
  const W = window.WZ;
  const state = { sort: 'popular', category: 'all' };

  function run() {
    const root = document.getElementById('wz-home');
    if (!root || !W) return;

    root.appendChild(W.SearchRow());
    root.appendChild(W.CategoryCircles());

    const home = W.el('div', { class: 'wz-home' });
    const top = W.el('div', { class: 'wz-home__top' });
    const heroCol = W.el('div', { class: 'wz-home__hero' }, Hero());
    const rankCol = W.el('aside', { class: 'wz-home__rank' });
    top.append(heroCol, rankCol);
    home.appendChild(top);
    const browse = BrowseSection();
    home.appendChild(browse.node);
    root.appendChild(home);

    // 초기 상태: URL ?sort= / ?category=
    const q = new URLSearchParams(location.search);
    if (q.get('sort')) state.sort = q.get('sort');
    if (q.get('category')) state.category = q.get('category');

    function build() {
      const products = Array.isArray(window.MOCK_PRODUCTS) ? window.MOCK_PRODUCTS : [];
      rankCol.replaceChildren(RankList(products));
      browse.render(products);
    }
    build();
    window.addEventListener('mockproducts:updated', build);

    // 헤더 내비/카테고리 클릭 → 홈 그리드만 갱신
    window.addEventListener('wz:browse', (e) => {
      const d = e.detail || {};
      if (!d.sort && !d.category) { state.sort = 'popular'; state.category = 'all'; } // 홈 = 초기화
      if (d.sort) state.sort = d.sort;
      if (d.category) state.category = d.category;
      build();
      browse.node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    window.addEventListener('popstate', () => {
      const q2 = new URLSearchParams(location.search);
      state.sort = q2.get('sort') || 'popular';
      state.category = q2.get('category') || 'all';
      build();
    });
  }

  function Hero() {
    const a = W.el('a', { class: 'wz-hero', href: '/feed.html' });
    const img = W.el('img', { class: 'wz-hero__img', src: '/assets/hero-main.png', alt: '두띵 — 대학생 굿즈 크라우드펀딩', loading: 'eager' });
    img.addEventListener('error', () => img.remove());
    a.appendChild(img);
    const cap = W.el('div', { class: 'wz-hero__cap' });
    cap.appendChild(W.el('h2', {}, '우리의 상상을\n현실로 만드는 곳'));
    a.appendChild(cap);
    a.appendChild(W.el('div', { class: 'wz-hero__bar' }, W.el('i', {})));
    return a;
  }

  function RankList(products) {
    const sec = W.el('section', {});
    const head = W.el('div', { class: 'wz-rank__head' });
    head.append(W.el('h2', { class: 'wz-rank__title' }, '실시간 베스트'), W.el('a', { class: 'wz-rank__more', href: '#', onClick: (e) => { e.preventDefault(); W.go({ sort: 'popular' }); } }, '전체보기'));
    sec.appendChild(head);
    sec.appendChild(W.el('p', { class: 'wz-rank__cap' }, '이번 주 참여 많은 순'));
    const tabs = W.el('div', { class: 'wz-rank__tabs' });
    const wrap = W.el('div', {});
    function render(sortKey) {
      let arr = [...products];
      if (sortKey === 'latest') arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      else if (sortKey === 'ending') arr.sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0));
      else arr.sort((a, b) => (b.currentQuantity || 0) - (a.currentQuantity || 0)); // 인기 = 참여(후원) 많은 순
      arr = arr.slice(0, 6);
      if (!arr.length) {
        wrap.replaceChildren(W.el('div', { class: 'wz-rank__empty' },
          W.el('p', {}, '아직 진행 중인 프로젝트가 없어요'),
          W.el('a', { class: 'wz-btn wz-btn--outline', href: '/fund-create.html' }, '프로젝트 만들기')));
        return;
      }
      const ol = W.el('ol', { class: 'wz-rank__list' });
      arr.forEach((p, i) => {
        const li = W.el('a', { class: 'wz-rank__item', href: '/detail.html?id=' + encodeURIComponent(p.id) });
        li.appendChild(W.el('span', { class: 'wz-rank__no' + (i < 3 ? ' is-top' : '') }, String(i + 1)));
        const th = W.el('div', { class: 'wz-rank__thumb' }); W.fillThumb(th, p); li.appendChild(th);
        const info = W.el('div', { class: 'wz-rank__info' });
        info.append(
          W.el('p', { class: 'wz-rank__author' }, p.author || p.creatorName || '익명'),
          W.el('p', { class: 'wz-rank__name' }, p.title || ''),
          W.el('p', { class: 'wz-rank__rate' }, W.rate(p) + '% 달성'));
        li.appendChild(info); ol.appendChild(li);
      });
      wrap.replaceChildren(ol);
    }
    [['popular', '인기'], ['latest', '신규'], ['ending', '마감임박']].forEach(([k, label], idx) => {
      const b = W.el('button', { class: 'wz-rank__tab' + (idx === 0 ? ' is-active' : ''), type: 'button' }, label);
      b.addEventListener('click', () => { tabs.querySelectorAll('.wz-rank__tab').forEach((x) => x.classList.remove('is-active')); b.classList.add('is-active'); render(k); });
      tabs.appendChild(b);
    });
    sec.append(tabs, wrap);
    render('popular');
    return sec;
  }

  /* 둘러보기 — 정렬 탭 + 카테고리 칩 + 그리드 (그 자리에서 필터) */
  function BrowseSection() {
    const node = W.el('section', { class: 'wz-browse' });
    node.appendChild(W.el('h2', { class: 'wz-sec__title' }, '프로젝트 둘러보기'));
    const sortRow = W.el('div', { class: 'wz-browse__sorts' });
    const chipRow = W.el('div', { class: 'wz-browse__chips' });
    const gridWrap = W.el('div', {});
    node.append(sortRow, chipRow, gridWrap);

    const SORTS = [['popular', '인기순'], ['latest', '신규순'], ['ending', '마감임박순']];
    function render(products) {
      sortRow.replaceChildren(...SORTS.map(([k, label]) => {
        const b = W.el('button', { class: 'wz-rank__tab' + (state.sort === k ? ' is-active' : ''), type: 'button' }, label);
        b.addEventListener('click', () => W.go({ sort: k, category: state.category }));
        return b;
      }));
      const cats = [{ slug: 'all', label: '전체' }].concat(window.DT_CATEGORIES || []);
      chipRow.replaceChildren(...cats.map((c) => {
        const b = W.el('button', { class: 'wz-chip' + (state.category === c.slug ? ' is-active' : ''), type: 'button' }, c.label);
        b.addEventListener('click', () => W.go({ sort: state.sort, category: c.slug }));
        return b;
      }));
      let arr = (products || []).filter((p) => state.category === 'all' || p.category === state.category);
      if (state.sort === 'latest') arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      else if (state.sort === 'ending') arr.sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0));
      else arr.sort((a, b) => (b.currentQuantity || 0) - (a.currentQuantity || 0)); // 인기 = 참여 많은 순
      if (!arr.length) {
        const empty = W.el('div', { class: 'wz-sec__empty' });
        const img = W.el('img', { src: '/assets/empty-feed.png', alt: '' }); img.addEventListener('error', () => img.remove());
        empty.append(img, W.el('p', {}, '아직 등록된 프로젝트가 없어요'), W.el('a', { class: 'wz-btn wz-btn--primary', href: '/fund-create.html' }, '프로젝트 만들기'));
        gridWrap.replaceChildren(empty);
        return;
      }
      const grid = W.el('div', { class: 'wz-grid' });
      arr.forEach((p) => grid.appendChild(Card(p)));
      gridWrap.replaceChildren(grid);
    }
    return { node, render };
  }

  function Card(p) {
    const card = W.el('a', { class: 'wz-pcard', href: '/detail.html?id=' + encodeURIComponent(p.id) });
    const th = W.el('div', { class: 'wz-pcard__thumb' });
    W.fillThumb(th, p);
    const liked = (typeof window.isLiked === 'function') && window.isLiked(p.id);
    const heart = W.el('button', { class: 'wz-pcard__heart' + (liked ? ' is-on' : ''), type: 'button', 'aria-label': '찜', html: W.ICON.heart });
    heart.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (typeof window.toggleLike !== 'function') return;
      heart.classList.toggle('is-on', window.toggleLike(p.id));
    });
    th.appendChild(heart);
    card.appendChild(th);
    card.appendChild(W.el('p', { class: 'wz-pcard__rate' }, W.rate(p) + '% 달성'));
    card.appendChild(W.el('p', { class: 'wz-pcard__title' }, p.title || ''));
    card.appendChild(W.el('p', { class: 'wz-pcard__author' }, p.author || p.creatorName || '익명'));
    return card;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
