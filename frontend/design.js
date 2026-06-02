/**
 * 디자인하기 에디터 — 마플 스타일 상품 커스터마이즈.
 *
 *  - 카테고리·상품별 사진 목업(/assets/mockups/<img>_<view>.png, 1248² 1:1). 없으면 SVG 폴백.
 *  - 카테고리 내 상품 변형(후드↔맨투맨, 텀블러↔머그, 키링 모양 등) + 다면(앞/뒤/좌/우/넥/전개도).
 *  - 레이어: 이미지 업로드 + 텍스트. 캔버스 위에서 드래그/리사이즈/삭제, 레이어 패널로 순서/선택.
 *  - 옵션: 상품 종류 · 색상(주문 메타) · 사이즈 · 수량. 면별 독립 레이어.
 *  - 저장/불러오기: /api/me/designs (개인 프로필) — 언제든 이어서 편집.
 *  - 다운로드: 목업+레이어 합성 PNG.
 *  - 완성 영역: [완성하기-저장] + [AI 디자인 보기](/ai/blueprint) | [가상피팅 보기](/ai/try-on, AI디자인 전 잠금).
 *
 *  좌표계: 모든 레이어 위치/크기는 캔버스 대비 % (반응형). 폰트 크기는 캔버스 높이 대비 %.
 *  XSS: 사용자 텍스트는 textContent 로만 출력.
 */
(function () {
  var W = window.WZ || {};
  var el = W.el || function (t) { return document.createElement(t); };

  // ---- 카테고리별 상품 정의 ---------------------------------------------------
  // 각 카테고리 → { type, items:[{ name, img, views, print:{view:{l,t,w,h}} }] }
  //   type: 'apparel'(가상피팅) | 'goods'(전시) | 'none'
  //   img : /assets/mockups/<img>_<view>.png 베이스 이름. null 이면 SVG 폴백.
  //   views: 제공되는 면(front/back/left/right/neck/wrap). print: 면별 인쇄영역(캔버스 대비 %).
  var AP = ['front', 'back', 'left', 'right'];
  function pr(l, t, w, h) { return { l: l, t: t, w: w, h: h }; }
  // 인쇄영역(캔버스 대비 %)은 실제 목업 이미지의 제품 위치를 픽셀 분석 + 시각 검수로 맞춤.
  var PRODUCTS = {
    jacket: { type: 'apparel', tint: true, items: [
      { name: '바시티 자켓', img: 'varsity_jacket', views: AP,
        print: { front: pr(31, 23, 38, 56), back: pr(29, 18, 42, 62), left: pr(40, 26, 20, 24), right: pr(40, 26, 20, 24) } },
    ] },
    hoodie: { type: 'apparel', tint: true, items: [
      { name: '후드티', img: 'hoodie', views: AP,
        print: { front: pr(31, 41, 38, 39), back: pr(30, 18, 40, 60), left: pr(40, 26, 20, 24), right: pr(40, 26, 20, 24) } },
      { name: '맨투맨', img: 'sweatshirt', views: AP,
        print: { front: pr(30, 22, 40, 58), back: pr(29, 22, 42, 57), left: pr(40, 26, 20, 24), right: pr(40, 26, 20, 24) } },
    ] },
    tshirt: { type: 'apparel', tint: true, items: [
      { name: '반팔티', img: 'tshirt', views: ['front', 'back', 'left', 'right', 'neck'],
        print: { front: pr(29, 18, 42, 66), back: pr(29, 17, 42, 68), left: pr(40, 26, 20, 24), right: pr(40, 26, 20, 24), neck: pr(36, 40, 28, 14) } },
    ] },
    ecobag: { type: 'goods', tint: true, items: [
      { name: '에코백', img: 'ecobag', views: ['front', 'back'], print: { front: pr(30, 37, 40, 40), back: pr(30, 37, 40, 40) } },
    ] },
    keyring: { type: 'goods', items: [
      { name: '아크릴 키링', img: 'keyring', views: ['front'], print: { front: pr(32, 26, 36, 44) } },
      { name: '원형 키링', img: 'keyring_round', views: ['front'], print: { front: pr(26, 28, 44, 44) } },
      { name: '사각 키링', img: 'keyring_square', views: ['front'], print: { front: pr(26, 26, 46, 46) } },
      { name: '스트랩 키링', img: 'keyring_strap', views: ['front'], print: { front: pr(44, 16, 14, 50) } },
    ] },
    phonecase: { type: 'goods', items: [
      { name: '폰케이스', img: 'phonecase', views: ['back'], print: { back: pr(33, 15, 34, 66) } },
    ] },
    sticker: { type: 'goods', items: [
      { name: '스티커', img: 'sticker_sheet', views: ['front'], print: { front: pr(18, 14, 64, 74) } },
    ] },
    badge: { type: 'goods', items: [
      { name: '뱃지', img: 'badge', views: ['front'], print: { front: pr(26, 32, 48, 36) } },
    ] },
    tumbler: { type: 'goods', tint: true, items: [
      { name: '텀블러', img: 'tumbler', views: ['front', 'left', 'right', 'wrap'],
        print: { front: pr(37, 20, 24, 54), left: pr(36, 20, 24, 55), right: pr(38, 20, 24, 54), wrap: pr(10, 34, 80, 32) } },
      { name: '머그컵', img: 'mug', views: ['front', 'left', 'right'],
        print: { front: pr(34, 34, 28, 30), left: pr(33, 33, 32, 32), right: pr(33, 33, 32, 32) } },
    ] },
    fabric: { type: 'goods', tint: true, items: [
      { name: '담요', img: 'blanket', views: ['front'], print: { front: pr(24, 18, 52, 62) } },
    ] },
    doll: { type: 'goods', items: [
      { name: '마스코트 인형', img: 'mascot', views: AP,
        print: { front: pr(36, 40, 28, 24), back: pr(36, 40, 28, 24), left: pr(36, 40, 28, 24), right: pr(36, 40, 28, 24) } },
    ] },
    accessory: { type: 'goods', items: [
      { name: '액세서리', img: 'accessory', views: ['front'], print: { front: pr(32, 26, 36, 40) } },
    ] },
    webapp: { type: 'none', items: [{ name: '커스텀 굿즈', img: null, views: ['front'], print: { front: pr(22, 22, 56, 56) } }] },
    etc: { type: 'none', items: [{ name: '커스텀 굿즈', img: null, views: ['front'], print: { front: pr(22, 22, 56, 56) } }] },
  };
  function catDef(slug) { return PRODUCTS[slug] || PRODUCTS.etc; }
  function curItem() { return catDef(S.slug).items[S.itemIdx] || catDef(S.slug).items[0]; }
  function isApparel() { return catDef(S.slug).type === 'apparel'; }
  function tintable() { return catDef(S.slug).tint === true; } // 색이 필요한 제품(의류·에코백·텀블러/머그·담요)만 실시간 색칠

  // 색상 팔레트(주문 옵션용 메타데이터 — 사진 목업은 흰색 기준이라 색을 시각적으로 바꾸진 않음)
  var COLORS = [
    { name: '화이트', hex: '#ffffff' }, { name: '블랙', hex: '#2b2b2e' },
    { name: '그레이', hex: '#b8bcc4' }, { name: '네이비', hex: '#23304f' },
    { name: '레드', hex: '#d23b3b' }, { name: '퍼플', hex: '#8B5CF6' },
    { name: '그린', hex: '#3a9a5c' }, { name: '베이지', hex: '#e7dcc6' },
  ];
  var SIZES = ['S', 'M', 'L', 'XL', '2XL'];

  var VIEW_LABEL = { front: '앞면', back: '뒷면', left: '왼쪽', right: '오른쪽', neck: '넥(목)', wrap: '전개도' };
  function views() { return curItem().views; }
  function primaryView() { return views()[0]; } // 대표 면(폰케이스처럼 front 가 없는 상품 대비)
  function viewLabel(v) { return VIEW_LABEL[v] || v; }

  // 베이스 목업 이미지 경로(/assets/mockups/<img>_<view>.jpg, 흰배경 렌더 → 경량 JPEG). img 없으면 null → SVG 폴백.
  function mockupSrc(view) {
    var it = curItem();
    return it.img ? '/assets/mockups/' + it.img + '_' + view + '.jpg' : null;
  }
  // 옷/제품 실루엣 마스크(알파 PNG, 제품=불투명·배경=투명). 레이어를 이 모양으로 클리핑 → 제품 밖은 잘림.
  function maskSrc(view) {
    var it = curItem();
    return it.img ? '/assets/mockups/' + it.img + '_' + view + '_mask.png' : null;
  }
  function applyMaskCss(node, src) {
    if (!src) return;
    var c = 'url("' + src + '")';
    node.style.webkitMaskImage = c; node.style.maskImage = c;
    node.style.webkitMaskSize = '100% 100%'; node.style.maskSize = '100% 100%';
    node.style.webkitMaskRepeat = 'no-repeat'; node.style.maskRepeat = 'no-repeat';
  }
  function isWhite(c) { return !c || String(c).toLowerCase() === '#ffffff' || String(c).toLowerCase() === '#fff'; }

  // ---- 목업 SVG 폴백(이미지 없는 webapp/etc, 또는 로드 실패 시) -----------------
  function goodsSvg() {
    var stroke = '#cfcfd6';
    var inner = '<rect x="40" y="40" width="420" height="420" rx="44" fill="' + S.color + '" stroke="' + stroke + '" stroke-width="3"/>'
      + '<image href="/assets/' + S.slug + '.png" x="150" y="150" width="200" height="200" opacity="0.10" preserveAspectRatio="xMidYMid meet"/>';
    return '<svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' + inner + '</svg>';
  }
  function mockSvg() { return goodsSvg(); }
  function canvasAspect() { return 1; } // 모든 목업 1:1(1248²)

  // ---- 상태 -------------------------------------------------------------------
  var S = {
    slug: '', catObj: null, itemIdx: 0,
    product: '', color: '#ffffff', size: 'M', qty: 1,
    view: 'front',
    views: {},          // { front: [layer...], back: [layer...] }
    sel: null,          // 선택된 레이어 id
    designId: null,     // 기존 디자인 수정 중이면 id
    title: '내 디자인',
    seq: 0,
    aiDesign: null,     // AI 디자인 보기 결과(blueprintDataUrl) — 가상피팅 잠금 해제 키
    aiFitting: null,    // 가상피팅/전시 결과(tryOnDataUrl)
  };
  function cvLayers() { return S.views[S.view] || (S.views[S.view] = []); }
  function selLayer() { var ls = cvLayers(); for (var i = 0; i < ls.length; i++) if (ls[i].id === S.sel) return ls[i]; return null; }
  var imgCache = {}; // layerId -> HTMLImageElement (합성용)

  // ---- DOM refs ---------------------------------------------------------------
  var root, canvasEl, layersWrap, selWrap, mockCanvasEl, viewsWrap, propsBox, layerListBox, titleInput;
  // 이미지 로더(큐 기반) — 같은 src 동시요청을 합치고, 로드되면 대기 콜백 모두 호출.
  var imgCache2 = {};
  function loadImg2(src, cb) {
    var e = imgCache2[src];
    if (e && e.img.complete && e.img.naturalWidth) { cb(e.img); return; }
    if (e) { e.cbs.push(cb); return; }
    var img = new Image();
    var rec = { img: img, cbs: [cb] };
    imgCache2[src] = rec;
    img.onload = function () { var cbs = rec.cbs; rec.cbs = []; cbs.forEach(function (f) { f(img); }); };
    img.onerror = function () { rec.cbs = []; cb(null); };
    img.src = src;
  }

  function toast(msg) {
    var t = el('div', { class: 'dz-toast' }, msg);
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-on'); });
    setTimeout(function () { t.classList.remove('is-on'); setTimeout(function () { t.remove(); }, 220); }, 1900);
  }

  // ---- 렌더: 전체 ------------------------------------------------------------
  function render() {
    root.replaceChildren();
    var wrap = el('div', { class: 'dz-wrap' });

    // 상단 바
    titleInput = el('input', { class: 'dz-titlein', type: 'text', maxlength: '40', value: S.title, 'aria-label': '디자인 이름' });
    titleInput.addEventListener('change', function () { S.title = titleInput.value.trim() || '내 디자인'; });
    var top = el('div', { class: 'dz-top' },
      el('div', { class: 'dz-top__l' },
        el('div', { class: 'dz-title' }, '디자인하기'),
        titleInput,
      ),
      el('div', { class: 'dz-top__r' },
        btn('불러오기', 'outline', openLoadModal),
        btn('다운로드', 'outline', downloadDesign),
        btn('저장', 'primary', saveDesign),
      ),
    );
    wrap.appendChild(top);

    var grid = el('div', { class: 'dz-grid' });

    // 좌: 스테이지
    var stage = el('div', { class: 'dz-stage' });
    viewsWrap = el('div', { class: 'dz-views' });
    renderViews();
    stage.appendChild(viewsWrap);

    canvasEl = el('div', { class: 'dz-canvas', style: 'aspect-ratio: 1 / 1' });
    canvasEl.appendChild(buildMockNode()); // 목업+옷색(canvas)
    var mk = maskSrc(S.view);
    // 레이어 컨테이너 — 제품 실루엣 마스크로 클리핑(제품 밖으로 나간 부분은 잘림).
    layersWrap = el('div', { class: 'dz-canvas__layers', style: 'position:absolute;inset:0' });
    applyMaskCss(layersWrap, mk);
    canvasEl.appendChild(layersWrap);
    // 선택 UI(선택박스+핸들)는 마스크 밖 별도 오버레이 — 제품 가장자리에서도 안 잘리고 잡을 수 있게.
    selWrap = el('div', { class: 'dz-canvas__sel', style: 'position:absolute;inset:0;pointer-events:none' });
    canvasEl.appendChild(selWrap);
    // 빈 곳(레이어/선택UI가 아닌 곳) 클릭 → 선택 해제
    canvasEl.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('.dz-layer') && !e.target.closest('.dz-sel')) {
        S.sel = null; renderLayers(); renderProps(); renderLayerList();
      }
    });
    stage.appendChild(canvasEl);
    var hintText = cvLayers().length
      ? '끌어서 이동 · 모서리 점으로 크기 조절. 제품 밖으로 나간 부분은 인쇄되지 않아요.'
      : '오른쪽에서 이미지·텍스트를 추가해 ' + (S.product || '굿즈') + '을(를) 꾸며보세요. 디자인은 제품 모양에 맞게 잘립니다.';
    stage.appendChild(el('div', { class: 'dz-hint' }, hintText));
    grid.appendChild(stage);

    // 우: 패널
    var panel = el('div', { class: 'dz-panel' });
    panel.appendChild(toolsCard());
    panel.appendChild(optionsCard());
    propsBox = el('div', {});
    panel.appendChild(propsBox);
    layerListBox = el('div', { class: 'dz-card' });
    panel.appendChild(layerListBox);
    // 완성 버튼
    panel.appendChild(completeBlock());
    grid.appendChild(panel);

    wrap.appendChild(grid);
    root.appendChild(wrap);

    renderLayers(); renderProps(); renderLayerList();
    if (window.WZI18N && window.WZI18N.apply) try { window.WZI18N.apply(root); } catch (_) {}
  }

  function btn(label, kind, on, cls) {
    var b = el('button', { class: 'wz-btn wz-btn--' + kind + (cls ? ' ' + cls : ''), type: 'button' }, label);
    b.addEventListener('click', on);
    return b;
  }

  function renderViews() {
    viewsWrap.replaceChildren();
    var vs = views();
    viewsWrap.style.display = vs.length > 1 ? '' : 'none'; // 면이 하나면 탭 숨김
    vs.forEach(function (v) {
      var b = el('button', { class: 'dz-view' + (v === S.view ? ' is-on' : ''), type: 'button' }, viewLabel(v));
      b.addEventListener('click', function () { if (S.view === v) return; S.view = v; S.sel = null; render(); });
      viewsWrap.appendChild(b);
    });
  }

  function printRect() {
    var p = curItem().print || {};
    return p[S.view] || p[views()[0]] || pr(22, 22, 56, 56);
  }

  // 카테고리 내 상품 변형 전환 — 목업/면이 달라지므로 레이어 초기화 + 면 리셋.
  function switchItem(idx) {
    S.itemIdx = idx;
    S.product = curItem().name;
    S.views = {}; views().forEach(function (v) { S.views[v] = []; });
    S.view = views()[0];
    S.sel = null;
    imgCache = {};
    render();
  }

  // 목업 노드: canvas 에 목업 사진 + (의류·유색이면) 옷 색을 multiply 로 합성해 그린다.
  //  CSS mix-blend-mode 보다 브라우저 호환이 확실하고, 합성(다운로드/AI)과 동일한 결과.
  function buildMockNode() {
    var cv = el('canvas', { class: 'dz-canvas__mock' });
    cv.width = 800; cv.height = 800;
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    mockCanvasEl = cv;
    paintMockCanvas(cv, S.view, S.color);
    return cv;
  }
  // view/color 를 명시 인자로 받아 비동기 콜백 중 S 변형의 영향을 안 받게. 모든 면(앞/뒤/옆)에 동일 적용.
  function paintMockCanvas(cv, view, color) {
    var ctx = cv.getContext('2d'), CW = cv.width, CH = cv.height;
    var token = (cv.__tk = (cv.__tk || 0) + 1);
    function stale() { return mockCanvasEl !== cv || cv.__tk !== token; }
    var src = mockupSrc(view);
    if (!src) { // webapp/etc — SVG 폴백
      var s = new Image();
      s.onload = function () { if (!stale()) { ctx.clearRect(0, 0, CW, CH); ctx.drawImage(s, 0, 0, CW, CH); } };
      s.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(mockSvg());
      return;
    }
    var tintOn = tintable() && !isWhite(color);
    var msrc = maskSrc(view);
    loadImg2(src, function (base) {
      if (stale() || !base) return;
      ctx.clearRect(0, 0, CW, CH); ctx.drawImage(base, 0, 0, CW, CH);
      if (!(tintOn && msrc)) return;
      loadImg2(msrc, function (mask) {
        if (stale() || !mask) return;
        ctx.clearRect(0, 0, CW, CH); ctx.drawImage(base, 0, 0, CW, CH);
        var tc = document.createElement('canvas'); tc.width = CW; tc.height = CH;
        var tx = tc.getContext('2d');
        tx.fillStyle = color; tx.fillRect(0, 0, CW, CH);
        tx.globalCompositeOperation = 'destination-in'; tx.drawImage(mask, 0, 0, CW, CH);
        ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(tc, 0, 0); ctx.globalCompositeOperation = 'source-over';
      });
    });
  }
  function repaintMock() { if (mockCanvasEl) paintMockCanvas(mockCanvasEl, S.view, S.color); }

  // ---- 툴 카드(이미지/텍스트 추가) -------------------------------------------
  function toolsCard() {
    var card = el('div', { class: 'dz-card' });
    card.appendChild(el('div', { class: 'dz-card__t' }, '추가하기'));
    var tools = el('div', { class: 'dz-tools' });

    var imgIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5L5 20"/></svg>';
    var txtIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="1.8"><path d="M4 6V4h16v2"/><path d="M12 4v16"/><path d="M9 20h6"/></svg>';

    var imgTool = el('button', { class: 'dz-tool', type: 'button' }, el('span', { html: imgIcon }), '이미지 업로드');
    imgTool.addEventListener('click', pickImage);
    var txtTool = el('button', { class: 'dz-tool', type: 'button' }, el('span', { html: txtIcon }), '텍스트 추가');
    txtTool.addEventListener('click', addText);

    tools.append(imgTool, txtTool);
    card.appendChild(tools);
    return card;
  }

  // ---- 옵션 카드(상품/색/사이즈/수량) ----------------------------------------
  function optionsCard() {
    var card = el('div', { class: 'dz-card' });
    card.appendChild(el('div', { class: 'dz-card__t' }, '상품 옵션'));

    // 상품 종류(카테고리 내 변형: 후드↔맨투맨, 텀블러↔머그, 키링 모양 등) — 바꾸면 목업/면이 달라짐.
    var prodItems = catDef(S.slug).items;
    var prodSel = el('select', { class: 'dz-select' });
    prodItems.forEach(function (it, idx) {
      var o = el('option', { value: String(idx) }, it.name); if (idx === S.itemIdx) o.selected = true; prodSel.appendChild(o);
    });
    prodSel.addEventListener('change', function () {
      var idx = parseInt(prodSel.value, 10) || 0;
      if (idx === S.itemIdx) return;
      if (hasArt() && !window.confirm('상품을 바꾸면 현재 디자인이 초기화됩니다. 계속할까요?')) { prodSel.value = String(S.itemIdx); return; }
      switchItem(idx);
    });
    if (prodItems.length > 1) card.appendChild(field('상품', prodSel));

    // 색상 — 색이 필요한 제품(tintable)만 노출 + 실시간 색 변경. 그 외(키링·스티커 등)는 색 옵션 숨김.
    if (tintable()) {
      var sw = el('div', { class: 'dz-swatches' });
      COLORS.forEach(function (c) {
        var d = el('div', { class: 'dz-sw' + (c.hex === S.color ? ' is-on' : ''), title: c.name, style: 'background:' + c.hex });
        d.addEventListener('click', function () {
          S.color = c.hex;
          sw.querySelectorAll('.dz-sw').forEach(function (n) { n.classList.remove('is-on'); });
          d.classList.add('is-on');
          repaintMock(); // 실시간 옷/제품 색 반영
        });
        sw.appendChild(d);
      });
      card.appendChild(field('색상', sw));
    }

    // 사이즈(의류만) + 수량
    var row = el('div', { class: 'dz-row' });
    if (isApparel()) {
      var sizeSel = el('select', { class: 'dz-select' });
      SIZES.forEach(function (s) { var o = el('option', { value: s }, s); if (s === S.size) o.selected = true; sizeSel.appendChild(o); });
      sizeSel.addEventListener('change', function () { S.size = sizeSel.value; });
      row.appendChild(fieldInline('사이즈', sizeSel));
    }
    var qtyIn = el('input', { class: 'dz-input', type: 'number', min: '1', max: '999', value: String(S.qty) });
    qtyIn.addEventListener('change', function () { S.qty = Math.max(1, Math.min(999, parseInt(qtyIn.value, 10) || 1)); qtyIn.value = String(S.qty); });
    row.appendChild(fieldInline('수량', qtyIn));
    card.appendChild(row);

    return card;
  }
  function field(label, control) {
    return el('div', { class: 'dz-field' }, el('label', { class: 'dz-field__l' }, label), control);
  }
  function fieldInline(label, control) {
    return el('div', {}, el('label', { class: 'dz-field__l' }, label), control);
  }

  // ---- 레이어 렌더(캔버스 위 DOM) --------------------------------------------
  function renderLayers() {
    if (!layersWrap) return;
    layersWrap.replaceChildren();
    cvLayers().forEach(function (L) {
      var node = el('div', { class: 'dz-layer', style: layerStyle(L) });
      node.dataset.id = L.id;
      if (L.type === 'image') {
        node.appendChild(el('img', { src: L.src, alt: '' }));
      } else {
        var tx = el('div', { class: 'dz-layer__txt' });
        tx.style.color = L.color || '#222';
        tx.style.fontWeight = L.bold ? '800' : '500';
        tx.style.fontSize = (L.font * canvasPxH() / 100) + 'px';
        tx.textContent = L.text || '';
        node.appendChild(tx);
      }
      node.addEventListener('pointerdown', function (e) { startDrag(e, L); });
      layersWrap.appendChild(node);
    });
    renderSel();
  }
  // 선택 박스 + 핸들(마스크 밖 오버레이). 디자인 내용(layersWrap)과 분리해 가장자리에서도 안 잘림.
  function renderSel() {
    if (!selWrap) return;
    selWrap.replaceChildren();
    var L = selLayer();
    if (!L) return;
    var box = el('div', { class: 'dz-sel', style: layerStyle(L) });
    box.dataset.id = L.id;
    box.addEventListener('pointerdown', function (e) { startDrag(e, L); });
    var del = el('div', { class: 'dz-h dz-h--del', title: '삭제' }, '×');
    del.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); removeLayer(L.id); });
    var se = el('div', { class: 'dz-h dz-h--se', title: '크기 조절' });
    se.addEventListener('pointerdown', function (e) { startResize(e, L); });
    box.append(del, se);
    selWrap.appendChild(box);
  }
  // 드래그/리사이즈 중 내용 노드 + 선택 박스를 함께 이동.
  function posNodes(L) {
    var sel = '[data-id="' + L.id + '"]';
    [layersWrap && layersWrap.querySelector(sel), selWrap && selWrap.querySelector(sel)].forEach(function (n) {
      if (!n) return;
      n.style.left = (L.x - L.w / 2) + '%'; n.style.top = (L.y - L.h / 2) + '%';
      n.style.width = L.w + '%'; n.style.height = L.h + '%';
    });
    if (L.type === 'text') {
      var cn = layersWrap && layersWrap.querySelector(sel);
      var t = cn && cn.querySelector('.dz-layer__txt');
      if (t) t.style.fontSize = (L.font * canvasPxH() / 100) + 'px';
    }
  }
  function layerStyle(L) {
    // 중심(x,y) 기준 배치. 이미지 w,h%; 텍스트는 w% 박스 + auto height.
    if (L.type === 'image') {
      return 'left:' + (L.x - L.w / 2) + '%;top:' + (L.y - L.h / 2) + '%;width:' + L.w + '%;height:' + L.h + '%;';
    }
    return 'left:' + (L.x - L.w / 2) + '%;top:' + (L.y - L.h / 2) + '%;width:' + L.w + '%;height:' + L.h + '%;';
  }
  function canvasPxH() { return canvasEl ? canvasEl.getBoundingClientRect().height : 460; }

  // ---- 드래그 / 리사이즈 ------------------------------------------------------
  function startDrag(e, L) {
    e.preventDefault();
    if (S.sel !== L.id) { S.sel = L.id; renderLayers(); renderProps(); renderLayerList(); }
    var rect = canvasEl.getBoundingClientRect();
    var startX = e.clientX, startY = e.clientY, ox = L.x, oy = L.y;
    function move(ev) {
      var dx = (ev.clientX - startX) / rect.width * 100;
      var dy = (ev.clientY - startY) / rect.height * 100;
      L.x = clamp(ox + dx, 2, 98); L.y = clamp(oy + dy, 2, 98);
      posNodes(L);
    }
    function up() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }
  function startResize(e, L) {
    e.preventDefault(); e.stopPropagation();
    var rect = canvasEl.getBoundingClientRect();
    var startX = e.clientX, sw = L.w, sh = L.h, sf = L.font || 0;
    function move(ev) {
      var dxp = (ev.clientX - startX) / rect.width * 100;
      var nw = clamp(sw + dxp, 6, 96);
      var scale = nw / sw;
      L.w = nw;
      if (L.type === 'image') { L.h = clamp(sh * scale, 4, 140); }
      else { L.font = Math.max(2, sf * scale); L.h = textBoxH(L); }
      posNodes(L);
    }
    function up() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); renderProps(); }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---- 이미지 추가 ------------------------------------------------------------
  function pickImage() {
    var input = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      readImageFile(f).then(function (res) {
        var pr = printRect();
        var natAR = res.h / res.w; // height/width
        var w = Math.min(pr.w * 0.8, 40);
        // h% from aspect: h_px/w_px = natAR → h% = w% * (canvasW/canvasH) * natAR
        var hPct = w * canvasAspect() * natAR;
        var L = { id: 'L' + (++S.seq), type: 'image', src: res.url, x: pr.l + pr.w / 2, y: pr.t + pr.h / 2, w: w, h: hPct, ar: natAR };
        var im = new Image(); im.src = res.url; imgCache[L.id] = im;
        cvLayers().push(L); S.sel = L.id; render();
      }).catch(function () { toast('이미지를 읽지 못했습니다. 다른 이미지를 시도해 주세요.'); });
    });
    document.body.appendChild(input); input.click();
    setTimeout(function () { input.remove(); }, 1000);
  }
  // 모바일 호환 이미지 디코드(createObjectURL+canvas, 최대 1600px) → dataURL
  function readImageFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || (file.type && file.type.indexOf('image') !== 0 && !/\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(file.name || ''))) {
        reject(new Error('not image')); return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var max = 1600, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          var scale = Math.min(1, max / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
          var ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, cw, ch);
          var isPng = /png/i.test(file.type) || /\.png$/i.test(file.name || '');
          var out = isPng ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.92);
          URL.revokeObjectURL(url);
          resolve({ url: out, w: cw, h: ch });
        } catch (err) { URL.revokeObjectURL(url); fallback(); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); fallback(); };
      img.src = url;
      function fallback() {
        var fr = new FileReader();
        fr.onload = function () {
          var im2 = new Image();
          im2.onload = function () { resolve({ url: fr.result, w: im2.naturalWidth || 800, h: im2.naturalHeight || 800 }); };
          im2.onerror = function () { reject(new Error('decode')); };
          im2.src = fr.result;
        };
        fr.onerror = function () { reject(new Error('read')); };
        fr.readAsDataURL(file);
      }
    });
  }

  // ---- 텍스트 추가 ------------------------------------------------------------
  function addText() {
    var t = prompt('넣을 문구를 입력하세요', '두띵');
    if (t == null) return;
    t = t.trim(); if (!t) return;
    var pr = printRect();
    var L = { id: 'L' + (++S.seq), type: 'text', text: t.slice(0, 60), x: pr.l + pr.w / 2, y: pr.t + pr.h / 2, w: Math.min(pr.w, 50), font: 7, color: '#222222', bold: true, h: 0 };
    L.h = textBoxH(L);
    cvLayers().push(L); S.sel = L.id; render();
  }
  function textBoxH(L) {
    // 대략적 박스 높이(%): 줄 수 * 폰트 * 1.3
    var lines = String(L.text || '').split('\n').length;
    return Math.max(L.font * 1.4, L.font * 1.3 * lines);
  }

  // ---- 레이어 삭제/순서 -------------------------------------------------------
  function removeLayer(id) {
    var ls = cvLayers(); var i = ls.findIndex(function (x) { return x.id === id; });
    if (i >= 0) ls.splice(i, 1);
    delete imgCache[id];
    if (S.sel === id) S.sel = null;
    render();
  }
  function moveLayer(id, dir) {
    var ls = cvLayers(); var i = ls.findIndex(function (x) { return x.id === id; });
    var j = i + dir; if (i < 0 || j < 0 || j >= ls.length) return;
    var tmp = ls[i]; ls[i] = ls[j]; ls[j] = tmp; render();
  }

  // ---- 속성 패널(선택 텍스트) -------------------------------------------------
  function renderProps() {
    if (!propsBox) return;
    propsBox.replaceChildren();
    var L = selLayer();
    if (!L || L.type !== 'text') return;
    var card = el('div', { class: 'dz-card' });
    card.appendChild(el('div', { class: 'dz-card__t' }, '텍스트'));

    var ta = el('input', { class: 'dz-input', type: 'text', maxlength: '60', value: L.text });
    ta.addEventListener('input', function () { L.text = ta.value; L.h = textBoxH(L); renderLayers(); renderLayerList(); });
    card.appendChild(field('내용', ta));

    var row = el('div', { class: 'dz-row' });
    // 색상
    var col = el('input', { class: 'dz-input', type: 'color', value: toHex(L.color), style: 'height:40px;padding:4px' });
    col.addEventListener('input', function () { L.color = col.value; renderLayers(); });
    row.appendChild(fieldInline('색상', col));
    // 굵게
    var boldBtn = el('button', { class: 'wz-btn wz-btn--' + (L.bold ? 'primary' : 'outline'), type: 'button', style: 'width:100%;height:40px' }, '굵게');
    boldBtn.addEventListener('click', function () { L.bold = !L.bold; renderLayers(); renderProps(); });
    row.appendChild(fieldInline('스타일', boldBtn));
    card.appendChild(row);
    propsBox.appendChild(card);
  }
  function toHex(c) {
    if (!c) return '#222222';
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    return '#222222';
  }

  // ---- 레이어 목록 패널 -------------------------------------------------------
  function renderLayerList() {
    if (!layerListBox) return;
    layerListBox.replaceChildren();
    layerListBox.appendChild(el('div', { class: 'dz-card__t' }, '레이어 (' + viewLabel(S.view) + ')'));
    var ls = cvLayers();
    var list = el('div', { class: 'dz-layers' });
    if (!ls.length) { list.appendChild(el('div', { class: 'dz-litem__empty' }, '아직 레이어가 없어요')); }
    // 위가 앞면(맨 위 레이어) → 역순 표시
    ls.slice().reverse().forEach(function (L) {
      var item = el('div', { class: 'dz-litem' + (L.id === S.sel ? ' is-sel' : '') });
      var th = el('div', { class: 'dz-litem__th' });
      if (L.type === 'image') th.appendChild(el('img', { src: L.src, alt: '' }));
      else th.textContent = 'T';
      var name = el('div', { class: 'dz-litem__n' }, L.type === 'image' ? '이미지' : (L.text || '텍스트'));
      var up = el('button', { class: 'dz-litem__b', title: '앞으로', type: 'button' }, '▲');
      up.addEventListener('click', function (e) { e.stopPropagation(); moveLayer(L.id, 1); });
      var down = el('button', { class: 'dz-litem__b', title: '뒤로', type: 'button' }, '▼');
      down.addEventListener('click', function (e) { e.stopPropagation(); moveLayer(L.id, -1); });
      var del = el('button', { class: 'dz-litem__b', title: '삭제', type: 'button' }, '🗑');
      del.addEventListener('click', function (e) { e.stopPropagation(); removeLayer(L.id); });
      item.addEventListener('click', function () { S.sel = L.id; renderLayers(); renderProps(); renderLayerList(); });
      item.append(th, name, up, down, del);
      list.appendChild(item);
    });
    layerListBox.appendChild(list);
  }

  // ---- 합성(목업 + 옷색 + 레이어 → canvas) -----------------------------------
  // view 지정, px 가로 크기. 화면(목업+tint+클리핑)과 동일하게 그려 dataURL 반환.
  function composite(view, pxW) {
    return new Promise(function (resolve) {
      var CW = pxW || 1000, CH = Math.round(CW / canvasAspect()); // 1:1
      var canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, CW, CH);
      var msrc = maskSrc(view);
      var tinted = tintable() && !isWhite(S.color);

      drawBase(function () { loadMask(function (maskImg) { tintThenLayers(maskImg); }); });

      // 베이스 목업(PNG 우선, 없으면 SVG 폴백)
      function drawBase(cb) {
        var base = mockupSrc(view);
        if (!base) { drawSvg(cb); return; }
        var png = new Image();
        png.onload = function () { ctx.drawImage(png, 0, 0, CW, CH); cb(); };
        png.onerror = function () { drawSvg(cb); };
        png.src = base;
      }
      function drawSvg(cb) {
        var svgStr = (function () { var keep = S.view; S.view = view; var s = mockSvg(); S.view = keep; return s; })();
        var m = new Image();
        m.onload = function () { ctx.drawImage(m, 0, 0, CW, CH); cb(); };
        m.onerror = function () { cb(); };
        m.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
      }
      function loadMask(cb) {
        if (!msrc) { cb(null); return; }
        var mi = new Image(); mi.onload = function () { cb(mi); }; mi.onerror = function () { cb(null); }; mi.src = msrc;
      }
      // 옷 색(의류·흰색 아님): 색 채운 뒤 마스크로 옷 영역만 남기고 multiply 로 베이스에 입힘.
      function tintThenLayers(maskImg) {
        if (tinted && maskImg) {
          var tc = document.createElement('canvas'); tc.width = CW; tc.height = CH;
          var tx = tc.getContext('2d');
          tx.fillStyle = S.color; tx.fillRect(0, 0, CW, CH);
          tx.globalCompositeOperation = 'destination-in'; tx.drawImage(maskImg, 0, 0, CW, CH);
          ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(tc, 0, 0); ctx.globalCompositeOperation = 'source-over';
        }
        var ls = S.views[view] || [];
        var imgs = ls.filter(function (L) { return L.type === 'image'; });
        var pending = imgs.length;
        if (!pending) { paint(maskImg, ls); return; }
        imgs.forEach(function (L) {
          var im = imgCache[L.id];
          if (im && im.complete && im.naturalWidth) { if (--pending === 0) paint(maskImg, ls); return; }
          var n = new Image();
          n.onload = function () { imgCache[L.id] = n; if (--pending === 0) paint(maskImg, ls); };
          n.onerror = function () { if (--pending === 0) paint(maskImg, ls); };
          n.src = L.src;
        });
      }
      // 레이어는 별도 캔버스에 그린 뒤 마스크로 클리핑 → 베이스에 합성.
      function paint(maskImg, ls) {
        var lc = document.createElement('canvas'); lc.width = CW; lc.height = CH;
        var lx = lc.getContext('2d');
        ls.forEach(function (L) {
          if (L.type === 'image') {
            var im2 = imgCache[L.id];
            if (!im2 || !im2.naturalWidth) return;
            var w = L.w / 100 * CW, h = L.h / 100 * CH;
            var x = (L.x / 100 * CW) - w / 2, y = (L.y / 100 * CH) - h / 2;
            try { lx.drawImage(im2, x, y, w, h); } catch (_) {}
          } else {
            var fs = L.font / 100 * CH;
            lx.font = (L.bold ? '800 ' : '500 ') + fs + 'px Pretendard, -apple-system, sans-serif';
            lx.fillStyle = L.color || '#222';
            lx.textAlign = 'center'; lx.textBaseline = 'middle';
            var lines = String(L.text || '').split('\n');
            var cx = L.x / 100 * CW, cy = L.y / 100 * CH;
            var lh = fs * 1.2;
            var startY = cy - (lines.length - 1) * lh / 2;
            lines.forEach(function (ln, idx) { lx.fillText(ln, cx, startY + idx * lh); });
          }
        });
        if (maskImg) { lx.globalCompositeOperation = 'destination-in'; lx.drawImage(maskImg, 0, 0, CW, CH); }
        ctx.drawImage(lc, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      }
    });
  }

  // 파일명 안전화(괄호·슬래시 등 파일시스템 위험문자 제거)
  function safeName(s) { return (String(s == null ? '' : s).replace(/[\\/:*?"<>|()]+/g, '').trim().slice(0, 60)) || 'design'; }

  // ---- 다운로드 ---------------------------------------------------------------
  function downloadDesign() {
    composite(S.view, 1200).then(function (url) {
      var a = el('a', { href: url, download: '두띵-디자인-' + safeName(S.title) + '-' + safeName(viewLabel(S.view)) + '.png' });
      document.body.appendChild(a); a.click(); a.remove();
      toast('이미지를 다운로드했어요');
    });
  }

  // ---- 저장 / 불러오기 --------------------------------------------------------
  function serialize() {
    return { product: S.product, itemIdx: S.itemIdx, color: S.color, size: S.size, qty: S.qty, views: S.views, version: 2 };
  }
  function saveDesign() {
    var btnEl = document.querySelector('.dz-top .wz-btn--primary');
    if (btnEl) btnEl.disabled = true;
    composite(primaryView(), 480).then(function (preview) {
      var body = { category: S.slug, product: S.product, title: S.title, design: serialize(), preview: preview };
      var p = S.designId
        ? window.api.patch('/me/designs/' + S.designId, body)
        : window.api.post('/me/designs', body);
      return p.then(function (res) {
        if (res && res.id) S.designId = res.id;
        toast('디자인을 저장했어요. 프로필에서 이어서 편집할 수 있어요.');
      });
    }).catch(function (err) {
      if (err && err.status === 401) { location.href = '/login.html'; return; }
      toast('저장에 실패했어요: ' + ((err && err.message) || '오류'));
    }).finally(function () { if (btnEl) btnEl.disabled = false; });
  }

  function openLoadModal() {
    var overlay = el('div', { class: 'dz-modal' });
    var box = el('div', { class: 'dz-modal__box' });
    box.appendChild(el('div', { class: 'dz-modal__t' }, '내 디자인 불러오기'));
    box.appendChild(el('div', { class: 'dz-modal__s' }, '저장한 디자인을 선택하면 이어서 편집할 수 있어요.'));
    var listWrap = el('div', { class: 'dz-saved' });
    box.appendChild(el('div', { class: 'dz-status' }, el('span', { class: 'dz-spin' }), '불러오는 중…'));
    overlay.appendChild(box);
    overlay.addEventListener('pointerdown', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    window.api.get('/me/designs').then(function (res) {
      box.replaceChildren(
        el('div', { class: 'dz-modal__t' }, '내 디자인 불러오기'),
        el('div', { class: 'dz-modal__s' }, '저장한 디자인을 선택하면 이어서 편집할 수 있어요.'),
      );
      var items = (res && res.items) || [];
      if (!items.length) {
        box.appendChild(el('div', { class: 'dz-status' }, '아직 저장한 디자인이 없어요.'));
      } else {
        items.forEach(function (it) {
          var card = el('div', { class: 'dz-saved__item' });
          card.appendChild(el('img', { class: 'dz-saved__th', src: it.preview || '/assets/placeholder-project.png', alt: '' }));
          card.appendChild(el('div', { class: 'dz-saved__meta' },
            el('div', { class: 'dz-saved__n' }, it.title || '내 디자인'),
            el('div', { class: 'dz-saved__d' }, fmtDate(it.updatedAt)),
          ));
          var del = el('button', { class: 'dz-saved__del', title: '삭제', type: 'button' }, '×');
          del.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!confirm('이 디자인을 삭제할까요?')) return;
            window.api.del('/me/designs/' + it.id).then(function () { card.remove(); toast('삭제했어요'); });
          });
          card.appendChild(del);
          card.addEventListener('click', function () { loadDesign(it.id); overlay.remove(); });
          listWrap.appendChild(card);
        });
        box.appendChild(listWrap);
      }
      box.appendChild(el('div', { class: 'dz-modal__foot' }, btn('닫기', 'outline', function () { overlay.remove(); })));
    }).catch(function (err) {
      if (err && err.status === 401) { location.href = '/login.html'; return; }
      box.replaceChildren(el('div', { class: 'dz-status' }, '목록을 불러오지 못했어요.'),
        el('div', { class: 'dz-modal__foot' }, btn('닫기', 'outline', function () { overlay.remove(); })));
    });
  }
  function loadDesign(id) {
    window.api.get('/me/designs/' + id).then(function (d) {
      var dz = d.design || {};
      S.designId = d.id;
      S.title = d.title || '내 디자인';
      S.slug = (d.category && PRODUCTS[d.category]) ? d.category : (S.slug && PRODUCTS[S.slug] ? S.slug : 'etc');
      S.catObj = window.dtCategory(S.slug);
      var defItems = catDef(S.slug).items;
      // itemIdx 복원(없으면 상품명 매칭, 그래도 없으면 0)
      S.itemIdx = (typeof dz.itemIdx === 'number' && dz.itemIdx >= 0 && dz.itemIdx < defItems.length)
        ? dz.itemIdx
        : Math.max(0, defItems.findIndex(function (it) { return it.name === d.product; }));
      S.product = curItem().name;
      S.color = dz.color || '#ffffff'; S.size = dz.size || 'M'; S.qty = dz.qty || 1;
      S.views = dz.views || {};
      S.view = views()[0];
      S.sel = null;
      S.aiDesign = d.aiImage || null; // 이전에 AI 디자인을 만들었으면 가상피팅 잠금 해제 상태로 복원
      S.aiFitting = null;
      // 이미지 캐시 재생성 + seq 보정
      imgCache = {}; var maxSeq = 0;
      Object.keys(S.views).forEach(function (v) {
        (S.views[v] || []).forEach(function (L) {
          var n = parseInt(String(L.id).replace(/\D/g, ''), 10); if (n > maxSeq) maxSeq = n;
          if (L.type === 'image') { var im = new Image(); im.src = L.src; imgCache[L.id] = im; }
        });
      });
      S.seq = maxSeq;
      render();
      toast('디자인을 불러왔어요');
    }).catch(function (err) {
      if (err && err.status === 401) { location.href = '/login.html'; return; }
      // 로딩 중 화면에서 실패 → 에러 안내(무한 스피너 방지)
      if (root) root.replaceChildren(el('div', { class: 'dz-wrap' },
        el('div', { class: 'dz-status' }, '디자인을 불러오지 못했어요: ' + ((err && err.message) || '오류')),
        el('div', { class: 'dz-modal__foot', style: 'justify-content:center' },
          btn('새 디자인 시작', 'primary', function () { location.href = '/design.html'; }))));
      toast('불러오지 못했어요');
    });
  }
  function fmtDate(iso) {
    var d = new Date(iso); if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.';
  }

  // ---- 완성 → AI 의상/가상피팅 ------------------------------------------------
  function hasArt() {
    return Object.keys(S.views).some(function (v) { return (S.views[v] || []).length > 0; });
  }

  // 완성 영역: [완성하기](저장) + 아래 좌/우 [AI 디자인 보기] [가상피팅 보기].
  //  가상피팅은 AI 디자인 보기로 결과(S.aiDesign)가 나오기 전까지 잠금.
  var dzFitBtn = null, dzHint = null;
  var LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var FIT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="6" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3"/></svg>';
  var DESIGN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 19l7-7a2.5 2.5 0 0 0-3.5-3.5L8 16l-1 4 4-1z"/><path d="M5 21h6"/></svg>';
  function completeBlock() {
    var apparel = isApparel();
    var wrap = el('div', { class: 'dz-finishwrap' });
    wrap.appendChild(btn('완성하기 — 디자인 저장', 'primary', finishDesign, 'dz-complete'));

    var row = el('div', { class: 'dz-finish' });
    var designBtn = el('button', { class: 'wz-btn wz-btn--outline dz-finish__btn', type: 'button' },
      el('span', { class: 'dz-finish__ic', html: DESIGN_SVG }), 'AI 디자인 보기');
    designBtn.addEventListener('click', runAiDesign);

    dzFitBtn = el('button', { class: 'wz-btn wz-btn--outline dz-finish__btn', type: 'button' },
      el('span', { class: 'dz-finish__ic' }), apparel ? '가상피팅 보기' : '전시 이미지 보기');
    dzFitBtn.addEventListener('click', runAiFitting);
    row.append(designBtn, dzFitBtn);
    wrap.appendChild(row);
    dzHint = el('div', { class: 'dz-hint dz-finish__hint' });
    wrap.appendChild(dzHint);
    setFitLock();
    return wrap;
  }
  function setFitLock() {
    if (!dzFitBtn) return;
    var locked = !S.aiDesign;
    var apparel = isApparel();
    dzFitBtn.disabled = locked;
    dzFitBtn.classList.toggle('is-locked', locked);
    dzFitBtn.title = locked ? '먼저 ‘AI 디자인 보기’를 해주세요' : '';
    var ic = dzFitBtn.querySelector('.dz-finish__ic');
    if (ic) ic.innerHTML = locked ? LOCK_SVG : FIT_SVG;
    if (dzHint) dzHint.textContent = locked
      ? '‘AI 디자인 보기’로 ' + (apparel ? '의상' : '제품') + ' 이미지를 먼저 생성하면 ' + (apparel ? '가상피팅' : '전시 이미지') + '을 볼 수 있어요.'
      : '이제 ' + (apparel ? '가상피팅' : '전시 이미지') + '을 생성할 수 있어요.';
  }

  // 완성하기 — 디자인을 프로필에 저장(이어서 편집/불러오기 가능).
  function finishDesign() {
    if (!hasArt()) { toast('이미지나 텍스트를 먼저 추가해 주세요'); return; }
    var b = document.querySelector('.dz-complete'); if (b) b.disabled = true;
    composite(primaryView(), 520).then(function (preview) {
      var body = { category: S.slug, product: S.product, title: S.title, design: serialize(), preview: preview };
      var p = S.designId ? window.api.patch('/me/designs/' + S.designId, body) : window.api.post('/me/designs', body);
      return p.then(function (r) { if (r && r.id) S.designId = r.id; toast('완성! 프로필에 저장했어요. 마이페이지 > 내 디자인에서 이어서 편집할 수 있어요.'); });
    }).catch(function (err) {
      if (err && err.status === 401) { location.href = '/login.html'; return; }
      toast('저장에 실패했어요: ' + ((err && err.message) || '오류'));
    }).finally(function () { var b2 = document.querySelector('.dz-complete'); if (b2) b2.disabled = false; });
  }

  // 공통 AI 진행 모달.
  function aiModal(title, sub) {
    var overlay = el('div', { class: 'dz-modal' });
    var box = el('div', { class: 'dz-modal__box' });
    box.appendChild(el('div', { class: 'dz-modal__t' }, title));
    if (sub) box.appendChild(el('div', { class: 'dz-modal__s' }, sub));
    box.appendChild(el('div', { class: 'dz-status' }, el('span', { class: 'dz-spin' }), 'AI가 이미지를 생성하고 있어요. 잠시만 기다려 주세요…'));
    overlay.appendChild(box);
    overlay.addEventListener('pointerdown', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    return { overlay: overlay, box: box };
  }
  function aiError(box, overlay, err) {
    if (err && err.status === 401) { location.href = '/login.html'; return; }
    var msg = (err && (err.status === 404 || err.status === 503))
      ? 'AI 이미지 생성이 아직 연결되지 않았어요. 디자인은 저장/다운로드할 수 있어요.'
      : 'AI 생성에 실패했어요: ' + ((err && err.message) || '오류');
    box.replaceChildren(
      el('div', { class: 'dz-modal__t' }, '안내'),
      el('div', { class: 'dz-status' }, msg),
      el('div', { class: 'dz-modal__foot' },
        btn('디자인 다운로드', 'outline', function () { downloadDesign(); }),
        btn('닫기', 'primary', function () { overlay.remove(); }),
      ),
    );
  }

  // 왼쪽: AI 디자인 보기 — 합성 디자인 → /ai/blueprint(AI 의상/제품 이미지). 성공 시 가상피팅 잠금 해제.
  function runAiDesign() {
    if (!hasArt()) { toast('이미지나 텍스트를 먼저 추가해 주세요'); return; }
    var apparel = isApparel();
    var m = aiModal('AI 디자인 생성', '디자인을 실제 ' + (apparel ? '의상' : (S.product || '굿즈')) + ' 이미지로 만들어요.');
    composite(primaryView(), 1000).then(function (designUrl) {
      // 저장도 겸함(완성본 보존)
      var saveBody = { category: S.slug, product: S.product, title: S.title, design: serialize(), preview: designUrl };
      (S.designId ? window.api.patch('/me/designs/' + S.designId, saveBody) : window.api.post('/me/designs', saveBody))
        .then(function (r) { if (r && r.id) S.designId = r.id; }).catch(function () {});
      return window.api.post('/ai/blueprint', { imageDataUrls: [designUrl], category: S.slug });
    }).then(function (res) {
      var url = res && (res.blueprintDataUrl || res.imageDataUrl || res.url);
      if (!url) throw new Error('NO_RESULT');
      S.aiDesign = url; setFitLock();
      if (S.designId) window.api.patch('/me/designs/' + S.designId, { aiImage: url }).catch(function () {});
      showResult(m.box, m.overlay, url, 'AI 디자인');
    }).catch(function (err) { aiError(m.box, m.overlay, err); });
  }

  // 오른쪽: 가상피팅 보기 — AI 디자인 결과를 /ai/try-on(모델 착용/제품 전시). AI 디자인 전엔 잠금.
  function runAiFitting() {
    if (!S.aiDesign) { toast('먼저 ‘AI 디자인 보기’를 해주세요'); return; }
    var apparel = isApparel();
    var m = aiModal(apparel ? '가상피팅 생성' : '전시 이미지 생성',
      apparel ? 'AI 디자인을 모델이 착용한 모습을 생성해요.' : 'AI 디자인을 ' + (S.product || '굿즈') + ' 전시 사진으로 생성해요.');
    var aiBody = { imageDataUrls: [S.aiDesign], background: 'studio', category: S.slug };
    if (apparel) aiBody.modelType = 'female';
    window.api.post('/ai/try-on', aiBody).then(function (res) {
      var url = res && (res.tryOnDataUrl || res.imageDataUrl || res.url);
      if (!url) throw new Error('NO_RESULT');
      S.aiFitting = url;
      showResult(m.box, m.overlay, url, apparel ? '가상피팅' : '전시 이미지');
    }).catch(function (err) { aiError(m.box, m.overlay, err); });
  }

  function showResult(box, overlay, url, label) {
    var foot = el('div', { class: 'dz-modal__foot' },
      btn('이미지 다운로드', 'outline', function () {
        var a = el('a', { href: url, download: '두띵-' + safeName(S.title) + '-' + safeName(label || 'AI') + '.png' });
        document.body.appendChild(a); a.click(); a.remove();
      }),
      btn('이 디자인으로 펀딩 만들기', 'primary', function () {
        try { sessionStorage.setItem('dt_design_handoff', JSON.stringify({ image: url, category: S.slug, product: S.product, title: S.title })); } catch (_) {}
        location.href = '/fund-create.html?category=' + encodeURIComponent(S.slug);
      }),
    );
    box.replaceChildren(
      el('div', { class: 'dz-modal__t' }, (label || 'AI') + ' 완성! 🎉'),
      el('div', { class: 'dz-modal__s' }, 'AI가 생성한 결과예요. 다운로드하거나 펀딩 대표 이미지로 사용할 수 있어요.'),
      el('img', { class: 'dz-result__img', src: url, alt: label || 'AI 결과' }),
      foot,
    );
  }

  // ---- 초기화 -----------------------------------------------------------------
  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }
  async function init() {
    var me = (typeof W.fetchMe === 'function') ? await W.fetchMe() : null;
    if (!me) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search); return; }

    root = document.getElementById('design-root');

    var loadId = qs('id');
    if (loadId) { // 프로필에서 이어서 편집 — 로딩 표시 후, loadDesign 성공 시 전체 렌더(중간 셸 깜빡임 방지)
      S.slug = 'etc'; // loadDesign 폴백용 안전 기본값(d.category 가 유효하면 덮어씀)
      root.replaceChildren(el('div', { class: 'dz-wrap' },
        el('div', { class: 'dz-status' }, el('span', { class: 'dz-spin' }), '디자인을 불러오는 중…')));
      loadDesign(loadId);
      return;
    }

    // ?category= 는 slug(jacket..) 또는 라벨(반팔티..) 둘 다 허용 → slug 로 정규화.
    var q = qs('category') || 'tshirt';
    var norm = window.dtCategory(q) ? window.dtCategory(q).slug : q;
    S.slug = PRODUCTS[norm] ? norm : 'tshirt';
    S.catObj = window.dtCategory(S.slug);
    S.itemIdx = 0;
    S.product = curItem().name;
    S.color = '#ffffff';
    S.view = views()[0];
    S.views = {}; views().forEach(function (v) { S.views[v] = []; });
    S.title = (S.catObj ? S.catObj.label : '내') + ' 디자인';
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
