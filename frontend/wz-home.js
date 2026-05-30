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
    // 큐레이션 선반(마감임박/신규오픈) + 프로모션 — 스크롤하면 더 보이게
    const shelves = W.el('div', { class: 'wz-shelves' });
    home.appendChild(shelves);

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
      shelves.replaceChildren.apply(shelves, buildShelves(products));
      browse.render(products);
    }
    build();
    window.addEventListener('mockproducts:updated', build);

    // 헤더 내비/카테고리 클릭 → 홈 그리드만 갱신
    window.addEventListener('wz:browse', (e) => {
      const d = e.detail || {};
      const isReset = !d.sort && !d.category;
      if (isReset) { state.sort = 'popular'; state.category = 'all'; } // 홈 = 초기화
      if (d.sort) state.sort = d.sort;
      if (d.category) state.category = d.category;
      build();
      // 홈(리셋)은 진짜 첫 화면 맨 위로, 정렬/카테고리 선택은 둘러보기 섹션으로
      if (isReset) window.scrollTo({ top: 0, behavior: 'smooth' });
      else browse.node.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const wrap = W.el('div', {});
    // 참여(후원) 많은 순 상위 6
    const arr = [...products].sort((a, b) => (b.currentQuantity || 0) - (a.currentQuantity || 0)).slice(0, 6);
    if (!arr.length) {
      wrap.appendChild(W.el('div', { class: 'wz-rank__empty' },
        W.el('p', {}, '아직 진행 중인 프로젝트가 없어요'),
        W.el('a', { class: 'wz-btn wz-btn--outline', href: '/fund-create.html' }, '프로젝트 만들기')));
    } else {
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
      wrap.appendChild(ol);
    }
    sec.appendChild(wrap);
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

  /* ---- 큐레이션 선반 (가로 스크롤 캐러셀) + 프로모션 ---- */
  function buildShelves(products) {
    const out = [];
    const now = Date.now();

    // 마감 임박: 마감일이 남아있는 것 중 가까운 순
    const ending = (products || [])
      .filter((p) => p.deadline && new Date(p.deadline).getTime() > now)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
      .slice(0, 12);
    if (ending.length >= 3) out.push(Shelf('마감 임박', '놓치면 아쉬운, 곧 마감되는 프로젝트', ending, { sort: 'ending' }));

    // 신규 오픈: 최근 생성 순
    const fresh = [...(products || [])]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 12);
    if (fresh.length >= 3) out.push(Shelf('신규 오픈', '두띵에 막 올라온 따끈한 프로젝트', fresh, { sort: 'latest' }));

    // 프로모션 밴드 (직접 개설 vs 대리 개설)
    out.push(PromoBand());

    return out;
  }

  function Shelf(title, subtitle, items, moreQuery) {
    const sec = W.el('section', { class: 'wz-shelf' });
    const head = W.el('div', { class: 'wz-shelf__head' });
    const titles = W.el('div', {});
    titles.appendChild(W.el('h2', { class: 'wz-shelf__title' }, title));
    if (subtitle) titles.appendChild(W.el('p', { class: 'wz-shelf__sub' }, subtitle));
    const more = W.el('a', { class: 'wz-shelf__more', href: '#', onClick: (e) => { e.preventDefault(); W.go(moreQuery || { sort: 'popular' }); } }, '전체보기');
    head.append(titles, more);
    sec.appendChild(head);
    const scroll = W.el('div', { class: 'wz-shelf__scroll' });
    items.forEach((p) => scroll.appendChild(Card(p)));
    sec.appendChild(scroll);
    return sec;
  }

  function PromoBand() {
    const band = W.el('section', { class: 'wz-promo' });
    const a = W.el('a', { class: 'wz-promo__card wz-promo__card--make', href: '/fund-create.html?mode=normal' });
    a.append(
      W.el('p', { class: 'wz-promo__eyebrow' }, '직접 개설'),
      W.el('h3', { class: 'wz-promo__title' }, '내 손으로 만드는\n우리 과 굿즈'),
      W.el('p', { class: 'wz-promo__desc' }, '낮은 수수료로 디자인부터 직접. 5분이면 충분해요.'),
      W.el('span', { class: 'wz-promo__cta' }, '프로젝트 만들기'));
    const b = W.el('a', { class: 'wz-promo__card wz-promo__card--proxy', href: '/fund-create.html?mode=proxy' });
    b.append(
      W.el('p', { class: 'wz-promo__eyebrow' }, '대리 개설'),
      W.el('h3', { class: 'wz-promo__title' }, '기획부터 운영까지\n두띵이 대신'),
      W.el('p', { class: 'wz-promo__desc' }, '아이디어만 주세요. 디자인·리워드·운영을 맡아드려요.'),
      W.el('span', { class: 'wz-promo__cta' }, '대리 개설 신청'));
    band.append(a, b);
    return band;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
