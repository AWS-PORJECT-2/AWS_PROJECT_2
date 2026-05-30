/* =====================================================================
 * 두띵 홈 (와디즈 클론, from scratch). wz-core.js(WZ) + mock-data.js 사용.
 * 검색바 → 원형 카테고리 → 텍스트 카테고리 → [히어로 | 실시간 베스트] → 취향 맞춤 그리드
 * ===================================================================== */
(function () {
  const W = window.WZ;
  function run() {
    const root = document.getElementById('wz-home');
    if (!root || !W) return;

    root.appendChild(W.SearchRow());
    root.appendChild(W.CategoryCircles());
    root.appendChild(W.CategoryMenu());

    const home = W.el('div', { class: 'wz-home' });
    const top = W.el('div', { class: 'wz-home__top' });
    const heroCol = W.el('div', { class: 'wz-home__hero' });
    const rankCol = W.el('aside', { class: 'wz-home__rank' });
    top.append(heroCol, rankCol);
    home.appendChild(top);
    const featured = W.el('section', { class: 'wz-sec' });
    home.appendChild(featured);
    root.appendChild(home);

    heroCol.appendChild(Hero());

    function build() {
      const products = Array.isArray(window.MOCK_PRODUCTS) ? window.MOCK_PRODUCTS : [];
      rankCol.replaceChildren(RankList(products));
      const fresh = [...products].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 8);
      featured.replaceChildren(FeaturedGrid('취향 맞춤 프로젝트', '지금 함께 만드는 성공', fresh));
    }
    build();
    window.addEventListener('mockproducts:updated', build);
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
    head.append(W.el('h2', { class: 'wz-rank__title' }, '실시간 베스트'), W.el('a', { class: 'wz-rank__more', href: '/feed.html?sort=popular' }, '전체보기'));
    sec.appendChild(head);
    const tabs = W.el('div', { class: 'wz-rank__tabs' });
    const wrap = W.el('div', {});
    function render(sortKey) {
      let arr = [...products];
      if (sortKey === 'latest') arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      else if (sortKey === 'ending') arr.sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0));
      else arr.sort((a, b) => W.rate(b) - W.rate(a));
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

  function FeaturedGrid(title, sub, items) {
    const sec = W.el('section', { class: 'wz-sec' });
    const head = W.el('div', { class: 'wz-sec__head' });
    const left = W.el('div', {});
    left.append(W.el('h2', { class: 'wz-sec__title' }, title), W.el('p', { class: 'wz-sec__sub' }, sub));
    head.appendChild(left);
    sec.appendChild(head);
    if (!items || !items.length) {
      sec.appendChild(W.el('div', { class: 'wz-sec__empty' },
        (function () { const i = W.el('img', { src: '/assets/empty-feed.png', alt: '' }); i.addEventListener('error', () => i.remove()); return i; })(),
        W.el('p', {}, '아직 등록된 프로젝트가 없어요'),
        W.el('a', { class: 'wz-btn wz-btn--primary', href: '/fund-create.html' }, '프로젝트 만들기')));
      return sec;
    }
    const grid = W.el('div', { class: 'wz-grid' });
    items.forEach((p) => grid.appendChild(Card(p)));
    sec.appendChild(grid);
    return sec;
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
      const on = window.toggleLike(p.id);
      heart.classList.toggle('is-on', on);
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
