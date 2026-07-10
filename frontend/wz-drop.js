/* =====================================================================
 * DOOTHING — 드롭 오픈 (인스타 게시물 업로드 클론, drop.html 전용).
 * Step1 사진 선택 + 무드 필터(CSS filter) → Step2 스토리/해시태그/디자인 태깅
 *  → Step3 가격(베이스+크리에이터 마진) 설정 → 기존 POST /api/funds 로 전송.
 * ===================================================================== */
(function () {
  const W = window.WZ;
  if (!W) return;

  const BASE_PRICE = 15000;   // 기본 원가 + 플랫폼 수수료 합산 베이스(고정 노출)
  const CATEGORIES = [
    ['tshirt', '반팔티'], ['hoodie', '후드티·맨투맨'], ['jacket', '과잠'],
    ['ecobag', '에코백'], ['keyring', '키링·스트랩'], ['phonecase', '폰케이스'],
    ['sticker', '스티커·문구'], ['badge', '뱃지'], ['etc', '기타'],
  ];

  // CSS filter 무드 프리셋 (가벼운 렌더링)
  const FILTERS = [
    { key: 'none', name: '원본', css: 'none' },
    { key: 'bw', name: '흑백', css: 'grayscale(1) contrast(1.1)' },
    { key: 'vintage', name: '빈티지', css: 'sepia(.4) contrast(.95) saturate(1.2) brightness(1.02)' },
    { key: 'cool', name: '쿨톤', css: 'saturate(1.1) hue-rotate(-12deg) brightness(1.03) contrast(1.05)' },
    { key: 'street', name: '스트릿', css: 'contrast(1.25) saturate(.85) brightness(.96)' },
    { key: 'fade', name: '페이드', css: 'contrast(.9) brightness(1.08) saturate(.9)' },
  ];

  const SVG = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  };

  // state
  const state = {
    step: 1,
    photos: [],        // { dataUrl }
    selected: [],      // 선택 순서 index
    filter: 'none',
    story: '',
    hashtags: [],
    category: 'tshirt',
    designTag: null,   // 연결한 내 디자인 id
    margin: 5000,
    targetQty: 30,
    deadlineDays: 14,
  };

  // 내 디자인(모드A) — /api/me/designs. 없으면 데모.
  let myDesigns = [];

  function money(n) { return (Math.max(0, Math.floor(n))).toLocaleString() + '원'; }
  function filterCss(key) { return (FILTERS.find((f) => f.key === key) || FILTERS[0]).css; }
  const root = () => document.getElementById('drop-root');

  function TopBar(title, nextText, nextEnabled, onBack, onNext) {
    const bar = W.el('div', { class: 'dt-dr__top' });
    const back = W.el('button', { class: 'dt-dr__back', type: 'button', html: SVG.back });
    back.addEventListener('click', onBack);
    bar.appendChild(back);
    bar.appendChild(W.el('div', { class: 'dt-dr__title' }, title));
    const next = W.el('button', { class: 'dt-dr__next', type: 'button' }, nextText);
    if (!nextEnabled) next.setAttribute('disabled', 'disabled');
    next.addEventListener('click', onNext);
    bar.appendChild(next);
    return bar;
  }

  /* ── Step 1: 사진 선택 + 필터 ── */
  function renderStep1() {
    state.step = 1;
    const r = root(); r.replaceChildren();
    r.appendChild(TopBar('새 드롭', '다음', state.selected.length > 0,
      () => location.href = '/main.html',
      () => { if (state.selected.length) renderStep2(); }));

    const wrap = W.el('div', { class: 'dt-dr' });

    // 미리보기(첫 선택 사진 + 필터)
    const preview = W.el('div', { class: 'dt-dr__preview' });
    const firstIdx = state.selected[0];
    if (firstIdx != null && state.photos[firstIdx]) {
      const img = W.el('img', { src: state.photos[firstIdx].dataUrl, alt: '' });
      img.style.filter = filterCss(state.filter);
      preview.appendChild(img);
    } else {
      const empty = W.el('div', { class: 'dt-dr__preview-empty' });
      empty.innerHTML = SVG.image;
      const add = W.el('button', { class: 'dt-dr__addbtn', type: 'button' }, '사진 추가');
      add.addEventListener('click', () => fileInput.click());
      empty.appendChild(add);
      preview.appendChild(empty);
    }
    wrap.appendChild(preview);

    // 필터 프리셋(사진 선택된 경우만)
    if (firstIdx != null) {
      const filters = W.el('div', { class: 'dt-dr__filters' });
      FILTERS.forEach((f) => {
        const btn = W.el('button', { class: 'dt-dr__filter' + (state.filter === f.key ? ' is-active' : ''), type: 'button' });
        const th = W.el('img', { class: 'dt-dr__filter-thumb', src: state.photos[firstIdx].dataUrl, alt: f.name });
        th.style.filter = f.css;
        btn.append(th, W.el('span', { class: 'dt-dr__filter-name' }, f.name));
        btn.addEventListener('click', () => { state.filter = f.key; renderStep1(); });
        filters.appendChild(btn);
      });
      wrap.appendChild(filters);
    }

    // 갤러리 헤더 + 그리드
    wrap.appendChild(W.el('div', { class: 'dt-dr__galhead' }, W.el('span', {}, '갤러리 · 여러 장 선택 가능')));
    const gal = W.el('div', { class: 'dt-dr__gal' });
    // 첫 셀 = 추가 버튼
    const addCell = W.el('button', { class: 'dt-dr__cell dt-dr__cell-add', type: 'button', 'aria-label': '사진 추가' });
    addCell.innerHTML = SVG.plus;
    addCell.addEventListener('click', () => fileInput.click());
    gal.appendChild(addCell);
    state.photos.forEach((p, i) => {
      const cell = W.el('button', { class: 'dt-dr__cell', type: 'button' });
      const selOrder = state.selected.indexOf(i);
      if (selOrder !== -1) { cell.classList.add('is-sel'); cell.appendChild(W.el('span', { class: 'dt-dr__cell-num' }, String(selOrder + 1))); }
      cell.appendChild(W.el('img', { src: p.dataUrl, alt: '' }));
      cell.addEventListener('click', () => {
        const at = state.selected.indexOf(i);
        if (at === -1) state.selected.push(i); else state.selected.splice(at, 1);
        renderStep1();
      });
      gal.appendChild(cell);
    });
    wrap.appendChild(gal);
    r.appendChild(wrap);

    // 파일 입력(다중)
    const fileInput = W.el('input', { type: 'file', accept: 'image/*', multiple: '', style: 'display:none' });
    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      let pending = files.length;
      if (!pending) return;
      files.forEach((f) => {
        const rd = new FileReader();
        rd.onload = () => {
          state.photos.push({ dataUrl: rd.result });
          const idx = state.photos.length - 1;
          if (state.selected.length === 0) state.selected.push(idx);
          if (--pending === 0) renderStep1();
        };
        rd.readAsDataURL(f);
      });
      fileInput.value = '';
    });
    r.appendChild(fileInput);
  }

  /* ── Step 2: 스토리 + 해시태그 + 디자인 태깅 ── */
  function renderStep2() {
    state.step = 2;
    const r = root(); r.replaceChildren();
    r.appendChild(TopBar('스토리 작성', '다음', true, () => renderStep1(), () => renderStep3()));

    const wrap = W.el('div', { class: 'dt-dr__story' });

    // 스토리 textarea (썸네일 + 순수 텍스트)
    const top = W.el('div', { class: 'dt-dr__storytop' });
    const firstIdx = state.selected[0];
    if (firstIdx != null) {
      const th = W.el('img', { class: 'dt-dr__thumb-sm', src: state.photos[firstIdx].dataUrl, alt: '' });
      th.style.filter = filterCss(state.filter);
      top.appendChild(th);
    }
    const ta = W.el('textarea', { class: 'dt-dr__textarea', placeholder: '이 드롭의 스토리를 힙하게 적어보세요...' });
    ta.value = state.story;
    ta.addEventListener('input', () => { state.story = ta.value; });
    top.appendChild(ta);
    wrap.appendChild(top);

    // 해시태그
    const hashField = W.el('div', { class: 'dt-dr__field' });
    hashField.appendChild(W.el('label', { class: 'dt-dr__field-label' }, '해시태그'));
    const hashWrap = W.el('div', { class: 'dt-dr__hashwrap' });
    function paintHash() {
      hashWrap.replaceChildren();
      state.hashtags.forEach((h, i) => {
        const chip = W.el('span', { class: 'dt-dr__hash' }, '#' + h);
        const x = W.el('button', { type: 'button', 'aria-label': '삭제' }, '×');
        x.addEventListener('click', () => { state.hashtags.splice(i, 1); paintHash(); });
        chip.appendChild(x);
        hashWrap.appendChild(chip);
      });
      hashWrap.appendChild(hashInput);
      hashInput.focus();
    }
    const hashInput = W.el('input', { class: 'dt-dr__hashinput', type: 'text', placeholder: '태그 입력 후 Enter' });
    hashInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
        e.preventDefault();
        const v = hashInput.value.trim().replace(/^#/, '');
        if (v && state.hashtags.indexOf(v) === -1 && state.hashtags.length < 10) state.hashtags.push(v);
        hashInput.value = ''; paintHash();
      } else if (e.key === 'Backspace' && !hashInput.value && state.hashtags.length) {
        state.hashtags.pop(); paintHash();
      }
    });
    hashWrap.appendChild(hashInput);
    hashField.appendChild(hashWrap);
    wrap.appendChild(hashField);

    // 카테고리
    const catField = W.el('div', { class: 'dt-dr__field' });
    catField.appendChild(W.el('label', { class: 'dt-dr__field-label' }, '카테고리'));
    const sel = W.el('select', { class: 'dt-dr__cat' });
    CATEGORIES.forEach(([slug, label]) => {
      const opt = W.el('option', { value: slug }, label);
      if (slug === state.category) opt.setAttribute('selected', 'selected');
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => { state.category = sel.value; });
    catField.appendChild(sel);
    wrap.appendChild(catField);

    // 디자인 태깅
    const tagField = W.el('div', { class: 'dt-dr__field' });
    tagField.appendChild(W.el('label', { class: 'dt-dr__field-label' }, '내 디자인 태그 (선택)'));
    const tags = W.el('div', { class: 'dt-dr__tags' });
    if (!myDesigns.length) {
      tagField.appendChild(W.el('p', { class: 'dt-dr__margin-sub' }, '샘플 스튜디오에서 만든 디자인을 연결할 수 있어요.'));
    } else {
      myDesigns.forEach((d) => {
        const card = W.el('button', { class: 'dt-dr__tagcard' + (state.designTag === d.id ? ' is-sel' : ''), type: 'button' });
        const th = W.el('div', { class: 'dt-dr__tagcard-thumb' });
        if (d.thumb) th.appendChild(W.el('img', { src: d.thumb, alt: d.name, style: 'width:100%;height:100%;object-fit:cover;border-radius:8px' }));
        else th.textContent = 'DESIGN';
        card.append(th, W.el('span', { class: 'dt-dr__tagcard-name' }, d.name || '디자인'));
        card.addEventListener('click', () => { state.designTag = state.designTag === d.id ? null : d.id; renderStep2(); });
        tags.appendChild(card);
      });
      tagField.appendChild(tags);
    }
    wrap.appendChild(tagField);
    r.appendChild(wrap);
  }

  /* ── Step 3: 가격(마진) 설정 → 발행 ── */
  function renderStep3() {
    state.step = 3;
    const r = root(); r.replaceChildren();
    r.appendChild(TopBar('가격 설정', '', false, () => renderStep2(), () => {}));
    r.querySelector('.dt-dr__next').style.visibility = 'hidden';

    const wrap = W.el('div', { class: 'dt-dr__price' });

    const box = W.el('div', { class: 'dt-dr__pricebox' });
    function prow(label, val, strong) { const d = W.el('div', { class: 'dt-dr__prow' }); d.append(W.el('span', {}, label), strong ? W.el('b', {}, val) : W.el('span', {}, val)); return d; }
    box.append(
      prow('기본 원가 + 수수료', money(BASE_PRICE), true),
      W.el('div', { class: 'dt-dr__pdiv' })
    );

    box.appendChild(W.el('div', { class: 'dt-dr__margin-label' }, '내 마진 설정'));
    box.appendChild(W.el('p', { class: 'dt-dr__margin-sub' }, '베이스 가격 위에 얻고 싶은 이익금을 정하세요.'));

    const slider = W.el('input', { class: 'dt-dr__slider', type: 'range', min: '0', max: '50000', step: '500', value: String(state.margin) });
    box.appendChild(slider);

    const marginInput = W.el('div', { class: 'dt-dr__margin-input' });
    const inp = W.el('input', { type: 'text', inputmode: 'numeric', value: state.margin.toLocaleString() });
    marginInput.append(inp, W.el('span', {}, '원'));
    box.appendChild(marginInput);

    const final = W.el('div', { class: 'dt-dr__final' });
    final.appendChild(W.el('div', { class: 'dt-dr__final-label' }, '최종 펀딩 오픈 가격'));
    const finalAmt = W.el('div', { class: 'dt-dr__final-amt' }, money(BASE_PRICE + state.margin));
    final.appendChild(finalAmt);
    box.appendChild(final);
    wrap.appendChild(box);

    function sync(v) {
      state.margin = Math.max(0, Math.min(50000, Math.floor(v) || 0));
      slider.value = String(state.margin);
      inp.value = state.margin.toLocaleString();
      finalAmt.textContent = money(BASE_PRICE + state.margin);
    }
    slider.addEventListener('input', () => sync(Number(slider.value)));
    inp.addEventListener('input', () => sync(Number(inp.value.replace(/\D/g, ''))));

    // 목표 수량 + 마감일
    const opts = W.el('div', { class: 'dt-dr__opts' });
    const qtyOpt = W.el('div', { class: 'dt-dr__opt' });
    qtyOpt.appendChild(W.el('label', {}, '목표 수량'));
    const qtyInp = W.el('input', { type: 'number', min: '1', value: String(state.targetQty) });
    qtyInp.addEventListener('input', () => { state.targetQty = Math.max(1, parseInt(qtyInp.value, 10) || 1); });
    qtyOpt.appendChild(qtyInp);
    const dOpt = W.el('div', { class: 'dt-dr__opt' });
    dOpt.appendChild(W.el('label', {}, '모집 기간(일)'));
    const dInp = W.el('input', { type: 'number', min: '1', value: String(state.deadlineDays) });
    dInp.addEventListener('input', () => { state.deadlineDays = Math.max(1, parseInt(dInp.value, 10) || 1); });
    dOpt.appendChild(dInp);
    opts.append(qtyOpt, dOpt);
    wrap.appendChild(opts);
    r.appendChild(wrap);

    // 하단 오픈 버튼
    const bar = W.el('div', { class: 'dt-dr__bar' });
    const inner = W.el('div', { class: 'dt-dr__bar-inner' });
    const openBtn = W.el('button', { class: 'dt-dr__open', type: 'button' }, 'DROP 오픈하기');
    openBtn.addEventListener('click', () => {
      openBtn.classList.add('is-fired');
      try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) {}
      setTimeout(() => publish(openBtn), 180);
    });
    inner.appendChild(openBtn);
    bar.appendChild(inner);
    r.appendChild(bar);
  }

  /* 발행 — 기존 POST /api/funds payload 규격에 맞춰 전송 */
  async function publish(btn) {
    const finalPrice = BASE_PRICE + state.margin;
    const firstIdx = state.selected[0];
    const cover = (firstIdx != null && state.photos[firstIdx]) ? state.photos[firstIdx].dataUrl : null;

    // 스토리 + 해시태그를 contentBlocks(text) 로. 선택 사진들은 image 블록으로.
    const storyText = state.story + (state.hashtags.length ? ('\n\n' + state.hashtags.map((h) => '#' + h).join(' ')) : '');
    const blocks = [];
    if (storyText.trim()) blocks.push({ type: 'text', value: storyText.trim() });
    state.selected.forEach((i) => { if (state.photos[i]) blocks.push({ type: 'image', value: state.photos[i].dataUrl }); });

    const deadline = new Date(Date.now() + state.deadlineDays * 86400000).toISOString().slice(0, 10);
    const title = (state.story.split('\n')[0] || '새로운 드롭').slice(0, 60);

    // 리워드 1개 = 최종 펀딩가. 목표 금액 = 최종가 × 목표 수량.
    const payload = {
      mode: 'normal',
      title,
      description: state.story.slice(0, 2000),
      category: state.category,
      deadline,
      targetAmount: Math.max(1000, finalPrice * state.targetQty),
      targetQuantity: state.targetQty,
      coverImageUrl: cover,
      contentBlocks: blocks,
      rewardTiers: [{ title: 'GET DROP', price: finalPrice, stock: state.targetQty, desc: '드롭 1개' }],
      // 참고 메타(백엔드 무시해도 무방)
      basePrice: BASE_PRICE,
    };

    try {
      const res = await window.api.post('/funds', payload);
      const id = res && res.id;
      alert('드롭이 오픈 신청되었어요! 심사 후 공개됩니다.');
      location.href = id ? ('/detail.html?id=' + encodeURIComponent(id)) : '/main.html';
    } catch (e) {
      btn.classList.remove('is-fired');
      if (e && e.status === 401) { location.href = '/login.html?return=' + encodeURIComponent('/drop.html'); return; }
      alert((e && e.message) ? e.message : '드롭 오픈에 실패했어요. 잠시 후 다시 시도해 주세요.');
    }
  }

  function run() {
    document.body.classList.add('dt-dark');
    if (!root()) return;
    const hd = document.getElementById('wz-header'); if (hd) hd.replaceChildren();
    // 내 디자인 로드(선택 태깅용)
    window.api.get('/me/designs', { silentAuthFail: true })
      .then((r) => { myDesigns = (r && Array.isArray(r.items)) ? r.items.map((d) => ({ id: d.id, name: d.title || '디자인', thumb: d.previewUrl || d.thumbnailUrl || '' })) : []; })
      .catch(() => { myDesigns = []; })
      .finally(() => renderStep1());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
