/* =====================================================================
 * 두띵 홈 (와디즈 클론) — 단일 둘러보기 허브.
 * 검색 → 원형 카테고리 → 텍스트 카테고리 → [히어로 | 실시간 베스트]
 *  → 둘러보기(정렬 탭 + 카테고리 칩 + 그리드, 그 자리에서 필터)
 * 헤더 내비(인기/신규/마감임박)·카테고리 클릭은 새 페이지가 아니라 wz:browse 이벤트로 홈 그리드만 갱신.
 * ===================================================================== */
(function () {
  const W = window.WZ;
  const state = { sort: 'popular', category: 'all' };

  /* 카드 달성률 — 서버 계약의 금액 기준 achievementRate 우선, 없으면(구펀드) 공용 W.rate(수량 기준) 폴백.
   * loadProductsFromBackend 가 서버 achievementRate 를 product.achievementRate 로 매핑해 둔다.
   * (카드는 .wz-pcard__rate 한 줄만 — 목표/모인 금액 보조 표기는 카드 CSS(wz.css, 미배정) 의존이라 상세에서만 노출) */
  function cardRate(p) {
    return (p && typeof p.achievementRate === 'number') ? Math.max(0, Math.round(p.achievementRate)) : W.rate(p);
  }
  /* 카드 모인 금액(현재) — achievedAmount(활성 후원 합계) 우선. */
  function cardAmount(p) {
    return Math.max(0, Number(p && (p.achievedAmount != null ? p.achievedAmount : p.currentAmount)) || 0);
  }
  /* % 달성 + 모인 금액 한 줄 엘리먼트. (% 보라 강조 + 모인금액 회색) */
  function RateLine(p) {
    const line = W.el('p', { class: 'wz-pcard__rate' }, cardRate(p) + '% 달성');
    line.appendChild(W.el('span', { class: 'wz-pcard__amount' }, W.money(cardAmount(p)) + ' 달성'));
    return line;
  }

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

    // 공개 예정 — GET /api/groupbuys/scheduled 결과 있을 때만 채움(없으면 미표시)
    const scheduledWrap = W.el('div', { class: 'wz-scheduledwrap' });
    home.appendChild(scheduledWrap);

    // 팔로우한 창작자의 프로젝트 — 로그인 시에만 채움(비로그인은 미표시)
    const followingWrap = W.el('div', { class: 'wz-following' });
    home.appendChild(followingWrap);

    const browse = BrowseSection();
    home.appendChild(browse.node);

    // 최근 본 프로젝트 — 둘러보기 바로 아래. localStorage recentFunds ∩ 현재 존재하는 펀드만(있을 때만 표시)
    const recentWrap = W.el('div', { class: 'wz-recentwrap' });
    home.appendChild(recentWrap);

    root.appendChild(home);

    // 초기 상태: URL ?sort= / ?category=
    const q = new URLSearchParams(location.search);
    const hasInitialBrowse = !!(q.get('sort') || q.get('category'));
    if (q.get('sort')) state.sort = q.get('sort');
    if (q.get('category')) state.category = q.get('category');

    let dataLoaded = false;
    function build() {
      const products = Array.isArray(window.MOCK_PRODUCTS) ? window.MOCK_PRODUCTS : [];
      // 데이터 도착 전(아직 빈 배열)에는 빈 상태 대신 스켈레톤을 그려 '빈 화면 → 한꺼번에 팝인' 체감을 줄인다.
      const loading = !dataLoaded && products.length === 0;
      rankCol.replaceChildren(loading ? SkelRankSection() : RankList(products));
      if (loading) shelves.replaceChildren(SkelShelf(), SkelShelf());
      else shelves.replaceChildren.apply(shelves, buildShelves(products));
      browse.render(products, loading);
      buildRecent(recentWrap, products);
    }
    build();
    window.addEventListener('mockproducts:updated', function () { dataLoaded = true; build(); });

    // 비-홈 페이지에서 인기/신규/마감임박·카테고리를 누르면 go() 가 /main.html?sort= 로 이동시킨다.
    // 그 결과 URL 에 ?sort/?category 가 있으면(=둘러보기 의도) 한 번의 클릭으로 정렬 적용 + 둘러보기 섹션으로 스크롤.
    // 파라미터가 없으면(그냥 홈 진입) 스크롤하지 않고 맨 위 유지.
    // 콘텐츠 렌더 후 위치가 안정된 다음 스크롤하도록 rAF 2프레임 뒤로 미룬다.
    if (hasInitialBrowse) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          browse.node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    // 팔로잉 피드는 MOCK_PRODUCTS 와 독립 — 1회만 로드
    buildFollowing(followingWrap);

    // 공개 예정 섹션 — GET /api/groupbuys/scheduled (있을 때만 표시), 1회 로드
    buildScheduled(scheduledWrap);

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

  const HERO_IMAGES = [
    '/assets/hero-main.png',
    '/assets/home-banner-1.png',
    '/assets/home-banner-2.png',
    '/assets/home-banner-3.png'
  ];

  function Hero() {
    // 클릭 가능한 캐러셀. 기본 배너(둘러보기로 이동) + Boost 프로젝트 커버(상세로 이동)를 교차 노출.
    const a = W.el('a', { class: 'wz-hero', href: '/feed.html', 'aria-label': '두띵 — 대학생 굿즈 크라우드펀딩' });
    const track = W.el('div', { class: 'wz-hero__track' });
    const dotsRow = W.el('div', { class: 'wz-hero__dots' });
    const slides = [];
    const dots = [];
    // 슬라이드별 목적지: null = 기본(둘러보기 인기순), 문자열 = 해당 detail.html URL
    const slideHrefs = [];
    // 캐러셀 상태 — addSlide()/start()/show() 보다 먼저 선언해야 TDZ ReferenceError 방지(초기 addSlide 가 start() 호출).
    let cur = 0;
    let timer = null;

    // 활성 슬라이드의 목적지에 따라 이동(기본 배너=둘러보기, Boost=상세)
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const href = slideHrefs[cur];
      if (href) location.href = href;
      else W.go({ sort: 'popular' });
    });

    // 슬라이드 1장을 만들어 트랙/점에 추가. href 가 있으면 클릭 시 그 detail 로.
    function addSlide(src, opts) {
      opts = opts || {};
      const isFirst = slides.length === 0;
      const slide = W.el('div', { class: 'wz-hero__slide' + (isFirst ? ' is-active' : '') + (opts.boost ? ' is-boost' : '') });
      const img = W.el('img', { class: 'wz-hero__img', src, alt: opts.alt || '', loading: isFirst ? 'eager' : 'lazy' });
      img.addEventListener('error', () => removeSlide(slide));
      slide.appendChild(img);
      // Boost 슬라이드는 좌하단에 프로젝트 제목/창작자 라벨(가독용 그라데이션 위)
      if (opts.boost && opts.label) {
        const lab = W.el('div', { class: 'wz-hero__boostlab' });
        lab.appendChild(W.el('span', { class: 'wz-hero__boosttag' }, 'BOOST'));
        const txt = W.el('div', { class: 'wz-hero__boosttxt' });
        txt.appendChild(W.el('strong', {}, opts.label));
        if (opts.sub) txt.appendChild(W.el('span', {}, opts.sub));
        lab.appendChild(txt);
        slide.appendChild(lab);
      }
      track.appendChild(slide);

      const dot = W.el('button', { class: 'wz-hero__dot' + (isFirst ? ' is-active' : ''), type: 'button', 'aria-label': (slides.length + 1) + '번째 배너' });
      dot.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const idx = slides.indexOf(slide);
        if (idx !== -1) show(idx);
        restart();
      });
      dotsRow.appendChild(dot);

      slides.push(slide);
      dots.push(dot);
      slideHrefs.push(opts.href || null);
      // 슬라이드 수 변동에 맞춰 점/자동전환 상태 갱신
      dotsRow.style.display = slides.length > 1 ? '' : 'none';
      start();
    }

    HERO_IMAGES.forEach((src) => addSlide(src, {}));

    a.append(track, dotsRow);

    const cap = W.el('div', { class: 'wz-hero__cap' });
    // 로운님 글씨 이미지(보라 그라데이션) — 배너 위에 또렷이. 실패 시 텍스트 캡션 폴백.
    const capImg = W.el('img', { class: 'wz-hero__captext', src: '/assets/%EA%B8%80.png', alt: '우리의 상상을 현실로', loading: 'eager' });
    capImg.addEventListener('error', () => {
      capImg.remove();
      cap.appendChild(W.el('h2', {}, '우리의 상상을\n현실로 만드는 곳'));
    });
    cap.appendChild(capImg);
    a.appendChild(cap);

    function show(idx) {
      if (!slides.length) return;
      cur = (idx + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle('is-active', i === cur));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === cur));
    }
    function next() { show(cur + 1); }

    function start() {
      if (timer || slides.length <= 1) return; // 중복 생성 금지 / 1장이면 자동전환 불필요
      timer = setInterval(next, 5000);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function restart() { stop(); start(); }

    function removeSlide(slide) {
      const idx = slides.indexOf(slide);
      if (idx === -1) return;
      slide.remove();
      dots[idx].remove();
      slides.splice(idx, 1);
      dots.splice(idx, 1);
      slideHrefs.splice(idx, 1);
      if (!slides.length) { stop(); a.remove(); return; } // 모두 실패하면 히어로 자체 제거
      if (slides.length === 1) { dotsRow.style.display = 'none'; stop(); }
      show(cur >= slides.length ? 0 : cur); // 인덱스 보정 후 활성 슬라이드 재적용
    }

    // 마우스 호버 시 자동 전환 일시정지
    a.addEventListener('mouseenter', stop);
    a.addEventListener('mouseleave', start);

    if (slides.length <= 1) dotsRow.style.display = 'none';
    show(0);
    start();

    // Boost 요금제 프로젝트 커버를 히어로에 합류(상단 페이지 노출 혜택). 비면 기본 배너만.
    window.api.get('/groupbuys/boost-banners', { silentAuthFail: true })
      .then((data) => {
        const items = (data && Array.isArray(data.items)) ? data.items : [];
        items.forEach((b) => {
          if (!b || !b.coverImageUrl || b.id == null) return; // 커버 없으면 스킵(빈 슬라이드 금지)
          addSlide(b.coverImageUrl, {
            boost: true,
            href: '/detail.html?id=' + encodeURIComponent(b.id),
            label: b.title || '',
            sub: b.creatorName || '',
            alt: b.title || '',
          });
        });
      })
      .catch(() => {}); // 실패하면 기본 배너 유지

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
        const th = W.el('div', { class: 'wz-rank__thumb' }); W.fillThumb(th, p);
        const badge = DdayBadge(p);
        if (badge) th.appendChild(badge);
        li.appendChild(th);
        const info = W.el('div', { class: 'wz-rank__info' });
        info.append(
          W.el('p', { class: 'wz-rank__author' }, p.author || p.creatorName || '익명'),
          W.el('p', { class: 'wz-rank__name' }, p.title || ''),
          W.el('p', { class: 'wz-rank__rate' }, cardRate(p) + '% 달성'));
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

    const SORTS = [['popular', '인기순'], ['latest', '신규순'], ['ending', '마감임박순'], ['ended', '마감']];
    // '마감' 탭 — 로컬(진행중) 목록엔 없으므로 서버에서 종료 프로젝트를 직접 가져온다.
    function renderEnded() {
      gridWrap.replaceChildren(SkelGrid(12));
      const qs = new URLSearchParams(); qs.set('sort', 'ended');
      if (state.category && state.category !== 'all') qs.set('category', state.category);
      qs.set('limit', '24');
      window.api.get('/groupbuys?' + qs.toString(), { silentAuthFail: true }).then((data) => {
        // 서버 카드(coverImageUrl/creatorName)를 Card 가 쓰는 형태(imageUrl/author)로 매핑 — 안 하면 썸네일이 폴백 일러스트로 나옴.
        const arr = ((data && Array.isArray(data.items)) ? data.items : []).map((p) => ({ ...p, imageUrl: p.coverImageUrl || '', author: p.creatorName || '익명' }));
        if (!arr.length) {
          const empty = W.el('div', { class: 'wz-sec__empty' });
          const img = W.el('img', { src: '/assets/empty-feed.png', alt: '' }); img.addEventListener('error', () => img.remove());
          empty.append(img, W.el('p', {}, '마감된 프로젝트가 아직 없어요'));
          gridWrap.replaceChildren(empty); return;
        }
        const shown = arr.slice(0, 12);
        const grid = W.el('div', { class: 'wz-grid' });
        shown.forEach((p) => grid.appendChild(Card(p)));
        const frag = document.createDocumentFragment(); frag.appendChild(grid);
        if (arr.length > shown.length) {
          const more = W.el('div', { class: 'wz-browse__more' });
          const q2 = new URLSearchParams(); q2.set('sort', 'ended');
          if (state.category && state.category !== 'all') q2.set('category', state.category);
          more.appendChild(W.el('a', { class: 'wz-btn wz-btn--outline', href: '/feed.html?' + q2.toString() }, '마감 프로젝트 전체보기 (' + arr.length + ')'));
          frag.appendChild(more);
        }
        gridWrap.replaceChildren(frag);
      }).catch(() => { gridWrap.replaceChildren(W.el('div', { class: 'wz-sec__empty' }, W.el('p', {}, '불러오지 못했어요'))); });
    }
    function render(products, loading) {
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
      // 로딩 중이면 탭/칩(정적)만 먼저 보이고 그리드는 스켈레톤 카드로 채운다.
      if (loading) { gridWrap.replaceChildren(SkelGrid(12)); return; }
      if (state.sort === 'ended') { renderEnded(); return; }   // 마감 = 서버에서 종료 프로젝트
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
      // 홈은 기본 3줄(데스크톱 4열×3 = 12개)만, 나머지는 별도 전체목록 페이지로
      const BROWSE_HOME_LIMIT = 12;
      const shown = arr.slice(0, BROWSE_HOME_LIMIT);
      const grid = W.el('div', { class: 'wz-grid' });
      shown.forEach((p) => grid.appendChild(Card(p)));
      const frag = document.createDocumentFragment();
      frag.appendChild(grid);
      if (arr.length > shown.length) {
        const more = W.el('div', { class: 'wz-browse__more' });
        const qs = new URLSearchParams();
        qs.set('sort', state.sort);
        if (state.category && state.category !== 'all') qs.set('category', state.category);
        more.appendChild(W.el('a', { class: 'wz-btn wz-btn--outline', href: '/feed.html?' + qs.toString() },
          '프로젝트 전체보기 (' + arr.length + ')'));
        frag.appendChild(more);
      }
      gridWrap.replaceChildren(frag);
    }
    return { node, render };
  }

  /* ── 로딩 스켈레톤 — 데이터 도착 전 '틀 + shimmer' 를 먼저 보여 빈 화면/팝인 체감을 줄인다. ── */
  function SkelLines(n) {
    const box = W.el('div', { class: 'wz-skel-lines' });
    for (let i = 0; i < (n || 2); i++) {
      box.appendChild(W.el('div', { class: 'wz-skel wz-skel-line' + (i === 0 ? ' wz-skel-line--sm' : '') }));
    }
    return box;
  }
  function SkelCard() {
    const c = W.el('div', { class: 'wz-pcard wz-pcard--skel', 'aria-hidden': 'true' });
    c.appendChild(W.el('div', { class: 'wz-pcard__thumb wz-skel' }));
    c.appendChild(SkelLines(3));
    return c;
  }
  function SkelGrid(n) {
    const g = W.el('div', { class: 'wz-grid' });
    for (let i = 0; i < (n || 8); i++) g.appendChild(SkelCard());
    return g;
  }
  function SkelRankSection() {
    const sec = W.el('section', { class: 'wz-rank' });
    sec.appendChild(W.el('div', { class: 'wz-rank__head' }, W.el('h2', { class: 'wz-rank__title' }, '실시간 베스트')));
    const wrap = W.el('div', {});
    for (let i = 0; i < 5; i++) {
      const row = W.el('div', { class: 'wz-rank__item wz-rank__item--skel', 'aria-hidden': 'true' });
      row.append(W.el('span', { class: 'wz-skel wz-skel-rankno' }), W.el('div', { class: 'wz-rank__thumb wz-skel' }), SkelLines(2));
      wrap.appendChild(row);
    }
    sec.appendChild(wrap);
    return sec;
  }
  function SkelShelf() {
    const sec = W.el('section', { class: 'wz-shelf', 'aria-hidden': 'true' });
    const head = W.el('div', { class: 'wz-shelf__head' });
    head.appendChild(W.el('div', { class: 'wz-skel wz-skel-line wz-skel-title' }));
    sec.appendChild(head);
    const scroll = W.el('div', { class: 'wz-shelf__scroll' });
    for (let i = 0; i < 4; i++) scroll.appendChild(SkelCard());
    sec.appendChild(scroll);
    return sec;
  }

  /* 남은 기간 배지 — deadline → D-7 / D-1 / 오늘 마감 / 마감. 마감 임박은 강조색. */
  function ddayInfo(deadline) {
    const n = W.dday(deadline); // 한국시간(KST) 캘린더 기준 — 상세 페이지와 동일
    if (n == null) return null;
    if (n < 0) return { label: '마감', cls: 'is-closed' };
    if (n === 0) return { label: '오늘 마감', cls: 'is-urgent' };
    if (n <= 3) return { label: 'D-' + n, cls: 'is-urgent' };
    return { label: 'D-' + n, cls: '' };
  }
  function DdayBadge(p) {
    const info = ddayInfo(p.deadline);
    if (!info) return null;
    return W.el('span', { class: 'wz-dday' + (info.cls ? ' wz-dday--' + info.cls.replace('is-', '') : '') }, info.label);
  }

  function Card(p) {
    const card = W.el('a', { class: 'wz-pcard', href: '/detail.html?id=' + encodeURIComponent(p.id) });
    const th = W.el('div', { class: 'wz-pcard__thumb' });
    W.fillThumb(th, p);
    const badge = DdayBadge(p);
    if (badge) th.appendChild(badge);
    const liked = (typeof window.isLiked === 'function') && window.isLiked(p.id);
    // 하트는 버튼만(개수 미표시 — 개수는 상세에서). 토글만 동작.
    const heart = W.el('button', { class: 'wz-pcard__heart' + (liked ? ' is-on' : ''), type: 'button', 'aria-label': '찜', html: W.ICON.heart });
    heart.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (typeof window.toggleLike !== 'function') return;
      const on = window.toggleLike(p.id);
      heart.classList.toggle('is-on', on);
      if (on) { heart.classList.remove('is-pop'); void heart.offsetWidth; heart.classList.add('is-pop'); }
    });
    // 서버 동기화/외부 토글 시 하트 상태만 갱신. 카드가 DOM 에서 빠지면 리스너 자기 제거.
    function onLikesUpdated(ev) {
      if (!card.isConnected) { window.removeEventListener('likes:updated', onLikesUpdated); return; }
      const d = ev.detail || {};
      if (d.id != null && !d.synced && String(d.id) !== String(p.id)) return;
      heart.classList.toggle('is-on', (typeof window.isLiked === 'function') && window.isLiked(p.id));
    }
    window.addEventListener('likes:updated', onLikesUpdated);
    th.appendChild(heart);
    card.appendChild(th);
    card.appendChild(RateLine(p));
    card.appendChild(W.el('p', { class: 'wz-pcard__title' }, p.title || ''));
    card.appendChild(W.el('p', { class: 'wz-pcard__author' }, p.author || p.creatorName || '익명'));
    return card;
  }

  /* ---- 팔로우한 창작자의 프로젝트 ----
   * 컨테이너를 먼저 배치 → 로그인 확인 동안 스켈레톤 노출(체감 지연 완화).
   * 로그인 상태면 GET /api/me/following-feed → 카드 그리드로 교체.
   * 결과 없으면 안내 + 둘러보기. 비로그인은 섹션 숨김. */
  function buildFollowing(wrap) {
    // 도착 전까지 회색 카드 스켈레톤을 먼저 보여줌
    wrap.replaceChildren(FollowingSkeleton());
    W.fetchMe().then((me) => {
      if (!me) { wrap.replaceChildren(); return; } // 비로그인: 미표시
      window.api.get('/me/following-feed?limit=12', { silentAuthFail: true })
        .then((data) => {
          const items = (data && Array.isArray(data.items)) ? data.items : [];
          wrap.replaceChildren(FollowingSection(items));
        })
        .catch(() => { wrap.replaceChildren(); });
    }).catch(() => { wrap.replaceChildren(); });
  }

  /* 팔로잉 로딩 스켈레톤 — 제목 자리 + 회색 카드 placeholder 가로 한 줄 */
  function FollowingSkeleton() {
    const sec = W.el('section', { class: 'wz-follsec wz-follsec--loading', 'aria-busy': 'true' });
    const head = W.el('div', { class: 'wz-shelf__head' });
    head.appendChild(W.el('h2', { class: 'wz-shelf__title' }, '팔로우한 창작자 프로젝트'));
    sec.appendChild(head);
    const scroll = W.el('div', { class: 'wz-shelf__scroll' });
    for (let i = 0; i < 5; i++) {
      const card = W.el('div', { class: 'wz-skcard' });
      card.append(
        W.el('div', { class: 'wz-skel wz-skcard__thumb' }),
        W.el('div', { class: 'wz-skel wz-skcard__line wz-skcard__line--rate' }),
        W.el('div', { class: 'wz-skel wz-skcard__line' }),
        W.el('div', { class: 'wz-skel wz-skcard__line wz-skcard__line--short' })
      );
      scroll.appendChild(card);
    }
    sec.appendChild(scroll);
    return sec;
  }

  function FollowingSection(items) {
    const sec = W.el('section', { class: 'wz-follsec' });
    const head = W.el('div', { class: 'wz-shelf__head' });
    head.appendChild(W.el('h2', { class: 'wz-shelf__title' }, '팔로우한 창작자 프로젝트'));
    if (items.length) head.appendChild(W.el('a', { class: 'wz-shelf__more', href: '/feed.html?feed=following' }, '전체보기'));
    sec.appendChild(head);

    if (!items.length) {
      const empty = W.el('div', { class: 'wz-follsec__empty' });
      const img = W.el('img', { src: '/assets/empty-following.png', alt: '' });
      img.addEventListener('error', () => img.remove());
      empty.append(
        img,
        W.el('p', {}, '팔로우한 창작자가 없어요')
      );
      sec.appendChild(empty);
      return sec;
    }
    // 홈에서는 가로 한 줄(약 4~5개)만 — 전체는 /feed.html?feed=following
    const scroll = W.el('div', { class: 'wz-shelf__scroll' });
    items.slice(0, 10).forEach((p) => scroll.appendChild(FollowingCard(p)));
    sec.appendChild(scroll);
    return sec;
  }

  /* 팔로잉 피드 카드 — 공개 카드 직렬화(coverImageUrl/creatorName/achievementRate) 매핑 */
  function FollowingCard(p) {
    const card = W.el('a', { class: 'wz-pcard', href: '/detail.html?id=' + encodeURIComponent(p.id) });
    const th = W.el('div', { class: 'wz-pcard__thumb' });
    W.fillThumb(th, { imageUrl: p.coverImageUrl || '', title: p.title, category: p.category });
    const badge = DdayBadge(p);
    if (badge) th.appendChild(badge);
    card.appendChild(th);
    card.appendChild(RateLine(p));
    card.appendChild(W.el('p', { class: 'wz-pcard__title' }, p.title || ''));
    card.appendChild(W.el('p', { class: 'wz-pcard__author' }, p.creatorName || '익명'));
    return card;
  }

  /* ---- 공개 예정 ----
   * GET /api/groupbuys/scheduled → 카드 가로 한 줄(open_at 오름차순=곧 공개 순).
   * 결과 없으면 섹션 미표시. 각 카드 클릭 시 상세(상세에서 알림신청). 비로그인도 노출. */
  function buildScheduled(wrap) {
    window.api.get('/groupbuys/scheduled?limit=12', { silentAuthFail: true })
      .then((data) => {
        const items = (data && Array.isArray(data.items)) ? data.items : [];
        if (!items.length) { wrap.replaceChildren(); return; }
        wrap.replaceChildren(ScheduledSection(items));
      })
      .catch(() => { wrap.replaceChildren(); });
  }

  /* open_at(ISO|YYYY-MM-DD) → "오늘 공개"/"내일 공개"/"N일 후 공개"/날짜. 없으면 "공개 예정". */
  function openLabel(openAt) {
    if (!openAt) return '공개 예정';
    const t = new Date(openAt).getTime();
    if (!t || isNaN(t)) return '공개 예정';
    const now = Date.now();
    if (t <= now) return '곧 공개';
    const days = Math.ceil((t - now) / 86400000);
    if (days <= 1) return '내일 공개';
    if (days <= 14) return days + '일 후 공개';
    const d = new Date(t);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 공개';
  }

  function ScheduledSection(items) {
    // 전체보기 → /feed.html?feed=scheduled (공개 예정 전용 브라우즈 페이지, wz-feed.js 가 지원).
    const sec = W.el('section', { class: 'wz-shelf wz-scheduled' });
    const head = W.el('div', { class: 'wz-shelf__head' });
    const titles = W.el('div', {});
    titles.appendChild(W.el('h2', { class: 'wz-shelf__title' }, '공개 예정'));
    titles.appendChild(W.el('p', { class: 'wz-shelf__sub' }, '곧 만나볼 수 있어요 — 알림 신청하고 놓치지 마세요'));
    head.appendChild(titles);
    head.appendChild(W.el('a', { class: 'wz-shelf__more', href: '/feed.html?feed=scheduled' }, '전체보기'));
    sec.appendChild(head);
    const scroll = W.el('div', { class: 'wz-shelf__scroll' });
    items.forEach((p) => scroll.appendChild(ScheduledCard(p)));
    sec.appendChild(scroll);
    return sec;
  }

  /* 공개 예정 카드 — 공개 카드 직렬화(coverImageUrl/creatorName) 매핑. open_at 기준 공개 배지. */
  function ScheduledCard(p) {
    const card = W.el('a', { class: 'wz-pcard', href: '/detail.html?id=' + encodeURIComponent(p.id) });
    const th = W.el('div', { class: 'wz-pcard__thumb' });
    W.fillThumb(th, { imageUrl: p.coverImageUrl || '', title: p.title, category: p.category });
    th.appendChild(W.el('span', { class: 'wz-soon' }, openLabel(p.openAt)));
    card.appendChild(th);
    // 공개 전에는 달성률 대신 알림신청 수.
    card.appendChild(W.el('p', { class: 'wz-pcard__rate wz-pcard__rate--soon' }, (Number(p.subscriberCount) || 0) + '명이 알림 신청'));
    card.appendChild(W.el('p', { class: 'wz-pcard__title' }, p.title || ''));
    card.appendChild(W.el('p', { class: 'wz-pcard__author' }, p.creatorName || '익명'));
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

    return out;
  }

  /* ---- 최근 본 프로젝트 ----
   * localStorage recentFunds([{id,title,imageUrl}], 그 브라우저에만 존재)를
   * 현재 공개 목록(products)과 id 로 교차 — 존재하는 것만, 최근 순으로 한 줄. 없으면 섹션 미표시. */
  function readRecent() {
    try {
      const l = JSON.parse(localStorage.getItem('recentFunds') || '[]');
      return Array.isArray(l) ? l.filter((x) => x && x.id != null) : [];
    } catch (_) { return []; }
  }
  // 상세 응답(coverImageUrl 등) → 카드 데이터로 매핑(Card 는 imageUrl 을 씀).
  function recentCardData(f) {
    return {
      id: f.id, title: f.title || '', category: f.category || '',
      creatorName: f.creatorName || f.author || '', creatorSlug: f.creatorSlug || null,
      imageUrl: f.coverImageUrl || f.designImageUrl || f.imageUrl || '',
      deadline: f.deadline || '', status: f.status,
      achievementRate: (typeof f.achievementRate === 'number') ? f.achievementRate : null,
      currentQuantity: f.currentQuantity, likeCount: f.likeCount,
    };
  }
  function buildRecent(wrap, products) {
    const recent = readRecent();
    if (!recent.length) { wrap.replaceChildren(); return; }
    // 최근 본 펀드를 실제 데이터(실이미지 포함)로 렌더한다.
    // 현재 로드된 목록(products)에 있으면 그걸 쓰고, 없으면 id 로 조회(GET /groupbuys/:id) — 커버가 data:URL 이라
    // localStorage 에 저장 못 하므로, 카드 이미지는 항상 서버에서 가져온다.
    const byId = {};
    (products || []).forEach((p) => { byId[String(p.id)] = p; });
    const ids = [];
    const seen = {};
    recent.forEach((r) => { const id = String(r.id); if (id && !seen[id]) { seen[id] = 1; ids.push(id); } });
    const top = ids.slice(0, 12);
    Promise.all(top.map((id) => {
      if (byId[id]) return Promise.resolve(byId[id]); // 이미 이미지 포함된 목록 데이터
      return window.api.get('/groupbuys/' + encodeURIComponent(id), { silentAuthFail: true })
        .then((f) => (f && f.id) ? recentCardData(f) : null)
        .catch(() => null); // 삭제/없는 펀드는 제외
    })).then((list) => {
      const items = list.filter(Boolean);
      if (!items.length) { wrap.replaceChildren(); return; }
      wrap.replaceChildren(RecentSection(items));
    });
  }
  function RecentSection(items) {
    const sec = W.el('section', { class: 'wz-shelf wz-recent' });
    const head = W.el('div', { class: 'wz-shelf__head' });
    head.appendChild(W.el('h2', { class: 'wz-shelf__title' }, '최근 본 프로젝트'));
    sec.appendChild(head);
    const scroll = W.el('div', { class: 'wz-shelf__scroll' });
    items.forEach((p) => scroll.appendChild(Card(p)));
    sec.appendChild(scroll);
    return sec;
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
