/* =====================================================================
 * DOOTHING — 샘플 스튜디오 (마플 Marpple 클론, studio.html 전용).
 * 핏 선택 없이 바로 티셔츠 에디터. 중앙 캔버스에 이미지 업로드→드래그·리사이즈.
 * 우측 패널: 색상/사이즈/수량/배송비 + 장바구니(결제). 결제는 기존 진입점으로 라우팅.
 * ===================================================================== */
(function () {
  const W = window.WZ;
  if (!W) return;

  const UNIT_PRICE = 9000;    // 1개당 제작 단가(마플식)
  const SHIPPING = 3000;      // 배송비
  const SIZE_EXTRA = { '2XL': 2000, '3XL': 2000 };

  const SVG = {
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7-4-4-7 7v4h4z"/><path d="M3 21l3-1"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13l-3-3M20 17H7l3 3"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2M9 19h6M12 5v14"/></svg>',
    design: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M12 8v8"/></svg>',
    patch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 2"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="7" r="2.4"/><circle cx="7" cy="17" r="2.4"/><circle cx="17" cy="17" r="2.4"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01"/></svg>',
  };

  // 흰 티셔츠 목업(정면). 에셋 없으면 SVG 폴백.
  const MOCK_TEE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><path d="M140 60 L100 90 L70 140 L95 165 L120 140 L120 340 L280 340 L280 140 L305 165 L330 140 L300 90 L260 60 C250 85 220 95 200 95 C180 95 150 85 140 60 Z" fill="#fdfdfd" stroke="#e2e2e2" stroke-width="2"/></svg>'
  );

  const COLORS = ['#FFFFFF', '#F2E9C9', '#111111', '#F4D03F', '#1F6F78', '#A9B7C0', '#C9A24B', '#7A2E3A', '#3B5E3B', '#2E86C1', '#E67E22', '#6C3483', '#283747', '#7FE0C0', '#E8A87C', '#D6E34B', '#E056A0'];
  const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];

  const state = { color: '#FFFFFF', size: 'M', qty: 1, artData: null };

  function money(n) { return (Math.max(0, Math.floor(n))).toLocaleString() + '원'; }
  function unitWithSize() { return UNIT_PRICE + (SIZE_EXTRA[state.size] || 0); }
  function total() { return unitWithSize() * state.qty; }

  function run() {
    document.body.classList.add('dt-studio');
    const host = document.getElementById('studio-root');
    if (!host) return;
    // wz-core 가 넣은 헤더/내비 제거(마플 자체 상단바 사용)
    const hd = document.getElementById('wz-header'); if (hd) hd.replaceChildren();

    host.replaceChildren(TopBar(), Body());
  }

  function TopBar() {
    const bar = W.el('div', { class: 'dt-mp__top' });
    const logo = W.el('button', { class: 'dt-mp__logo', type: 'button' }, 'DOOTHING');
    logo.addEventListener('click', () => location.href = '/main.html');
    const spacer = W.el('div', { class: 'dt-mp__topspacer' });
    const facetag = W.el('div', { class: 'dt-mp__facetag' });
    facetag.append(W.el('b', {}, '앞면'), W.el('span', { class: 'dt-mp__facetag-ic', html: SVG.grid }));
    bar.append(logo, spacer, facetag);
    return bar;
  }

  function Body() {
    const grid = W.el('div', { class: 'dt-mp' });

    // ── 좌측 안내 버튼 ──
    const left = W.el('div', { class: 'dt-mp__left' });
    const b1 = W.el('button', { class: 'dt-mp__leftbtn', type: 'button', html: SVG.pen + '<span>디자인하는 방법</span>' });
    const b2 = W.el('button', { class: 'dt-mp__leftbtn', type: 'button', html: SVG.tag + '<span>상품 판매하기</span>' });
    left.append(b1, b2);

    // ── 중앙 캔버스 + 우측 세로 툴바 ──
    const stage = W.el('div', { class: 'dt-mp__stage' });
    const canvas = W.el('div', { class: 'dt-mp__canvas' });
    const mock = W.el('img', { class: 'dt-mp__mock', src: MOCK_TEE, alt: '티셔츠' });
    canvas.appendChild(mock);
    canvas.appendChild(W.el('div', { class: 'dt-mp__printarea' }));
    const emptyHint = W.el('div', { class: 'dt-mp__emptyhint' }, '이미지를 업로드해 프린팅을 시작하세요');
    canvas.appendChild(emptyHint);
    stage.appendChild(canvas);

    // 색상 반영(티셔츠 tint) — 흰색 외 색은 캔버스 배경으로 간단 표현
    function applyColor() {
      mock.style.filter = state.color === '#FFFFFF' ? 'none' : 'none';
      canvas.style.setProperty('--tee', state.color);
      // 목업 SVG 를 색상에 맞춰 재생성(간단 tint)
      mock.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><path d="M140 60 L100 90 L70 140 L95 165 L120 140 L120 340 L280 340 L280 140 L305 165 L330 140 L300 90 L260 60 C250 85 220 95 200 95 C180 95 150 85 140 60 Z" fill="' + state.color + '" stroke="#d8d8d8" stroke-width="2"/></svg>'
      );
    }

    // 아트 레이어 관리
    let art = null;
    function addArt() {
      if (art) art.remove();
      art = W.el('div', { class: 'dt-mp__art is-sel' });
      art.style.backgroundImage = 'url(' + state.artData + ')';
      const handle = W.el('div', { class: 'dt-mp__handle' });
      const del = W.el('button', { class: 'dt-mp__del', type: 'button', 'aria-label': '삭제', html: SVG.x });
      del.addEventListener('click', (e) => { e.stopPropagation(); art.remove(); art = null; state.artData = null; canvas.appendChild(emptyHint); });
      art.append(handle, del);
      canvas.appendChild(art);
      emptyHint.remove();
      enableDragResize(art, handle, canvas);
    }

    // 우측 세로 툴바
    const rail = W.el('div', { class: 'dt-mp__rail' });
    const fileInput = W.el('input', { class: 'dt-mp__file', type: 'file', accept: 'image/*' });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0]; if (!f) return;
      const rd = new FileReader(); rd.onload = () => { state.artData = rd.result; addArt(); }; rd.readAsDataURL(f);
      fileInput.value = '';
    });
    function tool(icon, label, opts) {
      const b = W.el('button', { class: 'dt-mp__tool', type: 'button' });
      b.appendChild(W.el('span', { class: 'dt-mp__tool-ic', html: icon }));
      b.appendChild(document.createTextNode(label));
      if (opts && opts.badge) b.appendChild(W.el('span', { class: 'dt-mp__tool-new' }, opts.badge));
      if (opts && opts.onClick) b.addEventListener('click', opts.onClick);
      return b;
    }
    rail.append(
      tool(SVG.swap, '상품 변경', { onClick: () => alert('상품 변경은 준비 중입니다.') }),
      tool(SVG.image, '이미지 업로드', { badge: state.artData ? null : null, onClick: () => fileInput.click() }),
      tool(SVG.text, '텍스트', { onClick: () => addTextArt() }),
      tool(SVG.design, '디자인', { badge: 'NEW', onClick: () => fileInput.click() }),
      tool(SVG.patch, '자수패치', { onClick: () => alert('자수패치는 준비 중입니다.') }),
    );
    stage.appendChild(rail);
    stage.appendChild(fileInput);

    // 텍스트 아트(간단): 프롬프트로 문구 받아 이미지 대신 텍스트 레이어
    function addTextArt() {
      const txt = prompt('넣을 문구를 입력하세요', 'DOOTHING');
      if (!txt) return;
      if (art) art.remove();
      art = W.el('div', { class: 'dt-mp__art is-sel' });
      art.style.display = 'flex'; art.style.alignItems = 'center'; art.style.justifyContent = 'center';
      art.style.fontWeight = '900'; art.style.fontSize = '28px'; art.style.color = '#1A1A1A';
      art.style.width = '160px'; art.style.height = '60px';
      art.textContent = txt;
      const handle = W.el('div', { class: 'dt-mp__handle' });
      const del = W.el('button', { class: 'dt-mp__del', type: 'button', html: SVG.x });
      del.addEventListener('click', (e) => { e.stopPropagation(); art.remove(); art = null; });
      art.append(handle, del);
      canvas.appendChild(art); emptyHint.remove();
      enableDragResize(art, handle, canvas);
      state.artData = state.artData || 'text';
    }

    // ── 우측 상품 패널 ──
    const panel = Panel(applyColor);

    grid.append(left, stage, panel);
    setTimeout(applyColor, 0);
    return grid;
  }

  function Panel(applyColor) {
    const panel = W.el('div', { class: 'dt-mp__panel' });

    const top = W.el('div', { class: 'dt-mp__ptop' });
    const info = W.el('div', {});
    info.append(
      W.el('div', { class: 'dt-mp__brand' }, '길단'),
      W.el('h1', { class: 'dt-mp__pname' }, '2000 오리지널 티셔츠'),
      W.el('div', { class: 'dt-mp__punit', html: '1개당 <b>' + money(UNIT_PRICE) + '</b>' })
    );
    info.append(W.el('div', { class: 'dt-mp__prev', html: '<b>4.9</b> · 리뷰 3,841' }));
    const pico = W.el('div', { class: 'dt-mp__pico' });
    pico.append(W.el('span', { html: SVG.share }), W.el('span', { html: SVG.heart }));
    top.append(info, pico);
    panel.appendChild(top);

    // 색상
    panel.appendChild(W.el('div', { class: 'dt-mp__label', html: '색상 - <span id="dt-colorname">화이트</span>' }));
    const colors = W.el('div', { class: 'dt-mp__colors' });
    COLORS.forEach((c) => {
      const sw = W.el('button', { class: 'dt-mp__color' + (c === state.color ? ' is-active' : ''), type: 'button', 'aria-label': c });
      sw.style.background = c;
      sw.addEventListener('click', () => {
        state.color = c;
        colors.querySelectorAll('.dt-mp__color').forEach((n) => n.classList.remove('is-active'));
        sw.classList.add('is-active');
        const nameEl = document.getElementById('dt-colorname');
        if (nameEl) nameEl.textContent = (c === '#FFFFFF' ? '화이트' : (c === '#111111' ? '블랙' : '컬러'));
        applyColor();
      });
      colors.appendChild(sw);
    });
    panel.appendChild(colors);

    // 사이즈
    panel.appendChild(W.el('div', { class: 'dt-mp__label', html: '사이즈 <span>?</span>' }));
    const sizes = W.el('div', { class: 'dt-mp__sizes' });
    SIZES.forEach((s) => {
      const b = W.el('button', { class: 'dt-mp__size' + (s === state.size ? ' is-active' : ''), type: 'button' }, s);
      if (SIZE_EXTRA[s]) b.appendChild(W.el('small', {}, '+' + SIZE_EXTRA[s].toLocaleString()));
      b.addEventListener('click', () => {
        state.size = s;
        sizes.querySelectorAll('.dt-mp__size').forEach((n) => n.classList.remove('is-active'));
        b.classList.add('is-active');
        paintTotals();
      });
      sizes.appendChild(b);
    });
    panel.appendChild(sizes);

    // 수량
    panel.appendChild(W.el('div', { class: 'dt-mp__label' }, '수량'));
    const qtyRow = W.el('div', { class: 'dt-mp__qtyrow' });
    const qty = W.el('div', { class: 'dt-mp__qty' });
    const minus = W.el('button', { type: 'button' }, '−');
    const input = W.el('input', { type: 'text', value: '1', inputmode: 'numeric' });
    const plus = W.el('button', { type: 'button' }, '+');
    minus.addEventListener('click', () => { state.qty = Math.max(1, state.qty - 1); input.value = state.qty; paintTotals(); });
    plus.addEventListener('click', () => { state.qty += 1; input.value = state.qty; paintTotals(); });
    input.addEventListener('input', () => { const v = parseInt(input.value.replace(/\D/g, ''), 10); state.qty = isNaN(v) || v < 1 ? 1 : v; paintTotals(); });
    input.addEventListener('blur', () => { input.value = state.qty; });
    qty.append(minus, input, plus);
    const priceTable = W.el('button', { class: 'dt-mp__pricetable', type: 'button' }, '할인 가격표');
    priceTable.addEventListener('click', () => alert('주문 수량이 많을수록 할인율이 커집니다.'));
    qtyRow.append(qty, priceTable);
    panel.appendChild(qtyRow);

    // 배송비
    const ship = W.el('div', { class: 'dt-mp__ship' });
    ship.append(W.el('span', {}, '배송비'), W.el('b', {}, money(SHIPPING)));
    panel.appendChild(ship);

    // 하단 결제 바
    const buy = W.el('div', { class: 'dt-mp__buy' });
    const sum = W.el('div', { class: 'dt-mp__buy-sum' });
    const sumQty = W.el('span', {}, state.qty + '개');
    const sumAmt = W.el('b', {}, money(total()));
    sum.append(sumQty, sumAmt);
    const buyBtn = W.el('button', { class: 'dt-mp__buybtn', type: 'button' }, '장바구니 담기');
    buyBtn.addEventListener('click', () => {
      buyBtn.classList.add('is-fired');
      try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) {}
      try {
        sessionStorage.setItem('dt_sample_order', JSON.stringify({
          type: 'sample', product: '2000 오리지널 티셔츠',
          color: state.color, size: state.size, qty: state.qty,
          unitPrice: unitWithSize(), shipping: SHIPPING, total: total() + SHIPPING,
          hasArt: !!state.artData, createdAt: Date.now(),
        }));
      } catch (_) {}
      setTimeout(() => { location.href = '/addresses.html?flow=sample'; }, 160);
    });
    buy.append(sum, buyBtn);
    panel.appendChild(buy);

    function paintTotals() {
      sumQty.textContent = state.qty + '개';
      sumAmt.textContent = money(total());
    }

    return panel;
  }

  /* 드래그 + 리사이즈 (포인터 이벤트) */
  function enableDragResize(el, handle, bounds) {
    let mode = null, sx = 0, sy = 0, ox = 0, oy = 0, ow = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.target === handle || e.target.closest('.dt-mp__del')) return;
      mode = 'move'; el.classList.add('is-drag'); el.classList.add('is-sel');
      sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop;
      el.setPointerCapture(e.pointerId); e.preventDefault();
    });
    handle.addEventListener('pointerdown', (e) => {
      mode = 'resize'; sx = e.clientX; ow = el.offsetWidth;
      handle.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault();
    });
    function onMove(e) {
      if (!mode) return;
      if (mode === 'move') {
        el.style.left = (ox + (e.clientX - sx)) + 'px';
        el.style.top = (oy + (e.clientY - sy)) + 'px';
        el.style.transform = 'none';
      } else {
        const w = Math.max(40, Math.min(bounds.clientWidth, ow + (e.clientX - sx)));
        el.style.width = w + 'px'; el.style.height = w + 'px';
      }
    }
    function onUp() { mode = null; el.classList.remove('is-drag'); }
    el.addEventListener('pointermove', onMove);
    handle.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    handle.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
