/**
 * 디자인하기 에디터 — 마플 스타일 상품 커스터마이즈.
 *
 *  - 카테고리(쿼리 ?category=slug)별 상품 목업(의류=과잠/후드/반팔 실루엣, 굿즈=제품 카드).
 *  - 레이어: 이미지 업로드 + 텍스트. 캔버스 위에서 드래그/리사이즈/삭제, 레이어 패널로 순서/선택.
 *  - 옵션: 상품 종류 · 색상 · 사이즈 · 수량.
 *  - 면 전환: 의류는 앞면/뒷면(각 면 독립 레이어).
 *  - 저장/불러오기: /api/me/designs (개인 프로필) — 언제든 이어서 편집.
 *  - 다운로드: 목업+레이어 합성 PNG.
 *  - 완성: 합성 이미지를 /api/ai/try-on 으로 보내 의상 사진/가상피팅 생성(AI 미연결 시 안내).
 *
 *  좌표계: 모든 레이어 위치/크기는 캔버스 대비 % (반응형). 폰트 크기는 캔버스 높이 대비 %.
 *  XSS: 사용자 텍스트는 textContent 로만 출력.
 */
(function () {
  var W = window.WZ || {};
  var el = W.el || function (t) { return document.createElement(t); };

  // ---- 카테고리별 상품 정의 ---------------------------------------------------
  // family: 목업 실루엣 종류. 의류는 tee/hoodie/jacket, 그 외는 goods 카드.
  var PRODUCTS = {
    jacket:    { family: 'jacket', items: ['스타디움 과잠', '바시티 과잠'] },
    hoodie:    { family: 'hoodie', items: ['후드티', '맨투맨'] },
    tshirt:    { family: 'tee',    items: ['반팔 라운드티', '오버핏 반팔티'] },
    ecobag:    { family: 'goods',  items: ['코튼 에코백', '캔버스 에코백'] },
    keyring:   { family: 'goods',  items: ['아크릴 키링', '메탈 키링'] },
    phonecase: { family: 'goods',  items: ['하드 케이스', '젤리 케이스'] },
    sticker:   { family: 'goods',  items: ['다꾸 스티커', '홀로그램 스티커'] },
    badge:     { family: 'goods',  items: ['원형 뱃지', '자석 뱃지'] },
    tumbler:   { family: 'goods',  items: ['보온 텀블러', '세라믹 머그'] },
    fabric:    { family: 'goods',  items: ['미니 담요', '쿠션 커버'] },
    doll:      { family: 'goods',  items: ['봉제 인형', '키링 인형'] },
    accessory: { family: 'goods',  items: ['목걸이', '팔찌'] },
    webapp:    { family: 'goods',  items: ['커스텀 굿즈'] },
    etc:       { family: 'goods',  items: ['커스텀 굿즈'] },
  };

  // 색상 팔레트(상품 본체 색)
  var COLORS = [
    { name: '화이트', hex: '#ffffff' }, { name: '블랙', hex: '#2b2b2e' },
    { name: '그레이', hex: '#b8bcc4' }, { name: '네이비', hex: '#23304f' },
    { name: '레드', hex: '#d23b3b' }, { name: '퍼플', hex: '#8B5CF6' },
    { name: '그린', hex: '#3a9a5c' }, { name: '베이지', hex: '#e7dcc6' },
  ];
  var SIZES = ['S', 'M', 'L', 'XL', '2XL'];

  // 면별 인쇄 영역(캔버스 대비 %: left/top/width/height)
  var PRINT = {
    tee:    { front: { l: 34, t: 33, w: 32, h: 36 }, back: { l: 31, t: 25, w: 38, h: 48 } },
    hoodie: { front: { l: 35, t: 30, w: 30, h: 30 }, back: { l: 31, t: 24, w: 38, h: 48 } },
    jacket: { front: { l: 34, t: 32, w: 32, h: 32 }, back: { l: 31, t: 24, w: 38, h: 48 } },
    goods:  { front: { l: 22, t: 22, w: 56, h: 56 } },
  };

  function views(family) { return family === 'goods' ? ['front'] : ['front', 'back']; }
  function viewLabel(v) { return v === 'back' ? '뒷면' : '앞면'; }

  // 카테고리별 기본 목업 이미지(사용자가 제공). 파일이 있으면 사진 목업을 쓰고, 없으면 아래 SVG 실루엣으로 자동 폴백.
  //   경로 규칙: /assets/mockups/<slug>-<view>.png   (의류=front+back, 굿즈=front)
  function mockupSrc(view) { return '/assets/mockups/' + S.slug + '-' + view + '.png'; }
  // 카테고리별 인쇄 영역 미세조정(기본은 family 기준 PRINT). 사용자가 이미지 주면 좌표만 여기서 맞추면 됨.
  var PRINT_OVERRIDE = {
    // 예) phonecase: { front: { l: 30, t: 16, w: 40, h: 66 } },
  };

  // ---- 목업 SVG ---------------------------------------------------------------
  // 공통 상의 실루엣(viewBox 0 0 500 600). 색상 채움 + 옅은 외곽선(흰 상품도 보이게).
  function topBodyPath() {
    return 'M250,72 C214,72 198,60 190,54 L122,98 L72,172 C70,178 72,184 78,188 '
      + 'L134,226 C140,230 148,228 152,222 L170,198 L170,538 C170,546 176,552 184,552 '
      + 'L316,552 C324,552 330,546 330,538 L330,198 L348,222 C352,228 360,230 366,226 '
      + 'L422,188 C428,184 430,178 428,172 L378,98 L310,54 C302,60 286,72 250,72 Z';
  }
  function svgWrap(inner) {
    return '<svg viewBox="0 0 500 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">'
      + inner + '</svg>';
  }
  function teeSvg(color, view, family) {
    var stroke = '#cfcfd6';
    var body = '<path d="' + topBodyPath() + '" fill="' + color + '" stroke="' + stroke + '" stroke-width="2.5" stroke-linejoin="round"/>';
    var extras = '';
    // 넥라인(앞면만 둥근 칼라 표현)
    if (view === 'front') {
      extras += '<path d="M210,74 C224,104 238,116 250,116 C262,116 276,104 290,74" fill="none" stroke="' + stroke + '" stroke-width="2.5"/>';
    } else {
      extras += '<path d="M206,72 C224,86 238,90 250,90 C262,90 276,86 294,72" fill="none" stroke="' + stroke + '" stroke-width="2.5"/>';
    }
    if (family === 'hoodie') {
      // 후드(목 뒤 칼라) + 캥거루 포켓 + 끈
      var hood = view === 'front'
        ? '<path d="M198,64 C214,40 286,40 302,64 C292,92 270,108 250,108 C230,108 208,92 198,64 Z" fill="' + shade(color, -0.06) + '" stroke="' + stroke + '" stroke-width="2.5"/>'
        : '<path d="M196,60 C214,30 286,30 304,60 C304,96 280,118 250,118 C220,118 196,96 196,60 Z" fill="' + shade(color, -0.06) + '" stroke="' + stroke + '" stroke-width="2.5"/>';
      extras = hood + (view === 'front'
        ? '<line x1="232" y1="108" x2="228" y2="168" stroke="' + stroke + '" stroke-width="3"/>'
          + '<line x1="268" y1="108" x2="272" y2="168" stroke="' + stroke + '" stroke-width="3"/>'
          + '<path d="M196,430 L304,430 L296,500 L204,500 Z" fill="none" stroke="' + stroke + '" stroke-width="2.5"/>'
        : '');
      body = '<path d="' + topBodyPath() + '" fill="' + color + '" stroke="' + stroke + '" stroke-width="2.5" stroke-linejoin="round"/>';
      return svgWrap(body + extras);
    }
    if (family === 'jacket') {
      // 과잠: 칼라 + 중앙 지퍼 + 소매/밑단 리브
      extras += '<line x1="250" y1="120" x2="250" y2="540" stroke="' + stroke + '" stroke-width="2.5"/>';
      extras += '<rect x="170" y="524" width="160" height="14" fill="' + shade(color, -0.05) + '" stroke="' + stroke + '" stroke-width="1.5"/>';
      if (view === 'front') {
        extras += '<path d="M214,80 L250,116 L286,80" fill="none" stroke="' + stroke + '" stroke-width="2.5"/>';
      }
    }
    return svgWrap(body + extras);
  }
  function goodsSvg(color, slug) {
    var stroke = '#cfcfd6';
    var inner = '<rect x="40" y="40" width="420" height="420" rx="44" fill="' + color + '" stroke="' + stroke + '" stroke-width="3"/>';
    // 카테고리 아이콘을 옅게 backdrop 으로(있으면). 없으면 무시.
    inner += '<image href="/assets/' + slug + '.png" x="150" y="150" width="200" height="200" opacity="0.10" preserveAspectRatio="xMidYMid meet"/>';
    return '<svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' + inner + '</svg>';
  }
  // 색 명도 조절(후드/리브 음영)
  function shade(hex, amt) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    r = Math.max(0, Math.min(255, Math.round(r + r * amt)));
    g = Math.max(0, Math.min(255, Math.round(g + g * amt)));
    b = Math.max(0, Math.min(255, Math.round(b + b * amt)));
    return '#' + [r, g, b].map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function mockSvg() {
    if (S.family === 'goods') return goodsSvg(S.color, S.slug);
    return teeSvg(S.color, S.view, S.family);
  }
  function canvasAspect() { return S.family === 'goods' ? 1 : (500 / 600); } // w/h

  // ---- 상태 -------------------------------------------------------------------
  var S = {
    slug: '', catObj: null, family: 'goods',
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
  var root, canvasEl, layersWrap, viewsWrap, propsBox, layerListBox, titleInput;

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

    canvasEl = el('div', { class: 'dz-canvas', style: 'aspect-ratio:' + (S.family === 'goods' ? '1/1' : '5/6') });
    canvasEl.appendChild(buildMockNode());
    // 인쇄 영역 가이드
    var pr = printRect();
    if (pr) {
      var guide = el('div', { class: 'dz-print', style: 'left:' + pr.l + '%;top:' + pr.t + '%;width:' + pr.w + '%;height:' + pr.h + '%' });
      guide.appendChild(el('div', { class: 'dz-print__tag' }, '인쇄 영역'));
      canvasEl.appendChild(guide);
    }
    layersWrap = el('div', { class: 'dz-canvas__layers', style: 'position:absolute;inset:0' });
    canvasEl.appendChild(layersWrap);
    if (!cvLayers().length) {
      canvasEl.appendChild(el('div', { class: 'dz-empty' }, '오른쪽에서 이미지나 텍스트를 추가해\n나만의 ' + (S.product || '굿즈') + '을(를) 디자인해 보세요'));
    }
    // 빈 곳 클릭 → 선택 해제
    canvasEl.addEventListener('pointerdown', function (e) {
      if (e.target === canvasEl || e.target.classList.contains('dz-canvas__mock') || e.target.classList.contains('dz-empty')) {
        S.sel = null; renderLayers(); renderProps(); renderLayerList();
      }
    });
    stage.appendChild(canvasEl);
    stage.appendChild(el('div', { class: 'dz-hint' }, '이미지를 끌어 위치를 옮기고, 모서리 점으로 크기를 조절하세요.'));
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
    views(S.family).forEach(function (v) {
      var b = el('button', { class: 'dz-view' + (v === S.view ? ' is-on' : ''), type: 'button' }, viewLabel(v));
      b.addEventListener('click', function () { if (S.view === v) return; S.view = v; S.sel = null; render(); });
      viewsWrap.appendChild(b);
    });
  }

  function printRect() {
    var ov = PRINT_OVERRIDE[S.slug];
    if (ov && (ov[S.view] || ov.front)) return ov[S.view] || ov.front;
    var fam = PRINT[S.family] ? S.family : 'goods';
    var p = PRINT[fam];
    return p[S.view] || p.front;
  }

  // 목업 노드: 기본은 SVG 실루엣, 사용자가 올린 PNG 가 있으면 로드 성공 시 그걸로 교체.
  function buildMockNode() {
    var mock = el('div', { class: 'dz-canvas__mock', html: mockSvg() });
    var img = new Image();
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain';
    img.onload = function () { mock.replaceChildren(img); };
    img.onerror = function () { /* PNG 없음 → SVG 유지 */ };
    img.src = mockupSrc(S.view);
    return mock;
  }

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

    // 상품 종류
    var prodSel = el('select', { class: 'dz-select' });
    var items = (PRODUCTS[S.slug] && PRODUCTS[S.slug].items) || ['커스텀 굿즈'];
    items.forEach(function (it) {
      var o = el('option', { value: it }, it); if (it === S.product) o.selected = true; prodSel.appendChild(o);
    });
    prodSel.addEventListener('change', function () { S.product = prodSel.value; });
    card.appendChild(field('상품', prodSel));

    // 색상
    var sw = el('div', { class: 'dz-swatches' });
    COLORS.forEach(function (c) {
      var d = el('div', { class: 'dz-sw' + (c.hex === S.color ? ' is-on' : ''), title: c.name, style: 'background:' + c.hex });
      d.addEventListener('click', function () { S.color = c.hex; render(); });
      sw.appendChild(d);
    });
    card.appendChild(field('색상', sw));

    // 사이즈(의류만) + 수량
    var row = el('div', { class: 'dz-row' });
    if (S.family !== 'goods') {
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
      var node = el('div', {
        class: 'dz-layer' + (L.id === S.sel ? ' is-sel' : ''),
        style: layerStyle(L),
      });
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
      if (L.id === S.sel) {
        var del = el('div', { class: 'dz-h dz-h--del', title: '삭제' }, '×');
        del.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); removeLayer(L.id); });
        var se = el('div', { class: 'dz-h dz-h--se', title: '크기 조절' });
        se.addEventListener('pointerdown', function (e) { startResize(e, L); });
        node.append(del, se);
      }
      node.addEventListener('pointerdown', function (e) { startDrag(e, L); });
      layersWrap.appendChild(node);
    });
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
    S.sel = L.id; renderLayers(); renderProps(); renderLayerList();
    var rect = canvasEl.getBoundingClientRect();
    var startX = e.clientX, startY = e.clientY, ox = L.x, oy = L.y;
    var node = layersWrap.querySelector('[data-id="' + L.id + '"]');
    function move(ev) {
      var dx = (ev.clientX - startX) / rect.width * 100;
      var dy = (ev.clientY - startY) / rect.height * 100;
      L.x = clamp(ox + dx, 2, 98); L.y = clamp(oy + dy, 2, 98);
      if (node) node.style.cssText = layerStyle(L) + (L.id === S.sel ? '' : '');
      if (node) { node.style.left = (L.x - L.w / 2) + '%'; node.style.top = (L.y - L.h / 2) + '%'; }
    }
    function up() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }
  function startResize(e, L) {
    e.preventDefault(); e.stopPropagation();
    var rect = canvasEl.getBoundingClientRect();
    var startX = e.clientX, sw = L.w, sh = L.h, sf = L.font || 0;
    var node = layersWrap.querySelector('[data-id="' + L.id + '"]');
    function move(ev) {
      var dxp = (ev.clientX - startX) / rect.width * 100;
      var nw = clamp(sw + dxp, 6, 96);
      var scale = nw / sw;
      L.w = nw;
      if (L.type === 'image') { L.h = clamp(sh * scale, 4, 140); }
      else { L.font = Math.max(2, sf * scale); L.h = textBoxH(L); }
      if (node) {
        node.style.left = (L.x - L.w / 2) + '%'; node.style.top = (L.y - L.h / 2) + '%';
        node.style.width = L.w + '%'; node.style.height = L.h + '%';
        if (L.type === 'text') { var t = node.querySelector('.dz-layer__txt'); if (t) t.style.fontSize = (L.font * canvasPxH() / 100) + 'px'; }
      }
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

  // ---- 합성(목업 + 레이어 → canvas) ------------------------------------------
  // view 지정, px 가로 크기. 이미지 로드 대기 후 dataURL 반환.
  function composite(view, pxW) {
    var prevView = S.view;
    return new Promise(function (resolve) {
      var ar = canvasAspect(); // w/h
      var CW = pxW || 1000, CH = Math.round(CW / ar);
      var canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, CW, CH);
      // 베이스 목업: 사용자 PNG 우선(같은 출처라 canvas taint 없음), 실패 시 SVG 실루엣.
      var pngImg = new Image();
      pngImg.onload = function () { ctx.drawImage(pngImg, 0, 0, CW, CH); drawLayers(); };
      pngImg.onerror = function () {
        var svgStr = (function () { var keep = S.view; S.view = view; var s = mockSvg(); S.view = keep; return s; })();
        var svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
        var mockImg = new Image();
        mockImg.onload = function () { ctx.drawImage(mockImg, 0, 0, CW, CH); drawLayers(); };
        mockImg.onerror = function () { drawLayers(); };
        mockImg.src = svgUrl;
      };
      pngImg.src = mockupSrc(view);

      function drawLayers() {
        var ls = S.views[view] || [];
        var imgs = ls.filter(function (L) { return L.type === 'image'; });
        var pending = imgs.length;
        if (!pending) { paint(); return; }
        imgs.forEach(function (L) {
          var im = imgCache[L.id];
          if (im && im.complete && im.naturalWidth) { if (--pending === 0) paint(); return; }
          var n = new Image();
          n.onload = function () { imgCache[L.id] = n; if (--pending === 0) paint(); };
          n.onerror = function () { if (--pending === 0) paint(); };
          n.src = L.src;
        });
        function paint() {
          ls.forEach(function (L) {
            if (L.type === 'image') {
              var im2 = imgCache[L.id];
              if (!im2 || !im2.naturalWidth) return;
              var w = L.w / 100 * CW, h = L.h / 100 * CH;
              var x = (L.x / 100 * CW) - w / 2, y = (L.y / 100 * CH) - h / 2;
              try { ctx.drawImage(im2, x, y, w, h); } catch (_) {}
            } else {
              var fs = L.font / 100 * CH;
              ctx.font = (L.bold ? '800 ' : '500 ') + fs + 'px Pretendard, -apple-system, sans-serif';
              ctx.fillStyle = L.color || '#222';
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              var lines = String(L.text || '').split('\n');
              var cx = L.x / 100 * CW, cy = L.y / 100 * CH;
              var lh = fs * 1.2;
              var startY = cy - (lines.length - 1) * lh / 2;
              lines.forEach(function (ln, idx) { ctx.fillText(ln, cx, startY + idx * lh); });
            }
          });
          S.view = prevView;
          resolve(canvas.toDataURL('image/png'));
        }
      }
    });
  }

  // ---- 다운로드 ---------------------------------------------------------------
  function downloadDesign() {
    composite(S.view, 1200).then(function (url) {
      var a = el('a', { href: url, download: '두띵-디자인-' + (S.title || 'design') + '-' + viewLabel(S.view) + '.png' });
      document.body.appendChild(a); a.click(); a.remove();
      toast('이미지를 다운로드했어요');
    });
  }

  // ---- 저장 / 불러오기 --------------------------------------------------------
  function serialize() {
    return { product: S.product, color: S.color, size: S.size, qty: S.qty, family: S.family, views: S.views, version: 1 };
  }
  function saveDesign() {
    var btnEl = document.querySelector('.dz-top .wz-btn--primary');
    if (btnEl) btnEl.disabled = true;
    composite('front', 480).then(function (preview) {
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
      S.slug = d.category || S.slug;
      S.catObj = window.dtCategory(S.slug);
      S.family = (PRODUCTS[S.slug] && PRODUCTS[S.slug].family) || dz.family || 'goods';
      S.product = d.product || (PRODUCTS[S.slug] && PRODUCTS[S.slug].items[0]) || '커스텀 굿즈';
      S.color = dz.color || '#ffffff'; S.size = dz.size || 'M'; S.qty = dz.qty || 1;
      S.views = dz.views || { front: [] };
      S.view = views(S.family)[0];
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
      toast('불러오지 못했어요: ' + ((err && err.message) || '오류'));
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
    var apparel = S.family !== 'goods';
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
    var apparel = S.family !== 'goods';
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
    composite('front', 520).then(function (preview) {
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
    var apparel = S.family !== 'goods';
    var m = aiModal('AI 디자인 생성', '디자인을 실제 ' + (apparel ? '의상' : (S.product || '굿즈')) + ' 이미지로 만들어요.');
    composite('front', 1000).then(function (designUrl) {
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
    var apparel = S.family !== 'goods';
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
        var a = el('a', { href: url, download: '두띵-' + (S.title || 'design') + '-' + (label || 'AI') + '.png' });
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
    if (loadId) { // 프로필에서 이어서 편집
      // 기본 셸 먼저 그린 뒤 로드
      S.slug = 'etc'; S.catObj = window.dtCategory('etc'); S.family = 'goods';
      S.product = '커스텀 굿즈'; S.views = { front: [] };
      render();
      loadDesign(loadId);
      return;
    }

    S.slug = qs('category') || 'tshirt';
    S.catObj = window.dtCategory(S.slug) || window.dtCategory('tshirt');
    if (!PRODUCTS[S.slug]) S.slug = S.catObj ? S.catObj.slug : 'tshirt';
    S.family = (PRODUCTS[S.slug] && PRODUCTS[S.slug].family) || 'goods';
    S.product = (PRODUCTS[S.slug] && PRODUCTS[S.slug].items[0]) || '커스텀 굿즈';
    S.color = S.family === 'goods' ? '#ffffff' : '#ffffff';
    S.view = views(S.family)[0];
    S.views = {}; views(S.family).forEach(function (v) { S.views[v] = []; });
    S.title = (S.catObj ? S.catObj.label : '내') + ' 디자인';
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
