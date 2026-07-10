/* =====================================================================
 * DOOTHING — 탐색/검색 (feed.html 전용, 다크 테마).
 * 검색바 + 필터칩(LIVE DROP/오버핏/스탠다드핏/CREW COLLAB/SOLD OUT/신상)
 *  + ALL DROPS 사진 2열 그리드. 데이터: GET /api/groupbuys → 없으면 데모 시드.
 * ===================================================================== */
(function () {
  const W = window.WZ;
  if (!W) return;

  const SVG = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  };

  const CHIPS = ['LIVE DROP', '오버핏', '스탠다드핏', 'CREW COLLAB', 'SOLD OUT', '신상'];

  /* 데모 시드 — 무데이터 시 목업 시연용 착장샷 */
  const DEMO = [
    { id: 'e1', live: false, title: 'NO FEAR', image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=80' },
    { id: 'e2', live: true, title: 'STREET ISSUE', image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&q=80' },
    { id: 'e3', live: true, title: 'PINK SEASON', image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80' },
    { id: 'e4', live: false, title: 'SHEARLING', image: 'https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=600&q=80' },
    { id: 'e5', live: true, title: 'ESSENTIAL', image: 'https://images.unsplash.com/photo-1523398002811-999ca8dec234?w=600&q=80' },
    { id: 'e6', live: false, title: 'BOXY FIT', image: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=600&q=80' },
  ];

  function Header() {
    const hd = W.el('header', { class: 'dt-lbhd' });
    const logo = W.el('a', { class: 'dt-lbhd__logo', href: '/main.html', 'aria-label': 'DOOTHING' });
    const logoImg = W.el('img', { class: 'dt-lbhd__logoimg', src: '/assets/logo-doothing.png', alt: 'DOOTHING' });
    logoImg.addEventListener('error', () => { logoImg.remove(); logo.textContent = 'DOOTHING'; });
    logo.appendChild(logoImg);
    hd.appendChild(logo);
    const acts = W.el('div', { class: 'dt-lbhd__actions' });
    acts.appendChild(W.el('a', { class: 'dt-lbhd__ic', href: '/feed.html', 'aria-label': 'Search', html: SVG.search }));
    const heart = W.el('button', { class: 'dt-lbhd__ic', type: 'button', 'aria-label': '알림 센터', html: SVG.heart });
    heart.addEventListener('click', (e) => { e.stopPropagation(); if (typeof window.openHeartCenter === 'function') window.openHeartCenter(); });
    acts.appendChild(heart);
    hd.appendChild(acts);
    return hd;
  }

  function stateLive(f) {
    const s = String(f.status || '').toLowerCase();
    return s === 'active' || s === 'open' || f.live === true;
  }

  function Card(c) {
    const card = W.el('a', { class: 'dt-excard', href: '/main.html?feed=live' });
    const thumb = W.el('div', { class: 'dt-excard__thumb' });
    if (c.image) { const im = W.el('img', { src: c.image, alt: c.title || '', loading: 'lazy' }); thumb.appendChild(im); }
    if (stateLive(c)) thumb.appendChild(W.el('span', { class: 'dt-excard__badge dt-excard__badge--live' }, 'LIVE'));
    card.appendChild(thumb);
    // 게시물 클릭 → 메인 릴스 피드로 돌아가며, 이 게시물을 맨 위에 얹어 바로 보이게.
    card.addEventListener('click', (e) => {
      e.preventDefault();
      try { sessionStorage.setItem('dt_live_feed', JSON.stringify([c])); } catch (_) {}
      location.href = '/main.html?feed=live';
    });
    return card;
  }

  function mapFund(p) {
    return { id: p.id, status: p.status, title: p.title || '', image: p.coverImageUrl || '' };
  }

  function run() {
    const root = document.getElementById('wz-feed');
    if (!root) return;
    document.body.classList.add('dt-dark');
    const hdHost = document.getElementById('wz-header');
    if (hdHost) { hdHost.replaceChildren(); hdHost.appendChild(Header()); }
    root.replaceChildren();

    const ex = W.el('div', { class: 'dt-ex' });
    root.appendChild(ex);

    // 검색바
    const sw = W.el('div', { class: 'dt-ex__searchwrap' });
    const form = W.el('form', { class: 'dt-ex__search', role: 'search' });
    form.innerHTML = SVG.search;
    const input = W.el('input', { type: 'text', placeholder: '크리에이터, 드롭 검색...', 'aria-label': '검색' });
    form.appendChild(input);
    sw.appendChild(form);
    ex.appendChild(sw);

    // 필터칩
    const chipRow = W.el('div', { class: 'dt-ex__chips' });
    let activeChip = null;
    CHIPS.forEach((label) => {
      const chip = W.el('button', { class: 'dt-ex__chip', type: 'button' }, label);
      chip.addEventListener('click', () => {
        // LIVE DROP → 현재 보이는 라이브 게시물을 홈 릴스 피드 상단에 얹고 이동.
        if (label === 'LIVE DROP') {
          const q = (input.value || '').trim().toLowerCase();
          let live = allItems.filter(stateLive);
          if (q) live = live.filter((c) => (c.title || '').toLowerCase().indexOf(q) !== -1);
          try { sessionStorage.setItem('dt_live_feed', JSON.stringify(live)); } catch (_) {}
          location.href = '/main.html?feed=live';
          return;
        }
        if (activeChip === chip) { chip.classList.remove('is-active'); activeChip = null; applyFilter(''); return; }
        if (activeChip) activeChip.classList.remove('is-active');
        chip.classList.add('is-active'); activeChip = chip; applyFilter(label);
      });
      chipRow.appendChild(chip);
    });
    ex.appendChild(chipRow);

    ex.appendChild(W.el('div', { class: 'dt-ex__label' }, 'ALL DROPS'));

    const grid = W.el('div', { class: 'dt-ex__grid' });
    grid.appendChild(W.el('div', { class: 'dt-ex__load' }, '불러오는 중…'));
    ex.appendChild(grid);

    let allItems = [];
    function render(items) {
      grid.replaceChildren();
      if (!items.length) { grid.appendChild(W.el('div', { class: 'dt-ex__empty' }, '드롭이 없어요')); return; }
      items.forEach((c) => grid.appendChild(Card(c)));
    }
    function applyFilter(chipLabel) {
      const q = (input.value || '').trim().toLowerCase();
      let items = allItems;
      if (chipLabel === 'LIVE DROP') items = items.filter(stateLive);
      if (chipLabel === 'SOLD OUT') items = items.filter((c) => !stateLive(c));
      if (q) items = items.filter((c) => (c.title || '').toLowerCase().indexOf(q) !== -1);
      render(items);
    }
    let deb;
    input.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => applyFilter(activeChip ? activeChip.textContent : ''), 200); });
    form.addEventListener('submit', (e) => { e.preventDefault(); applyFilter(activeChip ? activeChip.textContent : ''); });

    window.api.get('/groupbuys?limit=40', { silentAuthFail: true })
      .then((data) => {
        const arr = (data && Array.isArray(data.items)) ? data.items : [];
        const mapped = arr.filter((p) => p && p.coverImageUrl).map(mapFund);
        allItems = mapped.length ? mapped : DEMO;
        render(allItems);
      })
      .catch(() => { allItems = DEMO; render(allItems); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
