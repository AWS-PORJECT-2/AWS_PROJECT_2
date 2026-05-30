/* =====================================================================
 * 두띵 — 와디즈 클론 프로젝트 상세 (from scratch). 전역 WZ(wz-core.js) 사용.
 * 데이터: GET /api/groupbuys/:id (?id= 쿼리). 후원: POST /api/funds/:id/back.
 * 팔로우: GET/POST/DELETE /api/users/:id/follow. 찜: window.toggleLike/isLiked.
 * 이모지 금지(SVG만). 사용자값은 문자열 자식(textContent) 또는 WZ.esc.
 * ===================================================================== */
(function () {
  const W = window.WZ;

  /* 페이지 전용 인라인 SVG (stroke=currentColor) */
  const SVG = {
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0V4z"/><path d="M6 6H4a2 2 0 0 0 0 4h2M18 6h2a2 2 0 0 1 0 4h-2"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V4z"/><path d="M8 8h7M8 12h7M8 16h4"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.9L12 16.9 6.8 19.2l1-5.9L3.5 9.2l5.9-.9L12 3z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    /* 브랜드 글리프 — 단색 currentColor fill */
    kakao: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.7-1.8 3.8-2.6.6.1 1.3.1 1.9.1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>',
    twitterX: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.2 2.5h3.3l-7.2 8.2 8.5 11.3h-6.7l-5.2-6.8-6 6.8H1.6l7.7-8.8L1.2 2.5h6.8l4.7 6.2 5.5-6.2zm-1.2 17.6h1.8L7.1 4.3H5.2l11.8 15.8z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
  };

  const root = document.getElementById('wz-detail');

  /* ---------- helpers ---------- */
  function getId() {
    const u = new URL(location.href);
    return u.searchParams.get('id') || '';
  }
  function daysLeft(deadline) {
    if (!deadline) return null;
    const d = new Date(deadline);
    if (isNaN(d.getTime())) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(d); end.setHours(0, 0, 0, 0);
    return Math.round((end - today) / 86400000);
  }
  function fmtPeriod(deadline) {
    if (!deadline) return null;
    const d = new Date(deadline);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0') + ' 마감';
  }
  /* contentBlocks 이미지 url 추출 (계약: {type:"image", url}). 구버전 value 도 허용. */
  function blockImageUrl(b) {
    if (!b || b.type !== 'image') return '';
    return b.url || b.value || '';
  }
  function blockText(b) {
    if (!b || b.type !== 'text') return '';
    return b.text != null ? b.text : (b.value != null ? b.value : '');
  }
  function galleryImages(f) {
    const out = [];
    [f.coverImageUrl, f.designImageUrl, f.tryonImageUrl].forEach((u) => { if (u && out.indexOf(u) === -1) out.push(u); });
    (Array.isArray(f.contentBlocks) ? f.contentBlocks : []).forEach((b) => {
      const u = blockImageUrl(b);
      if (u && out.indexOf(u) === -1) out.push(u);
    });
    return out;
  }
  function moneyRaised(f) {
    return (Number(f.finalPrice) || 0) * (Number(f.currentQuantity) || 0);
  }

  /* 메이커 정보 정규화 (계약: f.maker{userId,name,slug,picture,followerCount,isFollowing}).
     구버전 호환: maker 없으면 creator* 필드로 폴백. */
  function makerOf(f) {
    const m = f.maker || {};
    return {
      userId: m.userId || f.creatorId || '',
      name: m.name || f.creatorName || '',
      slug: m.slug || f.creatorSlug || '',
      picture: m.picture || '',
      followerCount: typeof m.followerCount === 'number' ? m.followerCount : 0,
      isFollowing: !!m.isFollowing,
    };
  }
  function makerName(m) { return m.name || '두띵 창작자'; }
  function makerHref(m) {
    if (m.slug) return '/u/' + encodeURIComponent(m.slug);
    if (m.userId) return '/maker.html?id=' + encodeURIComponent(m.userId);
    return null;
  }

  /* ---------- 상태 빈/에러 ---------- */
  function showState(title, msg) {
    root.replaceChildren(W.el('div', { class: 'wz-d-state' },
      W.el('div', { class: 'wz-d-state__ic', html: SVG.box }),
      W.el('h2', {}, title),
      msg ? W.el('p', {}, msg) : null,
      W.el('a', { class: 'wz-btn wz-btn--outline', href: '/feed.html' }, '다른 프로젝트 둘러보기')));
  }

  /* ===================================================================
   * 메인 렌더
   * =================================================================== */
  function render(f) {
    const rate = W.rate(f);
    const backers = Number(f.currentQuantity) || 0;
    const dleft = daysLeft(f.deadline);
    const imgs = galleryImages(f);
    const tiers = Array.isArray(f.rewardTiers) ? f.rewardTiers : [];

    root.replaceChildren();
    document.body.classList.add('wz-detail-page'); // 상세: 헤더 비고정 → 탭바가 맨 위에 sticky

    /* ----- 상단 탭바 (메인 / 스토리 / 댓글 — 섹션 스크롤) ----- */
    const tabs = W.el('div', { class: 'wz-d-tabs' });
    const tabsInner = W.el('div', { class: 'wz-d-tabs__inner' });
    const grid = W.el('div', { class: 'wz-d-grid' });

    /* ----- 좌측: 갤러리(메인) + 스토리 + 댓글 + 안내 ----- */
    const mainCol = W.el('div', { class: 'wz-d-main' });
    const galleryEl = Gallery(imgs, f.title);
    const storyEl = Story(f);
    const commentsEl = Comments(f);
    mainCol.append(galleryEl, storyEl, commentsEl, FundingNotice());

    /* ----- 우측 sticky 후원 패널 ----- */
    const sideCol = W.el('aside', { class: 'wz-d-side' });
    buildSide(sideCol, f, { rate, backers, dleft, tiers });
    grid.append(mainCol, sideCol);

    const sections = { main: galleryEl, story: storyEl, comments: commentsEl };
    const TAB_DEFS = [['main', '메인'], ['story', '스토리'], ['comments', '댓글']];
    const tabBtns = {};
    function setActive(key) { Object.keys(tabBtns).forEach((k) => tabBtns[k].classList.toggle('is-active', k === key)); }
    function stickyOffset() {
      // 상세에선 헤더가 스크롤되어 사라지고 탭바만 top:0 으로 고정되므로 탭바 높이만 보정
      return (tabs.offsetHeight || 50) + 12;
    }
    function goSection(key) {
      const el = sections[key];
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - stickyOffset();
      window.scrollTo({ top: y < 0 ? 0 : y, behavior: 'smooth' });
    }
    TAB_DEFS.forEach(([key, label]) => {
      const b = W.el('button', { class: 'wz-d-tab', type: 'button' }, label);
      b.addEventListener('click', () => { setActive(key); goSection(key); });
      tabBtns[key] = b;
      tabsInner.appendChild(b);
    });
    tabs.appendChild(tabsInner);
    root.append(tabs, grid);

    /* ----- 모바일 하단 고정 바 ----- */
    root.appendChild(MobileBar(f, tiers));

    /* 스크롤 스파이 — 현재 보이는 섹션 탭 자동 활성화 */
    function onScroll() {
      const off = stickyOffset() + 8;
      let cur = 'main';
      ['main', 'story', 'comments'].forEach((k) => {
        const el = sections[k];
        if (el && el.getBoundingClientRect().top - off <= 0) cur = k;
      });
      setActive(cur);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    setActive('main');
  }

  /* ---------- 갤러리 ---------- */
  function Gallery(imgs, title) {
    const box = W.el('div', { class: 'wz-d-gallery' });
    if (!imgs.length) {
      box.appendChild(W.el('div', { class: 'wz-d-gallery__ph', html: SVG.box }));
      return box;
    }
    let idx = 0;
    const img = W.el('img', { class: 'wz-d-gallery__img', src: imgs[0], alt: title || '대표 이미지' });
    img.addEventListener('error', () => { img.replaceWith(W.el('div', { class: 'wz-d-gallery__ph', html: SVG.box })); });
    box.appendChild(img);
    if (imgs.length > 1) {
      const count = W.el('div', { class: 'wz-d-gallery__count' }, '1/' + imgs.length);
      const show = (n) => { idx = (n + imgs.length) % imgs.length; img.src = imgs[idx]; count.textContent = (idx + 1) + '/' + imgs.length; };
      const prev = W.el('button', { class: 'wz-d-gallery__nav wz-d-gallery__nav--prev', type: 'button', 'aria-label': '이전 이미지', html: SVG.chevL });
      const next = W.el('button', { class: 'wz-d-gallery__nav wz-d-gallery__nav--next', type: 'button', 'aria-label': '다음 이미지', html: SVG.chevR });
      prev.addEventListener('click', () => show(idx - 1));
      next.addEventListener('click', () => show(idx + 1));
      box.append(prev, next, count);
    }
    return box;
  }

  /* ---------- 프로젝트 스토리 (contentBlocks) ---------- */
  function Story(f) {
    const sec = W.el('section', { class: 'wz-d-story' });
    sec.appendChild(W.el('h2', { class: 'wz-d-story__h2' }, '프로젝트 스토리'));
    const blocks = Array.isArray(f.contentBlocks) ? f.contentBlocks : [];
    const wrap = W.el('div', { class: 'wz-d-story__blocks' });
    let rendered = 0;
    blocks.forEach((b) => {
      if (!b) return;
      if (b.type === 'text') {
        const txt = blockText(b);
        if (txt && String(txt).trim()) {
          wrap.appendChild(W.el('p', { class: 'wz-d-story__text' }, String(txt)));
          rendered++;
        }
      } else if (b.type === 'image') {
        const u = blockImageUrl(b);
        if (u) {
          const im = W.el('img', { class: 'wz-d-story__img', src: u, alt: '', loading: 'lazy' });
          im.addEventListener('error', () => im.remove());
          wrap.appendChild(im);
          rendered++;
        }
      }
    });
    if (!rendered && f.description && f.description.trim()) {
      wrap.appendChild(W.el('p', { class: 'wz-d-story__text' }, f.description));
      rendered++;
    }
    if (!rendered) wrap.appendChild(W.el('div', { class: 'wz-d-story__empty' }, '아직 등록된 스토리가 없어요.'));
    sec.appendChild(wrap);
    return sec;
  }

  /* ---------- 댓글 섹션 (wz-comments.js 가 마운트) ---------- */
  function Comments(f) {
    const sec = W.el('section', { class: 'wz-d-comments' });
    sec.appendChild(W.el('h2', { class: 'wz-d-comments__h2' }, '댓글'));
    const host = W.el('div', { id: 'fund-comments' });
    sec.appendChild(host);
    // wz-comments.js 는 다른 모듈이 로드한다. 로드 전이면 약간 대기 후 마운트.
    function tryMount(retries) {
      if (window.WZComments && typeof window.WZComments.mount === 'function') {
        window.WZComments.mount(host, { targetType: 'fund', targetId: f.id });
        return;
      }
      if (retries > 0) setTimeout(() => tryMount(retries - 1), 120);
      else host.appendChild(W.el('p', { class: 'wz-d-comments__fallback' }, '댓글을 불러올 수 없어요.'));
    }
    tryMount(20);
    return sec;
  }

  /* ---------- 펀딩 / 환불 안내 ---------- */
  function FundingNotice() {
    const sec = W.el('div', { class: 'wz-d-notice' });
    sec.appendChild(W.el('h3', {}, '펀딩 및 환불 안내'));
    const dl = W.el('dl', {});
    [
      ['펀딩 방식', '목표 수량 달성 시에만 제작·발송되는 모두의 펀딩(올오어낫씽)입니다. 마감일까지 목표에 도달하지 못하면 결제가 진행되지 않습니다.'],
      ['결제 시점', '무통장 입금 후 관리자가 입금자명과 금액을 대조하여 확인하면 후원이 확정됩니다.'],
      ['환불 안내', '목표 미달로 무산되거나 창작자 사정으로 취소되는 경우 입금액 전액이 환불됩니다.'],
      ['배송 안내', '펀딩 종료 후 제작 기간을 거쳐 순차 발송되며, 일정은 새소식으로 공지됩니다.'],
    ].forEach(([t, d]) => {
      dl.append(W.el('dt', {}, t), W.el('dd', {}, d));
    });
    sec.appendChild(dl);
    return sec;
  }

  /* ===================================================================
   * 우측 sticky 후원 패널
   * =================================================================== */
  function buildSide(sideCol, f, ctx) {
    const { rate, backers, dleft, tiers } = ctx;

    /* 카테고리 — 아이콘/배경 없이 plain 텍스트 */
    const cat = window.dtCategory && window.dtCategory(f.category);
    if (cat) {
      sideCol.appendChild(W.el('p', { class: 'wz-d-cat' }, cat.label));
    }

    /* (상단 메이커 행은 제거 — 하단 메이커 카드와 중복) */

    /* 제목 */
    sideCol.appendChild(W.el('h1', { class: 'wz-d-title' }, f.title || '제목 없음'));

    /* 참여 · 남은 일수 */
    const dtext = dleft == null ? '' : (dleft > 0 ? dleft + '일 남음' : (dleft === 0 ? '오늘 마감' : '마감'));
    const statsLine = W.el('p', { class: 'wz-d-stats' });
    statsLine.append(W.el('b', {}, backers.toLocaleString() + '명'), document.createTextNode(' 참여'));
    if (dtext) statsLine.append(document.createTextNode(' · '), W.el('b', {}, dtext));
    sideCol.appendChild(statsLine);

    /* 모인 금액 · 달성률 */
    const amount = W.el('div', { class: 'wz-d-amount' });
    amount.append(
      W.el('span', { class: 'wz-d-amount__money' }, W.money(moneyRaised(f)) + ' 달성'),
      W.el('span', { class: 'wz-d-amount__rate' }, rate + '% 달성'));
    sideCol.appendChild(amount);

    /* 진행바 */
    const bar = W.el('div', { class: 'wz-d-progress' });
    const fill = W.el('div', { class: 'wz-d-progress__fill' });
    fill.style.width = Math.min(100, Math.max(0, rate)) + '%';
    bar.appendChild(fill);
    sideCol.appendChild(bar);

    /* 혜택 박스 (안심 후원) */
    const safe = W.el('div', { class: 'wz-d-safe' });
    [
      ['안심 후원', '목표 수량을 달성한 프로젝트만 제작·발송됩니다.'],
      ['목표 미달 시', '결제가 진행되지 않으며 입금액은 전액 환불됩니다.'],
    ].forEach(([b, t]) => {
      const row = W.el('div', { class: 'wz-d-safe__row' });
      row.append(
        W.el('span', { class: 'wz-d-safe__ic', html: SVG.shield }),
        W.el('span', {}, W.el('b', {}, b), document.createTextNode(' ' + t)));
      safe.appendChild(row);
    });
    sideCol.appendChild(safe);

    /* 액션 아이콘 행 (공유 / 찜) */
    const actions = W.el('div', { class: 'wz-d-actions' });
    const shareBtn = W.el('button', { class: 'wz-d-act', type: 'button' },
      W.el('span', { html: SVG.share }), W.el('span', { class: 'wz-d-act__label' }, '공유'));
    shareBtn.addEventListener('click', () => doShare(f));

    const likedNow = (typeof window.isLiked === 'function') && window.isLiked(f.id);
    const likeCount0 = Number(localStorage.getItem('liked_delta_' + f.id)) || 0;
    const likeBtn = W.el('button', { class: 'wz-d-act' + (likedNow ? ' is-on' : ''), type: 'button' });
    const likeLabel = W.el('span', { class: 'wz-d-act__label' }, '찜 ' + Math.max(0, likeCount0));
    likeBtn.append(W.el('span', { html: SVG.heart }), likeLabel);
    likeBtn.addEventListener('click', () => {
      if (typeof window.toggleLike !== 'function') return;
      const on = window.toggleLike(f.id);
      likeBtn.classList.toggle('is-on', on);
      likeLabel.textContent = '찜 ' + Math.max(0, Number(localStorage.getItem('liked_delta_' + f.id)) || 0);
      syncMobileLike(on);
    });

    actions.append(shareBtn, likeBtn);
    sideCol.appendChild(actions);
    _mobileLikeSync = (on) => likeBtn.classList.toggle('is-on', on);

    /* 펀딩하기 큰 버튼 */
    const fundBtn = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg wz-btn--block wz-d-cta', type: 'button' }, '펀딩하기');
    fundBtn.addEventListener('click', () => backFlow(f));
    sideCol.appendChild(fundBtn);

    /* 메이커 카드 */
    sideCol.appendChild(MakerCard(f));

    /* 리워드 선택 */
    sideCol.appendChild(Rewards(f, tiers));
  }

  /* ---------- 메이커 카드 (팔로우) ---------- */
  function MakerCard(f) {
    const maker = makerOf(f);
    const href = makerHref(maker);
    const card = W.el('div', { class: 'wz-d-maker' });

    /* 헤더: 아바타 + 이름/팔로워 (클릭 시 메이커 공개 프로필로 이동) */
    const head = href
      ? W.el('a', { class: 'wz-d-maker__head', href })
      : W.el('div', { class: 'wz-d-maker__head' });
    const av = W.el('span', { class: 'wz-d-maker__av', html: SVG.user });
    if (maker.picture) {
      const im = W.el('img', { src: maker.picture, alt: '' });
      im.addEventListener('error', () => { im.remove(); av.innerHTML = SVG.user; });
      av.innerHTML = '';
      av.appendChild(im);
    }
    const info = W.el('div', {});
    const followersEl = W.el('p', { class: 'wz-d-maker__followers' });
    followersEl.append(W.el('b', {}, String(maker.followerCount)), document.createTextNode('명의 팔로워'));
    info.append(W.el('p', { class: 'wz-d-maker__name' }, makerName(maker)), followersEl);
    head.append(av, info);
    card.appendChild(head);

    const btns = W.el('div', { class: 'wz-d-maker__btns' });
    let following = maker.isFollowing;
    const followBtn = W.el('button', { class: 'wz-btn ' + (following ? 'wz-btn--ghost' : 'wz-btn--outline'), type: 'button' },
      following ? '팔로잉' : '팔로우');
    const askBtn = W.el('button', { class: 'wz-btn wz-btn--ghost', type: 'button' }, '문의하기');
    askBtn.addEventListener('click', () => { location.href = '/support.html'; });
    btns.append(followBtn, askBtn);
    card.appendChild(btns);

    function paint() {
      followBtn.textContent = following ? '팔로잉' : '팔로우';
      followBtn.classList.toggle('wz-btn--ghost', following);
      followBtn.classList.toggle('wz-btn--outline', !following);
    }

    if (maker.userId) {
      followBtn.addEventListener('click', async () => {
        followBtn.disabled = true;
        try {
          const st = following
            ? await window.api.del('/users/' + encodeURIComponent(maker.userId) + '/follow')
            : await window.api.post('/users/' + encodeURIComponent(maker.userId) + '/follow', {});
          following = !!(st && st.following);
          if (st && typeof st.followerCount === 'number') {
            const b = followersEl.querySelector('b'); if (b) b.textContent = String(st.followerCount);
          }
          paint();
        } catch (e) {
          if (e && e.status === 401) { location.href = '/login.html'; return; }
          alert('처리에 실패했어요. 잠시 후 다시 시도해 주세요.');
        } finally { followBtn.disabled = false; }
      });
    } else {
      followBtn.disabled = true;
    }
    return card;
  }

  /* ---------- 리워드 선택 ---------- */
  let _selectedTierId = null;
  function Rewards(f, tiers) {
    const sec = W.el('div', { class: 'wz-d-rewards' });
    sec.appendChild(W.el('h3', { class: 'wz-d-rewards__title' }, '리워드 선택'));
    const period = fmtPeriod(f.deadline);
    if (period) sec.appendChild(W.el('p', { class: 'wz-d-rewards__period' }, '진행 기간 · ' + period));

    if (!tiers.length) {
      sec.appendChild(W.el('div', { class: 'wz-d-rewards__empty' }, '등록된 리워드가 없어요.'));
      return sec;
    }
    const list = W.el('div', { class: 'wz-d-rewards__list' });
    tiers.forEach((t, ti) => {
      const rawStock = (t.stock != null) ? t.stock : t.stockLimit;
      const stockLimit = (rawStock == null) ? null : Number(rawStock);
      const sold = Number(t.soldCount) || 0;
      const remain = stockLimit == null ? null : Math.max(0, stockLimit - sold);
      const soldOut = remain === 0;

      const item = W.el('div', { class: 'wz-d-reward' + (soldOut ? ' is-soldout' : '') });
      const top = W.el('div', { class: 'wz-d-reward__top' });
      if (stockLimit != null) {
        top.appendChild(W.el('span', { class: 'wz-d-reward__stock' + (soldOut ? ' wz-d-reward__stock--out' : '') },
          soldOut ? '마감' : ('남은 수량 ' + remain + '개')));
      }
      top.appendChild(W.el('span', { class: 'wz-d-reward__price' }, W.money(t.price)));
      item.appendChild(top);
      item.appendChild(W.el('p', { class: 'wz-d-reward__t' }, t.title || '리워드'));
      const tdesc = t.desc != null ? t.desc : t.description;
      if (tdesc) item.appendChild(W.el('p', { class: 'wz-d-reward__d' }, tdesc));

      const pick = W.el('button', { class: 'wz-btn wz-btn--outline wz-btn--block wz-d-reward__pick', type: 'button' },
        soldOut ? '마감되었습니다' : '이 리워드 선택');
      if (soldOut) { pick.disabled = true; }
      else {
        const select = () => {
          _selectedTierId = (t.id != null) ? t.id : ti;
          list.querySelectorAll('.wz-d-reward').forEach((n) => n.classList.remove('is-sel'));
          item.classList.add('is-sel');
          list.querySelectorAll('.wz-d-reward__pick').forEach((b) => { if (!b.disabled) { b.textContent = '이 리워드 선택'; b.classList.remove('wz-btn--primary'); b.classList.add('wz-btn--outline'); } });
          pick.textContent = '선택됨';
          pick.classList.remove('wz-btn--outline'); pick.classList.add('wz-btn--primary');
        };
        item.addEventListener('click', select);
        pick.addEventListener('click', (e) => { e.stopPropagation(); select(); });
      }
      item.appendChild(pick);
      list.appendChild(item);
    });
    sec.appendChild(list);
    return sec;
  }

  /* ---------- 모바일 하단 고정 바 ---------- */
  let _mobileLikeSync = null;
  function syncMobileLike(on) { const b = document.querySelector('.wz-d-mbar__like'); if (b) b.classList.toggle('is-on', on); }
  function MobileBar(f, tiers) {
    const bar = W.el('div', { class: 'wz-d-mbar' });
    const likedNow = (typeof window.isLiked === 'function') && window.isLiked(f.id);
    const like = W.el('button', { class: 'wz-d-mbar__like' + (likedNow ? ' is-on' : ''), type: 'button', 'aria-label': '찜', html: SVG.heart });
    like.addEventListener('click', () => {
      if (typeof window.toggleLike !== 'function') return;
      const on = window.toggleLike(f.id);
      like.classList.toggle('is-on', on);
      if (_mobileLikeSync) _mobileLikeSync(on);
    });
    const fund = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg', type: 'button' }, '펀딩하기');
    fund.addEventListener('click', () => backFlow(f));
    bar.append(like, fund);
    return bar;
  }

  /* ---------- 공유 ---------- */
  function copyLink(url, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => alert(okMsg || '링크가 복사되었어요.')).catch(() => prompt('아래 링크를 복사해 주세요.', url));
    } else {
      prompt('아래 링크를 복사해 주세요.', url);
    }
  }
  function openShareWindow(shareUrl) {
    window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=540');
  }

  function doShare(f) {
    const url = location.href;
    const enc = encodeURIComponent(url);
    const title = f.title || '두띵 프로젝트';
    const encTitle = encodeURIComponent(title);

    const items = [
      ['kakao', '카카오톡', SVG.kakao, () => {
        if (navigator.share) { navigator.share({ title, url }).catch(() => {}); return; }
        openShareWindow('https://story.kakao.com/share?url=' + enc);
      }],
      ['twitterX', 'X', SVG.twitterX, () => {
        openShareWindow('https://twitter.com/intent/tweet?url=' + enc + '&text=' + encTitle);
      }],
      ['facebook', '페이스북', SVG.facebook, () => {
        openShareWindow('https://www.facebook.com/sharer/sharer.php?u=' + enc);
      }],
      ['instagram', '인스타그램', SVG.instagram, () => {
        if (navigator.share) { navigator.share({ title, url }).catch(() => {}); return; }
        copyLink(url, '링크가 복사되었어요. 인스타그램 앱에 붙여넣어 공유해 주세요.');
      }],
      ['link', '링크 복사', SVG.link, () => copyLink(url)],
    ];

    const overlay = W.el('div', { class: 'wz-d-sharesheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': '공유하기' });
    const box = W.el('div', { class: 'wz-d-sharesheet__box' });
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (e.key === 'Escape') close(); }

    const head = W.el('div', { class: 'wz-d-sharesheet__head' });
    const closeBtn = W.el('button', { class: 'wz-d-sharesheet__close', type: 'button', 'aria-label': '닫기', html: SVG.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h3', {}, '공유하기'), closeBtn);

    const grid = W.el('div', { class: 'wz-d-sharesheet__grid' });
    items.forEach(([key, label, icon, action]) => {
      const btn = W.el('button', { class: 'wz-d-shareitem wz-d-shareitem--' + key, type: 'button' },
        W.el('span', { class: 'wz-d-shareitem__ic', html: icon }),
        W.el('span', { class: 'wz-d-shareitem__label' }, label));
      btn.addEventListener('click', () => { close(); action(); });
      grid.appendChild(btn);
    });

    box.append(head, grid);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  /* ===================================================================
   * 후원 플로우 (POST /api/funds/:id/back) 후 입금 안내 모달
   * =================================================================== */
  async function backFlow(f) {
    if (!_selectedTierId) {
      alert('후원할 리워드를 먼저 선택해 주세요.');
      const sec = document.querySelector('.wz-d-rewards');
      if (sec) sec.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    let addrs;
    try {
      const r = await window.api.get('/addresses');
      addrs = Array.isArray(r) ? r : (r && r.items) || [];
    } catch (e) {
      if (e && e.status === 401) { location.href = '/login.html'; return; }
      alert('배송지 조회에 실패했어요.'); return;
    }
    if (!addrs.length) {
      if (confirm('후원하려면 배송지가 필요해요. 배송지를 등록할까요?')) location.href = '/addresses.html';
      return;
    }
    const def = addrs.find((a) => a.isDefault) || addrs[0];

    let res;
    try {
      res = await window.api.post('/funds/' + encodeURIComponent(f.id) + '/back', {
        rewardTierId: _selectedTierId,
        addressId: def.id,
      });
    } catch (e) {
      if (e && e.status === 401) { location.href = '/login.html'; return; }
      alert('후원 신청에 실패했어요: ' + ((e && e.message) || '알 수 없는 오류'));
      return;
    }
    showDepositModal(res, def);
  }

  function showDepositModal(res, addr) {
    const dep = res.deposit || {};
    const overlay = W.el('div', { class: 'wz-d-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '입금 안내' });
    const box = W.el('div', { class: 'wz-d-modal__box' });
    const close = () => overlay.remove();

    const head = W.el('div', { class: 'wz-d-modal__head' });
    const closeBtn = W.el('button', { class: 'wz-d-modal__close', type: 'button', 'aria-label': '닫기', html: SVG.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h3', {}, '입금 안내'), closeBtn);

    const body = W.el('div', { class: 'wz-d-modal__body' });
    const dl = W.el('div', { class: 'wz-d-deposit' });
    const rows = [
      ['입금 금액', W.money(res.amount), true],
      ['은행', dep.bank || '-', false],
      ['계좌번호', dep.account || '-', false],
      ['예금주', dep.holder || '-', false],
    ];
    if (addr) rows.push(['배송지', ((addr.label || '') + ' · ' + (addr.recipientName || '')).replace(/^ · | · $/g, '') || '-', false]);
    rows.forEach(([k, v, isAmount]) => {
      dl.appendChild(W.el('div', { class: 'wz-d-deposit__row' },
        W.el('span', { class: 'k' }, k),
        W.el('span', { class: 'v' + (isAmount ? ' amount' : '') }, v)));
    });
    body.appendChild(dl);
    body.appendChild(W.el('p', { class: 'wz-d-modal__note' },
      '위 계좌로 입금 후 입금자명을 입력해 주세요. 관리자가 입금자명과 금액을 대조하여 확인하면 후원이 확정됩니다.'));

    const input = W.el('input', { class: 'wz-d-modal__input', type: 'text', placeholder: '입금자명을 입력해 주세요' });
    body.appendChild(input);

    const submit = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg wz-btn--block', type: 'button' }, '입금자명 제출');
    submit.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!name) { alert('입금자명을 입력해 주세요.'); return; }
      submit.disabled = true;
      try {
        await window.api.post('/me/backings/' + encodeURIComponent(res.orderId) + '/report', { depositorName: name });
        body.replaceChildren(W.el('div', { class: 'wz-d-modal__done' }, '입금자명이 제출되었어요. 관리자 확인 후 후원이 확정됩니다.'));
        const okBtn = W.el('button', { class: 'wz-btn wz-btn--outline wz-btn--block', type: 'button' }, '확인');
        okBtn.addEventListener('click', close);
        body.appendChild(okBtn);
      } catch (e) {
        submit.disabled = false;
        alert('제출에 실패했어요: ' + ((e && e.message) || ''));
      }
    });
    body.appendChild(submit);

    box.append(head, body);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
  }

  /* ===================================================================
   * 진입
   * =================================================================== */
  async function run() {
    if (!root || !W) return;
    const id = getId();
    if (!id) { showState('프로젝트를 찾을 수 없어요', '잘못된 접근이에요. 목록에서 다시 선택해 주세요.'); return; }

    root.replaceChildren(W.el('div', { class: 'wz-d-state' }, W.el('p', {}, '불러오는 중...')));
    let f;
    try {
      f = await window.api.get('/groupbuys/' + encodeURIComponent(id), { silentAuthFail: true });
    } catch (e) {
      if (e && e.status === 404) { showState('프로젝트를 찾을 수 없어요', '이미 종료되었거나 존재하지 않는 프로젝트예요.'); return; }
      showState('프로젝트를 불러오지 못했어요', '잠시 후 다시 시도해 주세요.'); return;
    }
    if (!f || !f.id) { showState('프로젝트를 찾을 수 없어요', '이미 종료되었거나 존재하지 않는 프로젝트예요.'); return; }
    render(f);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
