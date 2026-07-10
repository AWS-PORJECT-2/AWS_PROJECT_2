/* =====================================================================
 * DOOTHING — 룩북 릴스 피드 (main.html 전용, 다크 테마).
 * 인스타/틱톡 릴스형 착장샷 세로 스크롤. 기존 WZ(wz-core.js) 유틸 재사용.
 * 데이터: GET /api/groupbuys (실데이터) → 없으면 데모 시드로 시연.
 * 이모지 금지 — 아이콘은 인라인 SVG.
 * ===================================================================== */
(function () {
  const W = window.WZ;
  if (!W) return;

  const SVG = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  };

  /* 데모 시드 — 실데이터가 없을 때 목업 시연용. (착장샷은 unsplash 임의 이미지) */
  const DEMO = [
    { id: 'demo-1', crew: 'JAERAW', tag: 'CREW', handle: '@jaeraw', live: true, price: 34000,
      like: 231, comment: 42, caption: 'THE ESSENTIAL DROP #001 / 국민대 정문 앞, 봄.',
      image: 'https://images.unsplash.com/photo-1523398002811-999ca8dec234?w=900&q=80' },
    { id: 'demo-2', crew: 'SOY.BX', tag: 'CREW', handle: '@soy.bx', live: true, price: 28000,
      like: 87, comment: 19, caption: 'BOXY SEASON. 드롭 예정 7/15 — 크루원 우선.',
      image: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=900&q=80' },
    { id: 'demo-3', crew: 'RAWJH', tag: 'CREW', handle: '@rawjh', live: true, price: 41000,
      like: 163, comment: 63, caption: 'STREET ISSUE No.3 / 한강 뚝섬. 148명 탑승 완료.',
      image: 'https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=900&q=80' },
    { id: 'demo-4', crew: 'MNZDROP', tag: 'CREW', handle: '@mnzdrop', live: true, price: 39000,
      like: 54, comment: 28, caption: 'THE STREET FIT / 오버사이즈 아카이브 — 잔여 12장.',
      image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=900&q=80' },
  ];

  function money(n) { return '₩' + (Math.max(0, Math.floor(Number(n) || 0))).toLocaleString(); }
  function likeText(n) { return W.formatLikeCount ? W.formatLikeCount(n) : String(n); }

  /* 다크 헤더 */
  function Header() {
    const hd = W.el('header', { class: 'dt-lbhd' });
    const logo = W.el('a', { class: 'dt-lbhd__logo', href: '/main.html', 'aria-label': 'DOOTHING' });
    const logoImg = W.el('img', { class: 'dt-lbhd__logoimg', src: '/assets/logo-doothing.png', alt: 'DOOTHING' });
    logoImg.addEventListener('error', () => { logoImg.remove(); logo.textContent = 'DOOTHING'; });
    logo.appendChild(logoImg);
    hd.appendChild(logo);
    const acts = W.el('div', { class: 'dt-lbhd__actions' });
    const search = W.el('a', { class: 'dt-lbhd__ic', href: '/feed.html', 'aria-label': 'Search', html: SVG.search });
    // 종 → 하트 알림 센터
    const heart = W.el('button', { class: 'dt-lbhd__ic', type: 'button', 'aria-label': '알림 센터', html: SVG.heart });
    heart.addEventListener('click', (e) => { e.stopPropagation(); if (typeof window.openHeartCenter === 'function') window.openHeartCenter(); });
    acts.append(search, heart);
    hd.appendChild(acts);
    return hd;
  }

  /* 드롭 카드 (한 게시물) */
  function Drop(d) {
    const card = W.el('article', { class: 'dt-drop' });

    // 크루 프로필 행
    const crewRow = W.el('div', { class: 'dt-drop__cruw' });
    const av = W.el('div', { class: 'dt-drop__avatar' });
    if (d.avatar) { const im = W.el('img', { src: d.avatar, alt: d.crew }); im.addEventListener('error', () => { im.remove(); av.textContent = (d.crew || '?').slice(0, 2).toUpperCase(); }); av.appendChild(im); }
    else av.textContent = (d.crew || '?').slice(0, 2).toUpperCase();
    const crew = W.el('div', { class: 'dt-drop__crew' });
    const nameRow = W.el('div', { class: 'dt-drop__name' }, d.crew || '');
    if (d.tag) nameRow.appendChild(W.el('span', { class: 'dt-drop__tag' }, d.tag));
    crew.append(nameRow, W.el('div', { class: 'dt-drop__handle' }, d.handle || ''));
    // 프로필 아이콘/이름 클릭 → 상대방 메이커 프로필로 이동
    const goProfile = (e) => {
      e.stopPropagation();
      if (d.creatorSlug) location.href = '/maker.html?slug=' + encodeURIComponent(d.creatorSlug);
      else if (d.creatorId) location.href = '/maker.html?id=' + encodeURIComponent(d.creatorId);
    };
    if (d.creatorSlug || d.creatorId) {
      av.style.cursor = 'pointer'; crew.style.cursor = 'pointer';
      av.addEventListener('click', goProfile);
      crew.addEventListener('click', goProfile);
    }
    const share = W.el('button', { class: 'dt-drop__share', type: 'button', 'aria-label': '공유', html: SVG.share });
    share.addEventListener('click', () => { try { navigator.share && navigator.share({ title: d.crew, url: location.href }); } catch (_) {} });
    crewRow.append(av, crew, share);
    card.appendChild(crewRow);

    // 미디어 + 오버레이
    const media = W.el('div', { class: 'dt-drop__media' });
    if (d.image) { const im = W.el('img', { src: d.image, alt: d.caption || d.crew, loading: 'lazy' }); media.appendChild(im); }
    media.appendChild(W.el('span', { class: 'dt-drop__live' }, 'LIVE DROP'));

    const cta = W.el('button', { class: 'dt-drop__cta', type: 'button' }, 'GET DROP — ' + money(d.price));
    cta.addEventListener('click', () => {
      cta.classList.add('is-fired');
      try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) {}
      setTimeout(() => {
        cta.classList.remove('is-fired');
        // 상세 페이지 없이 그 자리에서 기존 펀딩 참여 흐름 실행.
        const isDemo = String(d.id).indexOf('demo') === 0;
        if (isDemo) { alert('데모 드롭이에요. 실제 드롭에서 참여할 수 있어요.'); return; }
        if (window.WZCheckout && typeof window.WZCheckout.start === 'function') window.WZCheckout.start(d.id);
        else location.href = (d.href || ('/detail.html?id=' + encodeURIComponent(d.id))) + '?back=1';
      }, 180);
    });
    media.appendChild(cta);
    card.appendChild(media);

    // 액션 행
    const acts = W.el('div', { class: 'dt-drop__acts' });
    let liked = false, likeN = Number(d.like) || 0;
    const likeBtn = W.el('button', { class: 'dt-drop__act', type: 'button', 'aria-label': '좋아요' });
    const likeIco = W.el('span', { html: SVG.heart });
    const likeLbl = W.el('span', {}, likeText(likeN));
    likeBtn.append(likeIco, likeLbl);
    likeBtn.addEventListener('click', () => {
      liked = !liked; likeN += liked ? 1 : -1;
      likeBtn.classList.toggle('is-on', liked);
      likeLbl.textContent = likeText(likeN);
    });
    const cmtBtn = W.el('button', { class: 'dt-drop__act', type: 'button', 'aria-label': '댓글' });
    cmtBtn.append(W.el('span', { html: SVG.comment }), W.el('span', {}, String(d.comment || 0)));
    const mark = W.el('button', { class: 'dt-drop__bookmark', type: 'button', 'aria-label': '저장', html: SVG.bookmark });
    acts.append(likeBtn, cmtBtn, mark);
    card.appendChild(acts);

    // 캡션
    if (d.caption) card.appendChild(W.el('div', { class: 'dt-drop__cap', html: '<b>' + W.esc(d.crew) + '</b> ' + W.esc(d.caption) }));

    return card;
  }

  /* API 응답 → 드롭 카드 데이터 매핑 */
  function mapFund(p) {
    return {
      id: p.id,
      crew: (p.creatorName || '익명').toUpperCase(),
      tag: 'CREW',
      handle: p.creatorSlug ? ('@' + p.creatorSlug) : '',
      creatorId: p.creatorId || null,
      creatorSlug: p.creatorSlug || null,
      live: p.status === 'active' || p.status === 'open',
      price: p.price || p.minPrice || 0,
      like: Number(p.likeCount) || 0,
      comment: Number(p.commentCount) || 0,
      caption: p.title || '',
      image: p.coverImageUrl || '',
      href: '/detail.html?id=' + encodeURIComponent(p.id),
    };
  }

  function render(root, items) {
    // 스토리 링은 run()에서 이미 렌더됨 — 여기서는 피드만 추가(중복 방지).
    const feed = W.el('div', { class: 'dt-feed' });
    items.forEach((d) => feed.appendChild(Drop(d)));
    root.appendChild(feed);
  }

  // 탐색(explore) 카드 { id, status, title, image } → 릴스 Drop 형식으로 변환
  function mapExplore(c) {
    const crew = String(c.title || 'DROP').split(/\s+/)[0].toUpperCase().slice(0, 12);
    return {
      id: c.id,
      crew: crew || 'DROP',
      tag: 'CREW', handle: '',
      live: true, price: c.price || 0,
      like: c.like || 0, comment: c.comment || 0,
      caption: c.title || '',
      image: c.image || '',
      href: String(c.id).indexOf('e') === 0 ? null : ('/detail.html?id=' + encodeURIComponent(c.id)),
    };
  }

  function run() {
    const root = document.getElementById('wz-home');
    if (!root) return;
    document.body.classList.add('dt-dark');
    root.replaceChildren();

    // 다크 헤더는 기존 #wz-header 대신 홈 상단에 자체 렌더
    const hdHost = document.getElementById('wz-header');
    if (hdHost) { hdHost.replaceChildren(); hdHost.appendChild(Header()); }

    // 탐색에서 LIVE DROP 으로 넘어온 경우 — 그 게시물들을 피드 상단에 우선 노출.
    let pinned = [];
    if (new URLSearchParams(location.search).get('feed') === 'live') {
      try {
        const raw = sessionStorage.getItem('dt_live_feed');
        if (raw) pinned = JSON.parse(raw).map(mapExplore);
        sessionStorage.removeItem('dt_live_feed');
      } catch (_) {}
    }

    // 최상단 스토리 링 (크루 스토리 + 내 스토리 추가)
    const ring = W.el('div', { class: 'dt-stories' });
    root.appendChild(ring);
    if (window.WZStory) {
      window.WZStory.renderRing(ring, () => window.WZStory.openUploader());
      window.WZStory._onPublish = () => window.WZStory.renderRing(ring, () => window.WZStory.openUploader());
    }

    const load = W.el('div', { class: 'dt-feed__load' }, '드롭 불러오는 중…');
    root.appendChild(load);

    window.api.get('/groupbuys?limit=24', { silentAuthFail: true })
      .then((data) => {
        const arr = (data && Array.isArray(data.items)) ? data.items : [];
        const mapped = arr.filter((p) => p && p.coverImageUrl).map(mapFund);
        load.remove();
        const base = mapped.length ? mapped : DEMO;
        // pinned(탐색에서 선택한 라이브)를 앞에, 중복 id 는 제거.
        const seen = {}; const merged = [];
        pinned.concat(base).forEach((d) => { const k = String(d.id); if (seen[k]) return; seen[k] = 1; merged.push(d); });
        render(root, merged.length ? merged : base);
      })
      .catch(() => { load.remove(); render(root, pinned.length ? pinned : DEMO); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
