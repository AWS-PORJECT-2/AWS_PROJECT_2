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
    jacket: { type: 'apparel', colors: true, items: [
      { name: '바시티 자켓', img: 'varsity_jacket', views: AP,
        print: { front: pr(31, 23, 38, 56), back: pr(29, 18, 42, 62), left: pr(40, 26, 20, 24), right: pr(40, 26, 20, 24) } },
    ] },
    hoodie: { type: 'apparel', colors: true, items: [
      { name: '후드티', img: 'hoodie', views: AP,
        print: { front: pr(31, 47, 38, 33), back: pr(30, 18, 40, 60), left: pr(40, 26, 20, 24), right: pr(40, 26, 20, 24) } },
      { name: '맨투맨', img: 'sweatshirt', views: AP,
        print: { front: pr(30, 22, 40, 58), back: pr(29, 22, 42, 57), left: pr(40, 26, 20, 24), right: pr(40, 26, 20, 24) } },
    ] },
    tshirt: { type: 'apparel', colors: true, items: [
      { name: '반팔티', img: 'tshirt', views: ['front', 'back', 'left', 'right', 'neck'],
        print: { front: pr(29, 18, 42, 66), back: pr(29, 17, 42, 68), left: pr(40, 26, 20, 24), right: pr(40, 26, 20, 24), neck: pr(36, 40, 28, 14) } },
    ] },
    ecobag: { type: 'goods', colors: true, items: [
      { name: '에코백', img: 'ecobag', views: ['front', 'back'], print: { front: pr(30, 37, 40, 40), back: pr(30, 37, 40, 40) } },
    ] },
    keyring: { type: 'goods', items: [
      { name: '아크릴 키링', img: 'keyring', views: ['front'], print: { front: pr(32, 26, 36, 44) } },
      { name: '원형 키링', img: 'keyring_round', views: ['front'], print: { front: pr(26, 28, 44, 44) } },
      { name: '사각 키링', img: 'keyring_square', views: ['front'], print: { front: pr(26, 26, 46, 46) } },
      { name: '스트랩 키링', img: 'keyring_strap', views: ['front'], print: { front: pr(44, 16, 14, 50) } },
    ] },
    phonecase: { type: 'goods', colors: true, items: [
      { name: '폰케이스', img: 'phonecase', views: ['back'], print: { back: pr(33, 15, 34, 66) } },
    ] },
    sticker: { type: 'goods', items: [
      { name: '스티커', img: 'sticker_sheet', views: ['front'], print: { front: pr(18, 14, 64, 74) } },
    ] },
    badge: { type: 'goods', items: [
      { name: '뱃지', img: 'badge', views: ['front'], print: { front: pr(26, 32, 48, 36) } },
    ] },
    tumbler: { type: 'goods', colors: true, items: [
      { name: '텀블러', img: 'tumbler', views: ['front'], print: { front: pr(37, 20, 24, 54) } },
      { name: '머그컵', img: 'mug', views: ['front'], print: { front: pr(34, 34, 28, 30) } },
    ] },
    fabric: { type: 'goods', colors: true, items: [
      { name: '담요', img: 'blanket', views: ['front'], print: { front: pr(24, 18, 52, 62) } },
    ] },
    // 인형·액세서리는 레이어 에디터 대신 "말로 설명 → AI 디자인 뽑기" 모드.
    doll: { type: 'goods', mode: 'describe', items: [
      { name: '마스코트 인형', img: 'mascot', views: ['front'], print: { front: pr(36, 40, 28, 24) } },
    ] },
    accessory: { type: 'goods', mode: 'describe', items: [
      { name: '액세서리', img: 'accessory', views: ['front'], print: { front: pr(32, 26, 36, 40) } },
    ] },
    // 웹·앱, 기타(type 'none')는 디자인하기 미지원 — PRODUCTS 에서 제외(에디터 안 열림).
  };
  function catDef(slug) { return PRODUCTS[slug] || PRODUCTS.tshirt; }
  function supportsDesign(slug) { return !!PRODUCTS[slug]; }
  function curItem() { return catDef(S.slug).items[S.itemIdx] || catDef(S.slug).items[0]; }
  function isApparel() { return catDef(S.slug).type === 'apparel'; }

  // 색상 팔레트. key = 사전 생성된 색상 목업 파일 접미사(/assets/mockups/<img>_<view>__<key>.jpg).
  //  화이트는 원본(접미사 없음). 색 변경 = 실시간 멀티플라이가 아니라 해당 색 이미지로 교체(배경 번짐 없음).
  var COLORS = [
    { name: '화이트', hex: '#ffffff', key: '' }, { name: '블랙', hex: '#2b2b2e', key: 'black' },
    { name: '그레이', hex: '#b8bcc4', key: 'gray' }, { name: '네이비', hex: '#23304f', key: 'navy' },
    { name: '레드', hex: '#d23b3b', key: 'red' }, { name: '퍼플', hex: '#8b5cf6', key: 'purple' },
    { name: '그린', hex: '#3a9a5c', key: 'green' }, { name: '베이지', hex: '#e7dcc6', key: 'beige' },
  ];
  function colorKey(hex) { for (var i = 0; i < COLORS.length; i++) { if (COLORS[i].hex.toLowerCase() === String(hex).toLowerCase()) return COLORS[i].key; } return ''; }
  function colorable() { return catDef(S.slug).colors === true; }
  var SIZES = ['S', 'M', 'L', 'XL', '2XL'];

  // 텍스트 글꼴(서체) — design.html 에서 구글폰트 로드.
  var FONTS = [
    { name: '프리텐다드', css: "'Pretendard', sans-serif" },
    { name: '나눔명조', css: "'Nanum Myeongjo', serif" },
    { name: '나눔고딕', css: "'Nanum Gothic', sans-serif" },
    { name: '검은고딕', css: "'Black Han Sans', sans-serif" },
    { name: '주아', css: "'Jua', sans-serif" },
    { name: '도현', css: "'Do Hyeon', sans-serif" },
    { name: '개구', css: "'Gaegu', cursive" },
    { name: '강원교육', css: "'Gowun Dodum', sans-serif" },
  ];
  // 텍스트 색상 팔레트(굵은 팔레트)
  var TEXT_PALETTE = [
    '#1a2238', '#7b2fbe', '#1f3d2b', '#000000', '#ffffff', '#3a9bd9', '#e8821e',
    '#f0b429', '#f4b6c2', '#d9c7e8', '#5a3825', '#cdb892', '#efe7cf', '#3a7d44',
    '#f4d03f', '#c0392b', '#2e8b57', '#9aa0a6', '#f7a8c4', '#2b3a8c', '#cc2b2b',
    '#bdbdbd', '#caa84a', '#c6e84a', '#e84ac4', '#4ae84a', '#4aa8e8', '#f7f3c4',
  ];

  var VIEW_LABEL = { front: '앞면', back: '뒷면', left: '왼쪽', right: '오른쪽', neck: '넥(목)', wrap: '전개도' };
  function views() { return curItem().views; }
  function primaryView() { return views()[0]; } // 대표 면(폰케이스처럼 front 가 없는 상품 대비)
  function viewLabel(v) { return VIEW_LABEL[v] || v; }

  // 목업 이미지 경로. 색이 흰색이 아니고 colorable 카테고리면 사전 생성된 색상 이미지(__key)로 교체.
  function mockupSrc(view) {
    var it = curItem();
    if (!it.img) return null;
    var k = (colorable() && !isWhite(S.color)) ? colorKey(S.color) : '';
    return '/assets/mockups/' + it.img + '_' + view + (k ? '__' + k : '') + '.jpg';
  }
  function baseMockupSrc(view) { var it = curItem(); return it.img ? '/assets/mockups/' + it.img + '_' + view + '.jpg' : null; }
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
    description: '',    // 설명 모드(인형·액세서리) 텍스트
    descPhotos: [],     // 설명 모드 참고 사진(최대 5장, data URL)
  };
  function cvLayers() { return S.views[S.view] || (S.views[S.view] = []); }
  function selLayer() { var ls = cvLayers(); for (var i = 0; i < ls.length; i++) if (ls[i].id === S.sel) return ls[i]; return null; }
  var imgCache = {}; // layerId -> HTMLImageElement (합성용)

  // ---- 실행취소/다시실행 히스토리 (S.views 스냅샷) -----------------------------
  //  이미지 src(data URL)는 스냅샷에서 분리해 srcStore 에 레이어id로 1회만 저장(중복 X) → 50개
  //  스냅샷이 메타데이터만 담아 메모리 비대화 방지. 복원 시 srcStore 에서 src 재부착.
  var histPast = [], histFuture = [], srcStore = {};
  function snapViews() {
    var clone = JSON.parse(JSON.stringify(S.views));
    Object.keys(clone).forEach(function (v) {
      (clone[v] || []).forEach(function (L) {
        if (L.type === 'image' && L.src) { srcStore[L.id] = L.src; delete L.src; }
      });
    });
    return JSON.stringify(clone);
  }
  function applySnap(json) {
    var views = JSON.parse(json);
    Object.keys(views).forEach(function (v) {
      (views[v] || []).forEach(function (L) { if (L.type === 'image' && !L.src && srcStore[L.id]) L.src = srcStore[L.id]; });
    });
    S.views = views;
  }
  function pushHistory() { histPast.push(snapViews()); if (histPast.length > 50) histPast.shift(); histFuture = []; updateToolbar(); }
  function resetHistory() { histPast = []; histFuture = []; srcStore = {}; }
  function rebuildImgCache() {
    imgCache = {};
    Object.keys(S.views).forEach(function (v) {
      (S.views[v] || []).forEach(function (L) { if (L.type === 'image') { var im = new Image(); im.crossOrigin = 'anonymous'; im.src = L.src; imgCache[L.id] = im; } });
    });
  }
  function undo() { if (!histPast.length) return; histFuture.push(snapViews()); applySnap(histPast.pop()); S.sel = null; rebuildImgCache(); render(); }
  function redo() { if (!histFuture.length) return; histPast.push(snapViews()); applySnap(histFuture.pop()); S.sel = null; rebuildImgCache(); render(); }

  // ---- 툴바 -------------------------------------------------------------------
  var toolbarEl = null, tbUndo = null, tbRedo = null;
  var TB = {
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="3" width="13" height="13" rx="2"/><path d="M3 8v11a2 2 0 0 0 2 2h11" opacity=".5"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="8" width="13" height="13" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v11" opacity=".5"/></svg>',
    fliph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18"/><path d="M8 7l-4 5 4 5z" fill="currentColor"/><path d="M16 7l4 5-4 5z"/></svg>',
    flipv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h18"/><path d="M7 8l5-4 5 4z" fill="currentColor"/><path d="M7 16l5 4 5-4z"/></svg>',
    al_l: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 3v18"/><rect x="6" y="7" width="11" height="4" fill="currentColor" stroke="none"/><rect x="6" y="14" width="7" height="4" fill="currentColor" stroke="none"/></svg>',
    al_hc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18"/><rect x="6" y="7" width="12" height="4" fill="currentColor" stroke="none"/><rect x="8" y="14" width="8" height="4" fill="currentColor" stroke="none"/></svg>',
    al_r: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 3v18"/><rect x="7" y="7" width="11" height="4" fill="currentColor" stroke="none"/><rect x="11" y="14" width="7" height="4" fill="currentColor" stroke="none"/></svg>',
    al_t: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h18"/><rect x="7" y="6" width="4" height="11" fill="currentColor" stroke="none"/><rect x="14" y="6" width="4" height="7" fill="currentColor" stroke="none"/></svg>',
    al_vc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h18"/><rect x="7" y="6" width="4" height="12" fill="currentColor" stroke="none"/><rect x="14" y="8" width="4" height="8" fill="currentColor" stroke="none"/></svg>',
    al_b: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 20h18"/><rect x="7" y="7" width="4" height="11" fill="currentColor" stroke="none"/><rect x="14" y="11" width="4" height="7" fill="currentColor" stroke="none"/></svg>',
  };
  function renderToolbar() {
    if (!toolbarEl) return;
    toolbarEl.replaceChildren();
    function tbBtn(icon, label, on, opts) {
      var b = el('button', { class: 'dz-tb__b' + (opts && opts.cls ? ' ' + opts.cls : ''), type: 'button', title: label }, el('span', { class: 'dz-tb__ic', html: icon }), el('span', { class: 'dz-tb__l' }, label));
      b.addEventListener('click', on);
      if (opts && opts.ref) opts.ref(b);
      return b;
    }
    function sep() { return el('div', { class: 'dz-tb__sep' }); }
    toolbarEl.append(
      tbBtn(TB.reset, '처음으로', resetDesign),
      tbBtn(TB.undo, '취소', undo, { ref: function (b) { tbUndo = b; } }),
      tbBtn(TB.redo, '다시실행', redo, { ref: function (b) { tbRedo = b; } }),
      sep(),
      tbBtn(TB.del, '삭제', function () { var L = selLayer(); if (!L) return toast('객체를 먼저 선택해 주세요'); removeLayer(L.id); }),
      tbBtn(TB.fwd, '앞으로', function () { var L = selLayer(); if (!L) return toast('객체를 먼저 선택해 주세요'); moveLayer(L.id, 1); }),
      tbBtn(TB.back, '뒤로', function () { var L = selLayer(); if (!L) return toast('객체를 먼저 선택해 주세요'); moveLayer(L.id, -1); }),
      sep(),
      tbBtn(TB.fliph, '좌우반전', function () { flipLayer('h'); }),
      tbBtn(TB.flipv, '상하반전', function () { flipLayer('v'); }),
      sep(),
      tbBtn(TB.al_l, '왼쪽', function () { alignLayer('left'); }),
      tbBtn(TB.al_hc, '가운데', function () { alignLayer('hcenter'); }),
      tbBtn(TB.al_r, '오른쪽', function () { alignLayer('right'); }),
      tbBtn(TB.al_t, '위', function () { alignLayer('top'); }),
      tbBtn(TB.al_vc, '가운데', function () { alignLayer('vcenter'); }),
      tbBtn(TB.al_b, '아래', function () { alignLayer('bottom'); }),
    );
    updateToolbar();
  }
  function updateToolbar() {
    if (tbUndo) tbUndo.disabled = !histPast.length;
    if (tbRedo) tbRedo.disabled = !histFuture.length;
  }
  function selOp(fn) { var L = selLayer(); if (!L) { toast('객체(이미지/텍스트)를 먼저 선택해 주세요'); return; } pushHistory(); fn(L); render(); }
  function flipLayer(axis) { selOp(function (L) { if (axis === 'h') L.flipH = !L.flipH; else L.flipV = !L.flipV; }); }
  function alignLayer(where) {
    selOp(function (L) {
      var b = printRect();
      if (where === 'left') L.x = b.l + L.w / 2;
      else if (where === 'hcenter') L.x = b.l + b.w / 2;
      else if (where === 'right') L.x = b.l + b.w - L.w / 2;
      else if (where === 'top') L.y = b.t + L.h / 2;
      else if (where === 'vcenter') L.y = b.t + b.h / 2;
      else if (where === 'bottom') L.y = b.t + b.h - L.h / 2;
    });
  }
  function resetDesign() {
    if (!cvLayers().length) { toast('비울 디자인이 없어요'); return; }
    if (!window.confirm('현재 면의 디자인을 모두 지울까요?')) return;
    pushHistory(); S.views[S.view] = []; S.sel = null; render();
  }

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
    if (catDef(S.slug).mode === 'describe') { renderDescribe(); return; } // 인형·액세서리: 설명 모드
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
    canvasEl.appendChild(buildMockNode()); // 목업(색상 이미지)
    // 레이어 컨테이너 — 제품 실루엣 마스크로 클리핑(제품 밖으로 나간 디자인은 안 보임).
    layersWrap = el('div', { class: 'dz-canvas__layers', style: 'position:absolute;inset:0' });
    applyMaskCss(layersWrap, maskSrc(S.view));
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
    // 툴바(처음으로/취소/다시실행/삭제/앞뒤/반전/정렬)
    toolbarEl = el('div', { class: 'dz-tb' });
    renderToolbar();
    stage.appendChild(toolbarEl);
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
    wrap.appendChild(aiSection()); // 하단: 도면 | 가상피팅 (인라인 결과)
    root.appendChild(wrap);

    renderLayers(); renderProps(); renderLayerList();
    if (window.WZI18N && window.WZI18N.apply) try { window.WZI18N.apply(root); } catch (_) {}
  }

  // 설명 모드(인형·액세서리) — 레이어 에디터 대신 설명칸 + 디자인 뽑기.
  function renderDescribe() {
    var wrap = el('div', { class: 'dz-wrap' });
    titleInput = el('input', { class: 'dz-titlein', type: 'text', maxlength: '40', value: S.title, 'aria-label': '디자인 이름' });
    titleInput.addEventListener('change', function () { S.title = titleInput.value.trim() || '내 디자인'; });
    wrap.appendChild(el('div', { class: 'dz-top' },
      el('div', { class: 'dz-top__l' }, el('div', { class: 'dz-title' }, '디자인하기'), titleInput),
      el('div', { class: 'dz-top__r' }, btn('불러오기', 'outline', openLoadModal), btn('저장', 'primary', saveDescribe)),
    ));
    var card = el('div', { class: 'dz-describe' });
    card.appendChild(el('div', { class: 'dz-describe__t' }, (curItem().name || '굿즈') + ' 디자인 설명'));
    card.appendChild(el('div', { class: 'dz-describe__s' }, '원하는 디자인을 말로 자세히 적어주세요. AI가 설명을 보고 디자인을 만들어 드립니다.'));
    var ta = el('textarea', { class: 'dz-describe__ta', rows: '7',
      placeholder: '예) 국민대 호랑이 마스코트 인형 — 파란 유니폼에 등번호 23, 둥글둥글 귀여운 느낌, 손에 작은 깃발' });
    ta.value = S.description || '';
    ta.addEventListener('input', function () { S.description = ta.value; });
    card.appendChild(ta);

    // 참고 사진 첨부(최대 5장)
    card.appendChild(el('div', { class: 'dz-describe__lbl' }, '참고 사진 (최대 5장, 선택)'));
    var photosWrap = el('div', { class: 'dz-desc-photos' });
    function renderPhotos() {
      photosWrap.replaceChildren();
      S.descPhotos.forEach(function (src, idx) {
        var cell = el('div', { class: 'dz-desc-photo' }, el('img', { src: src, alt: '' }));
        var rm = el('button', { class: 'dz-desc-photo__rm', type: 'button', title: '삭제' }, '×');
        rm.addEventListener('click', function () { S.descPhotos.splice(idx, 1); renderPhotos(); });
        cell.appendChild(rm);
        photosWrap.appendChild(cell);
      });
      if (S.descPhotos.length < 5) {
        var add = el('button', { class: 'dz-desc-photo dz-desc-photo--add', type: 'button' },
          el('span', { class: 'dz-desc-photo__plus' }, '+'), el('span', {}, '사진'));
        add.addEventListener('click', pickDescPhoto);
        photosWrap.appendChild(add);
      }
    }
    function pickDescPhoto() {
      var input = el('input', { type: 'file', accept: 'image/*', multiple: '', style: 'display:none' });
      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files || []);
        var room = 5 - S.descPhotos.length;
        if (files.length > room) toast('사진은 최대 5장까지예요');
        files.slice(0, room).forEach(function (f) {
          var uerr = validateUpload(f); if (uerr) { toast(uerr); return; }
          readImageFile(f).then(function (res) { if (S.descPhotos.length < 5) { S.descPhotos.push(res.url); renderPhotos(); } })
            .catch(function () { toast('이미지를 읽지 못했습니다'); });
        });
      });
      document.body.appendChild(input); input.click(); setTimeout(function () { input.remove(); }, 1000);
    }
    renderPhotos();
    card.appendChild(photosWrap);

    card.appendChild(btn('디자인 뽑기', 'primary', runDescribeAi, 'dz-describe__go'));
    wrap.appendChild(card);
    root.appendChild(wrap);
    if (window.WZI18N && window.WZI18N.apply) try { window.WZI18N.apply(root); } catch (_) {}
  }
  function describeBody(preview) {
    return { category: S.slug, product: S.product, title: S.title,
      design: { describe: true, description: S.description, photos: S.descPhotos, product: S.product, version: 2 },
      preview: preview || S.descPhotos[0] || null };
  }
  function saveDescribe() {
    if (!S.description.trim() && !S.descPhotos.length) { toast('설명을 입력하거나 사진을 추가해 주세요'); return; }
    var b = document.querySelector('.dz-top .wz-btn--primary'); if (b) b.disabled = true;
    var p = S.designId ? window.api.patch('/me/designs/' + S.designId, describeBody()) : window.api.post('/me/designs', describeBody());
    p.then(function (r) { if (r && r.id) S.designId = r.id; toast('저장했어요. 마이페이지 > 내 디자인에서 이어서 편집할 수 있어요.'); })
      .catch(function (err) { if (err && err.status === 401) { location.href = '/login.html'; return; } toast('저장 실패: ' + ((err && err.message) || '오류')); })
      .finally(function () { if (b) b.disabled = false; });
  }
  // 디자인 뽑기 — 설명 + 참고사진(최대 5장)을 AI 에 보내 디자인 생성(prod GEMINI 미연결 시 안내). 함께 저장.
  function runDescribeAi() {
    if (!S.description.trim() && !S.descPhotos.length) { toast('설명을 입력하거나 사진을 추가해 주세요'); return; }
    var m = aiModal('AI 디자인 생성', '설명' + (S.descPhotos.length ? '과 참고 사진' : '') + '을 바탕으로 ' + (curItem().name || '굿즈') + ' 디자인을 만들어요.');
    // 설명·사진 저장(완성본 보존)
    (S.designId ? window.api.patch('/me/designs/' + S.designId, describeBody()) : window.api.post('/me/designs', describeBody()))
      .then(function (r) { if (r && r.id) S.designId = r.id; }).catch(function () {});
    window.api.post('/ai/blueprint', { imageDataUrls: S.descPhotos, prompt: S.description, description: S.description, category: S.slug })
      .then(function (res) {
        var url = res && (res.blueprintDataUrl || res.imageDataUrl || res.url);
        if (!url) throw new Error('NO_RESULT');
        if (S.designId) window.api.patch('/me/designs/' + S.designId, { aiImage: url }).catch(function () {});
        showResult(m.box, m.overlay, url, 'AI 디자인');
      })
      .catch(function (err) {
        if (err && err.status === 401) { location.href = '/login.html'; return; }
        m.box.replaceChildren(
          el('div', { class: 'dz-modal__t' }, '안내'),
          el('div', { class: 'dz-status' }, 'AI 디자인 생성이 아직 연결되지 않았어요. 설명은 저장됐어요. (관리자가 AI를 켜면 바로 생성됩니다.)'),
          el('div', { class: 'dz-modal__foot' }, btn('닫기', 'primary', function () { m.overlay.remove(); })),
        );
      });
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
    resetHistory();
    imgCache = {};
    render();
  }

  // 목업 노드: canvas 에 목업 사진을 그린다(색상은 mockupSrc 가 색상별 사전생성 이미지로 교체).
  //  합성(다운로드/AI)과 동일한 결과를 보장하기 위해 DOM <img> 대신 canvas 사용.
  function buildMockNode() {
    var cv = el('canvas', { class: 'dz-canvas__mock' });
    cv.width = 800; cv.height = 800;
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    mockCanvasEl = cv;
    paintMockCanvas(cv, S.view);
    return cv;
  }
  // 색은 mockupSrc 가 색상 이미지(__key)로 교체 — canvas 에 그대로 그림(멀티플라이 X → 배경 번짐 없음).
  function paintMockCanvas(cv, view) {
    var ctx = cv.getContext('2d'), CW = cv.width, CH = cv.height;
    var token = (cv.__tk = (cv.__tk || 0) + 1);
    function stale() { return mockCanvasEl !== cv || cv.__tk !== token; }
    var src = mockupSrc(view);
    if (!src) { // 이미지 없는 상품 — SVG 폴백
      var s = new Image();
      s.onload = function () { if (!stale()) { ctx.clearRect(0, 0, CW, CH); ctx.drawImage(s, 0, 0, CW, CH); } };
      s.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(mockSvg());
      return;
    }
    loadImg2(src, function (base) {
      if (stale()) return;
      if (base) { ctx.clearRect(0, 0, CW, CH); ctx.drawImage(base, 0, 0, CW, CH); return; }
      var fb = baseMockupSrc(view); // 색상 이미지 없으면 흰색 베이스로 폴백
      if (fb && fb !== src) loadImg2(fb, function (b2) { if (!stale() && b2) { ctx.clearRect(0, 0, CW, CH); ctx.drawImage(b2, 0, 0, CW, CH); } });
    });
  }
  function repaintMock() { if (mockCanvasEl) paintMockCanvas(mockCanvasEl, S.view); }

  // ---- 툴 카드(이미지/텍스트 추가) -------------------------------------------
  function toolsCard() {
    var card = el('div', { class: 'dz-card' });
    card.appendChild(el('div', { class: 'dz-card__t' }, '추가하기'));
    var tools = el('div', { class: 'dz-tools' });

    var imgIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5L5 20"/></svg>';
    var txtIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="1.8"><path d="M4 6V4h16v2"/><path d="M12 4v16"/><path d="M9 20h6"/></svg>';

    var freeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="1.8"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19l1-5.8L3.5 9.2l5.9-.9z"/></svg>';
    var patchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="4" stroke-dasharray="3 2"/><path d="M9 9h6M9 13h6"/></svg>';
    var imgTool = el('button', { class: 'dz-tool', type: 'button' }, el('span', { html: imgIcon }), '이미지 업로드');
    imgTool.addEventListener('click', pickImage);
    var txtTool = el('button', { class: 'dz-tool', type: 'button' }, el('span', { html: txtIcon }), '텍스트 추가');
    txtTool.addEventListener('click', addText);
    var freeTool = el('button', { class: 'dz-tool', type: 'button' }, el('span', { html: freeIcon }), '무료 디자인');
    freeTool.addEventListener('click', function () { openLibrary('free'); });
    var patchTool = el('button', { class: 'dz-tool', type: 'button' }, el('span', { html: patchIcon }), '자수 패치');
    patchTool.addEventListener('click', function () { openLibrary('patch'); });

    tools.append(imgTool, txtTool, freeTool, patchTool);
    card.appendChild(tools);
    return card;
  }
  // 라이브러리 picker — 무료 디자인 / 자수 패치 그리드에서 선택 → 이미지 레이어로 추가.
  function openLibrary(kind) {
    var title = kind === 'patch' ? '자수 패치' : '무료 디자인';
    var overlay = el('div', { class: 'dz-modal' });
    var box = el('div', { class: 'dz-modal__box' });
    box.append(el('div', { class: 'dz-modal__t' }, title), el('div', { class: 'dz-status' }, el('span', { class: 'dz-spin' }), '불러오는 중…'));
    overlay.appendChild(box);
    overlay.addEventListener('pointerdown', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    window.api.get('/library?kind=' + kind).then(function (res) {
      var items = (res && res.items) || [];
      box.replaceChildren(el('div', { class: 'dz-modal__t' }, title));
      if (!items.length) { box.appendChild(el('div', { class: 'dz-status' }, '아직 등록된 항목이 없어요.')); }
      else {
        var grid = el('div', { class: 'dz-libgrid' });
        items.forEach(function (it) {
          var cell = el('button', { class: 'dz-libcell', type: 'button', title: it.name }, el('img', { src: it.image, alt: it.name, loading: 'lazy' }));
          cell.addEventListener('click', function () { addLibraryAsset(it.image); overlay.remove(); });
          grid.appendChild(cell);
        });
        box.appendChild(grid);
      }
      box.appendChild(el('div', { class: 'dz-modal__foot' }, btn('닫기', 'outline', function () { overlay.remove(); })));
    }).catch(function () {
      box.replaceChildren(el('div', { class: 'dz-modal__t' }, title), el('div', { class: 'dz-status' }, '불러오지 못했어요.'),
        el('div', { class: 'dz-modal__foot' }, btn('닫기', 'outline', function () { overlay.remove(); })));
    });
  }
  function addLibraryAsset(src) {
    var im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = function () {
      var pr = printRect();
      var natAR = (im.naturalHeight || 1) / (im.naturalWidth || 1);
      var w = Math.min(pr.w * 0.55, 28);
      var hPct = w * canvasAspect() * natAR;
      var L = { id: 'L' + (++S.seq), type: 'image', src: src, x: pr.l + pr.w / 2, y: pr.t + pr.h / 2, w: w, h: hPct, ar: natAR };
      imgCache[L.id] = im;
      pushHistory(); cvLayers().push(L); S.sel = L.id; render();
    };
    im.onerror = function () { toast('이미지를 불러오지 못했어요'); };
    im.src = src;
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

    // 색상 — 색이 필요한 제품(colorable)만 노출 + 색별 실사 목업 교체. 그 외(키링·스티커 등)는 색 옵션 숨김.
    if (colorable()) {
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

    // 사이즈(의류만). 수량은 제거(주문 단계에서 정함).
    if (isApparel()) {
      var sizeSel = el('select', { class: 'dz-select' });
      SIZES.forEach(function (s) { var o = el('option', { value: s }, s); if (s === S.size) o.selected = true; sizeSel.appendChild(o); });
      sizeSel.addEventListener('change', function () { S.size = sizeSel.value; });
      card.appendChild(field('사이즈', sizeSel));
    }

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
        if (L.tint) {
          // 색 변경: 이미지 알파를 마스크로 단색 칠 (투명 보존)
          var rc = el('div', { class: 'dz-layer__tint' });
          rc.style.background = L.tint;
          rc.style.webkitMaskImage = 'url("' + L.src + '")';
          rc.style.maskImage = 'url("' + L.src + '")';
          node.appendChild(rc);
        } else {
          node.appendChild(el('img', { src: L.src, alt: '' }));
        }
      } else {
        var tx = el('div', { class: 'dz-layer__txt' });
        styleText(tx, L);
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
  // 텍스트 노드 스타일 적용(글꼴/색/스타일/정렬/간격/패턴). 회전·반전은 layerStyle 의 transform.
  function styleText(tx, L) {
    tx.style.color = L.color || '#222';
    tx.style.fontWeight = L.bold ? '800' : '500';
    tx.style.fontStyle = L.italic ? 'italic' : 'normal';
    var deco = (L.underline ? 'underline ' : '') + (L.strike ? 'line-through' : '');
    tx.style.textDecoration = deco.trim() || 'none';
    tx.style.fontFamily = L.family || "'Pretendard', sans-serif";
    tx.style.fontSize = (L.font * canvasPxH() / 100) + 'px';
    tx.style.letterSpacing = (L.ls || 0) + 'em';
    tx.style.lineHeight = String(L.lh || 1.2);
    tx.style.justifyContent = L.align === 'left' ? 'flex-start' : L.align === 'right' ? 'flex-end' : 'center';
    tx.style.textAlign = L.align || 'center';
    var c = Math.max(1, Math.min(5, L.patc || 1)), r = Math.max(1, Math.min(5, L.patr || 1));
    if (c > 1 || r > 1) {
      tx.style.display = 'grid';
      tx.style.gridTemplateColumns = 'repeat(' + c + ', auto)';
      tx.style.placeContent = 'center'; tx.style.gap = '0.15em 0.5em';
      tx.replaceChildren();
      for (var i = 0; i < c * r; i++) tx.appendChild(el('span', {}, L.text || ''));
    } else {
      tx.style.display = 'flex';
      tx.textContent = L.text || '';
    }
  }
  function transformOf(L) {
    var p = [];
    if (L.rot) p.push('rotate(' + L.rot + 'deg)');
    if (L.flipH || L.flipV) p.push('scale(' + (L.flipH ? -1 : 1) + ',' + (L.flipV ? -1 : 1) + ')');
    return p.join(' ');
  }
  function layerStyle(L) {
    // 중심(x,y) 기준 배치. 이미지 w,h%; 텍스트는 w% 박스 + auto height. 회전/반전은 transform.
    var tf = transformOf(L); var tfCss = tf ? 'transform:' + tf + ';transform-origin:center;' : '';
    return 'left:' + (L.x - L.w / 2) + '%;top:' + (L.y - L.h / 2) + '%;width:' + L.w + '%;height:' + L.h + '%;' + tfCss;
  }
  function canvasPxH() { return canvasEl ? canvasEl.getBoundingClientRect().height : 460; }

  // ---- 드래그 / 리사이즈 ------------------------------------------------------
  function startDrag(e, L) {
    e.preventDefault();
    if (S.sel !== L.id) { S.sel = L.id; renderLayers(); renderProps(); renderLayerList(); }
    var rect = canvasEl.getBoundingClientRect();
    var startX = e.clientX, startY = e.clientY, ox = L.x, oy = L.y, pushed = false;
    function move(ev) {
      if (!pushed) { pushHistory(); pushed = true; }
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
    var startX = e.clientX, sw = L.w, sh = L.h, sf = L.font || 0, pushed = false;
    function move(ev) {
      if (!pushed) { pushHistory(); pushed = true; }
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
      var uerr = validateUpload(f); if (uerr) { toast(uerr); return; }
      readImageFile(f).then(function (res) {
        var pr = printRect();
        var natAR = res.h / res.w; // height/width
        var w = Math.min(pr.w * 0.8, 40);
        // h% from aspect: h_px/w_px = natAR → h% = w% * (canvasW/canvasH) * natAR
        var hPct = w * canvasAspect() * natAR;
        var L = { id: 'L' + (++S.seq), type: 'image', src: res.url, x: pr.l + pr.w / 2, y: pr.t + pr.h / 2, w: w, h: hPct, ar: natAR };
        var im = new Image(); im.crossOrigin = 'anonymous'; im.src = res.url; imgCache[L.id] = im;
        pushHistory(); cvLayers().push(L); S.sel = L.id; render();
      }).catch(function () { toast('이미지를 읽지 못했습니다. 다른 이미지를 시도해 주세요.'); });
    });
    document.body.appendChild(input); input.click();
    setTimeout(function () { input.remove(); }, 1000);
  }
  // 업로드 제한(실제 적용): JPEG/PNG 만, 10MB 미만. 위반 시 메시지 반환(null=통과).
  var MAX_UPLOAD = 10 * 1024 * 1024;
  function validateUpload(file) {
    if (!file) return '파일을 선택해 주세요.';
    var okType = /^image\/(jpeg|jpg|png)$/i.test(file.type || '') || /\.(jpe?g|png)$/i.test(file.name || '');
    if (!okType) return '업로드 가능한 이미지는 JPEG·PNG 형식이에요.';
    if (file.size > MAX_UPLOAD) return '이미지는 10MB 미만만 업로드할 수 있어요 (현재 ' + (file.size / 1024 / 1024).toFixed(1) + 'MB).';
    return null;
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
    var L = { id: 'L' + (++S.seq), type: 'text', text: t.slice(0, 60), x: pr.l + pr.w / 2, y: pr.t + pr.h / 2, w: Math.min(pr.w, 50), font: 7, color: '#222222', bold: true, h: 0,
      family: "'Pretendard', sans-serif", italic: false, underline: false, strike: false, align: 'center', ls: 0, lh: 1.2, rot: 0, patc: 1, patr: 1 };
    L.h = textBoxH(L);
    pushHistory(); cvLayers().push(L); S.sel = L.id; render();
  }
  function textBoxH(L) {
    // 대략적 박스 높이(%): 줄 수 * 폰트 * 행간 * 패턴세로.
    var lines = String(L.text || '').split('\n').length;
    var base = Math.max(L.font * 1.4, L.font * (L.lh || 1.3) * lines);
    return base * Math.max(1, L.patr || 1);
  }

  // ---- 레이어 삭제/순서 -------------------------------------------------------
  function removeLayer(id) {
    var ls = cvLayers(); var i = ls.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    pushHistory();
    ls.splice(i, 1);
    delete imgCache[id];
    if (S.sel === id) S.sel = null;
    render();
  }
  function moveLayer(id, dir) {
    var ls = cvLayers(); var i = ls.findIndex(function (x) { return x.id === id; });
    var j = i + dir; if (i < 0 || j < 0 || j >= ls.length) return;
    pushHistory();
    var tmp = ls[i]; ls[i] = ls[j]; ls[j] = tmp; render();
  }

  // ---- 속성 패널(선택 텍스트) — 리치 텍스트 설정 ------------------------------
  function fmtNum(v) { return String(Math.round(v * 100) / 100); }
  function stepper(val, step, min, max, onChange, suffix) {
    var w = el('div', { class: 'dz-stepper' });
    var inp = el('input', { class: 'dz-stepper__i', type: 'text', value: fmtNum(val) + (suffix || '') });
    function set(v) { v = Math.max(min, Math.min(max, Math.round(v / step) * step)); v = Math.round(v * 1000) / 1000; inp.value = fmtNum(v) + (suffix || ''); onChange(v); }
    var dec = el('button', { class: 'dz-stepper__b', type: 'button' }, '−');
    var inc = el('button', { class: 'dz-stepper__b', type: 'button' }, '+');
    dec.addEventListener('click', function () { set((parseFloat(inp.value) || 0) - step); });
    inc.addEventListener('click', function () { set((parseFloat(inp.value) || 0) + step); });
    inp.addEventListener('change', function () { set(parseFloat(inp.value) || 0); });
    w.append(dec, inp, inc);
    return w;
  }
  var AL_SVG = {
    left: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h13"/></svg>',
    center: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M5 18h14"/></svg>',
    right: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M10 12h10M7 18h13"/></svg>',
  };
  function renderProps() {
    if (!propsBox) return;
    propsBox.replaceChildren();
    var L = selLayer();
    if (!L) return;
    if (L.type === 'image') { renderImageProps(L); return; }
    if (L.type !== 'text') return;
    var card = el('div', { class: 'dz-card' });
    card.appendChild(el('div', { class: 'dz-card__t' }, '텍스트 설정'));

    // 내용
    var ta = el('textarea', { class: 'dz-input', rows: '2', maxlength: '80' }); ta.value = L.text;
    ta.addEventListener('input', function () { L.text = ta.value; L.h = textBoxH(L); renderLayers(); renderLayerList(); });
    card.appendChild(field('내용', ta));

    // 서체
    var fsel = el('select', { class: 'dz-select' });
    FONTS.forEach(function (f) { var o = el('option', { value: f.css }, f.name); if (f.css === L.family) o.selected = true; o.style.fontFamily = f.css; fsel.appendChild(o); });
    fsel.addEventListener('change', function () { L.family = fsel.value; renderLayers(); });
    card.appendChild(field('서체', fsel));

    // 스타일(B/I/U/S) + 정렬
    var srow = el('div', { class: 'dz-tstyle' });
    function tbtn(content, getOn, toggle) {
      var b = el('button', { class: 'dz-tbtn' + (getOn() ? ' is-on' : ''), type: 'button' }); b.innerHTML = content;
      b.addEventListener('click', function () { toggle(); b.classList.toggle('is-on', getOn()); renderLayers(); });
      return b;
    }
    srow.append(
      tbtn('<b>B</b>', function () { return L.bold; }, function () { L.bold = !L.bold; }),
      tbtn('<i>I</i>', function () { return L.italic; }, function () { L.italic = !L.italic; }),
      tbtn('<u>U</u>', function () { return L.underline; }, function () { L.underline = !L.underline; }),
      tbtn('<s>S</s>', function () { return L.strike; }, function () { L.strike = !L.strike; }),
    );
    var arow = el('div', { class: 'dz-tstyle' });
    ['left', 'center', 'right'].forEach(function (a) {
      var b = el('button', { class: 'dz-tbtn' + ((L.align || 'center') === a ? ' is-on' : ''), type: 'button' }); b.innerHTML = AL_SVG[a];
      b.addEventListener('click', function () { L.align = a; arow.querySelectorAll('.dz-tbtn').forEach(function (n) { n.classList.remove('is-on'); }); b.classList.add('is-on'); renderLayers(); });
      arow.appendChild(b);
    });
    var twrap = el('div', { class: 'dz-trow2' }, srow, arow);
    card.appendChild(field('스타일 · 정렬', twrap));

    // 색상 팔레트 + 직접선택
    var pal = el('div', { class: 'dz-tpal' });
    TEXT_PALETTE.forEach(function (hex) {
      var sw = el('div', { class: 'dz-tpsw' + (hex.toLowerCase() === String(L.color).toLowerCase() ? ' is-on' : ''), title: hex, style: 'background:' + hex });
      sw.addEventListener('click', function () { L.color = hex; pal.querySelectorAll('.dz-tpsw').forEach(function (n) { n.classList.remove('is-on'); }); sw.classList.add('is-on'); renderLayers(); });
      pal.appendChild(sw);
    });
    var custom = el('input', { class: 'dz-tpcustom', type: 'color', value: toHex(L.color), title: '직접 선택' });
    custom.addEventListener('input', function () { L.color = custom.value; pal.querySelectorAll('.dz-tpsw').forEach(function (n) { n.classList.remove('is-on'); }); renderLayers(); });
    pal.appendChild(custom);
    card.appendChild(field('글씨 색상', pal));

    // 문자/행 간격
    var g = el('div', { class: 'dz-row' });
    g.append(
      fieldInline('문자 간격', stepper(L.ls || 0, 0.05, -0.3, 3, function (v) { L.ls = v; renderLayers(); })),
      fieldInline('행 간격', stepper(L.lh || 1.2, 0.1, 0.6, 3, function (v) { L.lh = v; renderLayers(); })),
    );
    card.appendChild(g);
    // 회전 + 패턴
    var g2 = el('div', { class: 'dz-row' });
    g2.append(
      fieldInline('회전', stepper(L.rot || 0, 5, -180, 180, function (v) { L.rot = v; renderLayers(); }, '°')),
      fieldInline('패턴 가로', stepper(L.patc || 1, 1, 1, 5, function (v) { L.patc = v; L.h = textBoxH(L); renderLayers(); })),
      fieldInline('패턴 세로', stepper(L.patr || 1, 1, 1, 5, function (v) { L.patr = v; L.h = textBoxH(L); renderLayers(); })),
    );
    card.appendChild(g2);
    propsBox.appendChild(card);
  }
  // 이미지 레이어 속성 — 색 변경(recolor). 단색 도안/패치를 원하는 색으로(투명 보존).
  function renderImageProps(L) {
    var card = el('div', { class: 'dz-card' });
    card.appendChild(el('div', { class: 'dz-card__t' }, '이미지 설정'));
    var pal = el('div', { class: 'dz-tpal' });
    var orig = el('div', { class: 'dz-tpsw dz-tpsw--orig' + (!L.tint ? ' is-on' : ''), title: '원본 색' });
    orig.addEventListener('click', function () { L.tint = null; renderProps(); renderLayers(); });
    pal.appendChild(orig);
    TEXT_PALETTE.forEach(function (hex) {
      var sw = el('div', { class: 'dz-tpsw' + (L.tint && hex.toLowerCase() === String(L.tint).toLowerCase() ? ' is-on' : ''), title: hex, style: 'background:' + hex });
      sw.addEventListener('click', function () { L.tint = hex; pal.querySelectorAll('.dz-tpsw').forEach(function (n) { n.classList.remove('is-on'); }); sw.classList.add('is-on'); renderLayers(); });
      pal.appendChild(sw);
    });
    var custom = el('input', { class: 'dz-tpcustom', type: 'color', value: toHex(L.tint || '#8b5cf6'), title: '직접 선택' });
    custom.addEventListener('input', function () { L.tint = custom.value; pal.querySelectorAll('.dz-tpsw').forEach(function (n) { n.classList.remove('is-on'); }); renderLayers(); });
    pal.appendChild(custom);
    card.appendChild(field('색 변경', pal));
    card.appendChild(el('div', { class: 'dz-hint', style: 'text-align:left;margin-top:4px' }, '단색 도안·패치에 색을 입힐 수 있어요. (사진은 한 색으로 칠해집니다)'));
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
      var del = el('button', { class: 'dz-litem__b', title: '삭제', type: 'button' }, '✕');
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

      drawBase(function () { loadMask(function (maskImg) { loadLayers(maskImg); }); });

      // 베이스 목업(PNG 우선, 없으면 SVG 폴백)
      function drawBase(cb) {
        var base = mockupSrc(view);
        if (!base) { drawSvg(cb); return; }
        var png = new Image();
        png.onload = function () { ctx.drawImage(png, 0, 0, CW, CH); cb(); };
        png.onerror = function () { // 색상 이미지 없으면 흰색 베이스 → 그래도 없으면 SVG
          var fb = baseMockupSrc(view);
          if (fb && fb !== base) { var p2 = new Image(); p2.onload = function () { ctx.drawImage(p2, 0, 0, CW, CH); cb(); }; p2.onerror = function () { drawSvg(cb); }; p2.src = fb; }
          else drawSvg(cb);
        };
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
      function loadLayers(maskImg) {
        var ls = S.views[view] || [];
        var imgs = ls.filter(function (L) { return L.type === 'image'; });
        var pending = imgs.length;
        if (!pending) { paint(maskImg, ls); return; }
        imgs.forEach(function (L) {
          var im = imgCache[L.id];
          if (im && im.complete && im.naturalWidth) { if (--pending === 0) paint(maskImg, ls); return; }
          var n = new Image();
          n.crossOrigin = 'anonymous';
          n.onload = function () { imgCache[L.id] = n; if (--pending === 0) paint(maskImg, ls); };
          n.onerror = function () { if (--pending === 0) paint(maskImg, ls); };
          n.src = L.src;
        });
      }
      // 레이어를 별도 캔버스에 그린 뒤 제품 실루엣 마스크로 클리핑 → 베이스에 합성.
      function paint(maskImg, ls) {
        var lc = document.createElement('canvas'); lc.width = CW; lc.height = CH;
        var lx = lc.getContext('2d');
        ls.forEach(function (L) {
          var cx = L.x / 100 * CW, cy = L.y / 100 * CH;
          lx.save();
          lx.translate(cx, cy);
          if (L.rot) lx.rotate(L.rot * Math.PI / 180);
          if (L.flipH || L.flipV) lx.scale(L.flipH ? -1 : 1, L.flipV ? -1 : 1);
          if (L.type === 'image') {
            var im2 = imgCache[L.id];
            if (im2 && im2.naturalWidth) {
              var w = L.w / 100 * CW, h = L.h / 100 * CH;
              if (L.tint) {
                // 색 변경: 이미지 알파를 마스크로 단색 칠
                try {
                  var tc = document.createElement('canvas');
                  tc.width = Math.max(1, Math.round(w)); tc.height = Math.max(1, Math.round(h));
                  var tx2 = tc.getContext('2d');
                  tx2.drawImage(im2, 0, 0, tc.width, tc.height);
                  tx2.globalCompositeOperation = 'source-in';
                  tx2.fillStyle = L.tint; tx2.fillRect(0, 0, tc.width, tc.height);
                  lx.drawImage(tc, -w / 2, -h / 2, w, h);
                } catch (_) {}
              } else {
                try { lx.drawImage(im2, -w / 2, -h / 2, w, h); } catch (_) {}
              }
            }
          } else {
            var fs = L.font / 100 * CH;
            lx.font = (L.italic ? 'italic ' : '') + (L.bold ? '800 ' : '500 ') + fs + 'px ' + (L.family || "'Pretendard', sans-serif");
            lx.fillStyle = L.color || '#222';
            lx.textAlign = L.align || 'center'; lx.textBaseline = 'middle';
            try { lx.letterSpacing = (L.ls || 0) + 'em'; } catch (_) {}
            var lines = String(L.text || '').split('\n');
            var lh = fs * (L.lh || 1.2);
            var boxW = L.w / 100 * CW, boxH = L.h / 100 * CH;
            var pc = Math.max(1, Math.min(5, L.patc || 1)), prr = Math.max(1, Math.min(5, L.patr || 1));
            for (var ri = 0; ri < prr; ri++) {
              for (var ci = 0; ci < pc; ci++) {
                var cellX = pc > 1 ? (-boxW / 2 + boxW * (ci + 0.5) / pc) : 0;
                var cellY = prr > 1 ? (-boxH / 2 + boxH * (ri + 0.5) / prr) : 0;
                var ax = cellX + (L.align === 'left' ? -boxW / (2 * pc) + 4 : L.align === 'right' ? boxW / (2 * pc) - 4 : 0);
                var sy = cellY - (lines.length - 1) * lh / 2;
                lines.forEach(function (ln, idx) {
                  lx.fillText(ln, ax, sy + idx * lh);
                  if (L.underline || L.strike) {
                    var tw = lx.measureText(ln).width;
                    var x0 = lx.textAlign === 'center' ? ax - tw / 2 : lx.textAlign === 'right' ? ax - tw : ax;
                    lx.save(); lx.strokeStyle = L.color || '#222'; lx.lineWidth = Math.max(1, fs * 0.06);
                    if (L.underline) { lx.beginPath(); lx.moveTo(x0, sy + idx * lh + fs * 0.42); lx.lineTo(x0 + tw, sy + idx * lh + fs * 0.42); lx.stroke(); }
                    if (L.strike) { lx.beginPath(); lx.moveTo(x0, sy + idx * lh); lx.lineTo(x0 + tw, sy + idx * lh); lx.stroke(); }
                    lx.restore();
                  }
                });
              }
            }
            try { lx.letterSpacing = '0em'; } catch (_) {}
          }
          lx.restore();
        });
        if (maskImg) { lx.globalCompositeOperation = 'destination-in'; lx.drawImage(maskImg, 0, 0, CW, CH); }
        ctx.drawImage(lc, 0, 0);
        // 외부 출처 이미지가 캔버스를 오염시키면 toDataURL 이 throw → 콜백이 멈추지 않도록 null 반환.
        var url = null;
        try { url = canvas.toDataURL('image/png'); } catch (_) { url = null; }
        resolve(url);
      }
    });
  }

  // 파일명 안전화(괄호·슬래시 등 파일시스템 위험문자 제거)
  function safeName(s) { return (String(s == null ? '' : s).replace(/[\\/:*?"<>|()]+/g, '').trim().slice(0, 60)) || 'design'; }

  // ---- 다운로드 ---------------------------------------------------------------
  function downloadDesign() {
    composite(S.view, 1200).then(function (url) {
      if (!url) { toast('이미지를 만들지 못했어요'); return; }
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
      S.slug = (d.category && PRODUCTS[d.category]) ? d.category : (S.slug && PRODUCTS[S.slug] ? S.slug : 'tshirt');
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
      S.description = dz.description || ''; // 설명 모드 복원
      S.descPhotos = Array.isArray(dz.photos) ? dz.photos.slice(0, 5) : [];
      // 이미지 캐시 재생성 + seq 보정
      imgCache = {}; var maxSeq = 0;
      Object.keys(S.views).forEach(function (v) {
        (S.views[v] || []).forEach(function (L) {
          var n = parseInt(String(L.id).replace(/\D/g, ''), 10); if (n > maxSeq) maxSeq = n;
          if (L.type === 'image') { var im = new Image(); im.crossOrigin = 'anonymous'; im.src = L.src; imgCache[L.id] = im; }
        });
      });
      S.seq = maxSeq;
      resetHistory();
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
  var dzFitBtn = null, dzDesignBtn = null, dzDesignOut = null, dzFitOut = null, dzFitGender = null, dzFitBg = null;
  // 우측 패널: 완성하기(저장)만.
  function completeBlock() {
    return btn('완성하기 — 디자인 저장', 'primary', finishDesign, 'dz-complete');
  }
  // 하단 AI 영역 — 좌(도면 보기) | 우(가상피팅 보기). 결과는 팝업이 아니라 이 자리에 인라인 생성·유지.
  function aiSection() {
    var apparel = isApparel();
    var sec = el('div', { class: 'dz-aisec' });

    // 좌: 도면 보기
    var left = el('div', { class: 'dz-aisec__col' });
    left.append(
      el('div', { class: 'dz-aisec__t' }, '도면 보기'),
      el('div', { class: 'dz-aisec__s' }, apparel ? '앞·뒤·옆 등 디자인한 모든 면을 AI로 합성해 실제 옷 도면을 만들어요.' : '디자인으로 실제 ' + (S.product || '굿즈') + ' 이미지를 만들어요.'),
    );
    dzDesignBtn = btn('도면 생성', 'primary', runAiDesign, 'dz-aisec__go');
    left.appendChild(dzDesignBtn);
    dzDesignOut = el('div', { class: 'dz-aiout' });
    if (S.aiDesign) aiOutResult(dzDesignOut, S.aiDesign, '도면');
    left.appendChild(dzDesignOut);

    // 우: 가상피팅(의류) / 가상 전시(굿즈) — 도면 생성 전엔 잠금.
    var right = el('div', { class: 'dz-aisec__col' });
    right.append(
      el('div', { class: 'dz-aisec__t' }, apparel ? '가상피팅 보기' : '가상 전시 보기'),
      el('div', { class: 'dz-aisec__s' }, apparel ? '왼쪽에서 만든 옷을 모델이 착용한 모습(얼굴 없음).' : '제품을 전시한 모습을 만들어요.'),
    );
    var opts = el('div', { class: 'dz-row' });
    if (apparel) {
      dzFitGender = el('select', { class: 'dz-select' });
      [['female', '여성'], ['male', '남성']].forEach(function (o) { dzFitGender.appendChild(el('option', { value: o[0] }, o[1])); });
      opts.appendChild(fieldInline('모델', dzFitGender));
    } else { dzFitGender = null; }
    dzFitBg = el('select', { class: 'dz-select' });
    [['studio', '스튜디오'], ['campus', '캠퍼스'], ['outdoor', '야외']].forEach(function (o) { dzFitBg.appendChild(el('option', { value: o[0] }, o[1])); });
    opts.appendChild(fieldInline('배경', dzFitBg));
    right.appendChild(opts);
    dzFitBtn = btn(apparel ? '가상피팅 생성' : '가상 전시 생성', 'primary', runAiFitting, 'dz-aisec__go');
    right.appendChild(dzFitBtn);
    dzFitOut = el('div', { class: 'dz-aiout' });
    if (S.aiFitting) aiOutResult(dzFitOut, S.aiFitting, apparel ? '가상피팅' : '전시');
    right.appendChild(dzFitOut);

    sec.append(left, right);
    setFitLock();
    return sec;
  }
  function setFitLock() {
    if (!dzFitBtn) return;
    var locked = !S.aiDesign;
    dzFitBtn.disabled = locked;
    dzFitBtn.classList.toggle('is-locked', locked);
    dzFitBtn.title = locked ? '먼저 왼쪽 ‘도면 생성’을 해주세요' : '';
  }
  // 인라인 결과 렌더(팝업 X) — 로딩/결과(이미지+다운로드+펀딩)/에러.
  function aiOutLoading(out, msg) {
    out.replaceChildren(el('div', { class: 'dz-status' }, el('span', { class: 'dz-spin' }), msg || 'AI가 이미지를 생성하고 있어요. 잠시만 기다려 주세요…'));
  }
  function aiOutResult(out, url, label) {
    out.replaceChildren(
      el('img', { class: 'dz-aiout__img', src: url, alt: label || 'AI 결과' }),
      el('div', { class: 'dz-aiout__foot' },
        btn('이미지 다운로드', 'outline', function () {
          var a = el('a', { href: url, download: '두띵-' + safeName(S.title) + '-' + safeName(label || 'AI') + '.png' });
          document.body.appendChild(a); a.click(); a.remove();
        }),
        btn('이 디자인으로 펀딩 만들기', 'primary', function () {
          try { sessionStorage.setItem('dt_design_handoff', JSON.stringify({ image: url, category: S.slug, product: S.product, title: S.title })); } catch (_) {}
          location.href = '/fund-create.html?category=' + encodeURIComponent(S.slug);
        }),
      ),
    );
  }
  function aiOutError(out, err) {
    if (err && err.status === 401) { location.href = '/login.html'; return; }
    var msg = (err && (err.status === 400 || err.status === 404 || err.status === 503))
      ? 'AI 생성이 아직 연결되지 않았어요. 디자인은 저장/다운로드할 수 있어요.'
      : 'AI 생성에 실패했어요: ' + ((err && err.message) || '오류');
    out.replaceChildren(el('div', { class: 'dz-status' }, msg));
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
  // 디자인 있는 모든 면(앞/뒤/좌/우/넥)을 합성해 배열로 반환 — AI 에 전부 전달(blueprint 최대 5장).
  function compositeArtViews(pxW) {
    var withArt = views().filter(function (v) { return (S.views[v] || []).length > 0; });
    var list = (withArt.length ? withArt : [primaryView()]).slice(0, 5);
    return Promise.all(list.map(function (v) { return composite(v, pxW); })).then(function (urls) {
      return { urls: urls, faces: list };
    });
  }
  // 좌: 도면 생성 — 디자인 있는 모든 면 합성 → /ai/blueprint. 결과는 dzDesignOut 에 인라인.
  function runAiDesign() {
    if (!hasArt()) { toast('이미지나 텍스트를 먼저 추가해 주세요'); return; }
    aiOutLoading(dzDesignOut, '앞·뒤·옆 디자인을 AI로 합성하고 있어요…');
    if (dzDesignBtn) dzDesignBtn.disabled = true;
    // 새 도면을 만들면 이전 가상피팅은 무효 → 잠금/비움.
    S.aiFitting = null; if (dzFitOut) dzFitOut.replaceChildren();
    compositeArtViews(1000).then(function (r) {
      var saveBody = { category: S.slug, product: S.product, title: S.title, design: serialize(), preview: r.urls[0] };
      (S.designId ? window.api.patch('/me/designs/' + S.designId, saveBody) : window.api.post('/me/designs', saveBody))
        .then(function (rr) { if (rr && rr.id) S.designId = rr.id; }).catch(function () {});
      return window.api.post('/ai/blueprint', { imageDataUrls: r.urls, faces: r.faces, category: S.slug, product: S.product });
    }).then(function (res) {
      var url = res && (res.blueprintDataUrl || res.imageDataUrl || res.url);
      if (!url) throw new Error('NO_RESULT');
      S.aiDesign = url; setFitLock();
      if (S.designId) window.api.patch('/me/designs/' + S.designId, { aiImage: url }).catch(function () {});
      aiOutResult(dzDesignOut, url, '도면');
    }).catch(function (err) { aiOutError(dzDesignOut, err); })
      .finally(function () { if (dzDesignBtn) dzDesignBtn.disabled = false; });
  }

  // 우: 가상피팅/전시 — 왼쪽 도면(S.aiDesign) 기준 → /ai/try-on. 결과는 dzFitOut 에 인라인. 도면 전엔 잠금.
  function runAiFitting() {
    if (!S.aiDesign) { toast('먼저 왼쪽 ‘도면 생성’을 해주세요'); return; }
    var apparel = isApparel();
    aiOutLoading(dzFitOut, apparel ? '모델이 착용한 모습을 생성하고 있어요…' : '전시 이미지를 생성하고 있어요…');
    if (dzFitBtn) dzFitBtn.disabled = true;
    var aiBody = { imageDataUrls: [S.aiDesign], background: dzFitBg ? dzFitBg.value : 'studio', category: S.slug, faceless: true };
    if (apparel) aiBody.modelType = dzFitGender ? dzFitGender.value : 'female';
    window.api.post('/ai/try-on', aiBody).then(function (res) {
      var url = res && (res.tryOnDataUrl || res.imageDataUrl || res.url);
      if (!url) throw new Error('NO_RESULT');
      S.aiFitting = url;
      aiOutResult(dzFitOut, url, apparel ? '가상피팅' : '전시');
    }).catch(function (err) { aiOutError(dzFitOut, err); })
      .finally(function () { if (dzFitBtn) dzFitBtn.disabled = !S.aiDesign; });
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
      el('div', { class: 'dz-modal__t' }, (label || 'AI') + ' 완성'),
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
      S.slug = 'tshirt'; // loadDesign 폴백용 안전 기본값(d.category 가 유효하면 덮어씀)
      root.replaceChildren(el('div', { class: 'dz-wrap' },
        el('div', { class: 'dz-status' }, el('span', { class: 'dz-spin' }), '디자인을 불러오는 중…')));
      loadDesign(loadId);
      return;
    }

    // ?category= 는 slug(jacket..) 또는 라벨(반팔티..) 둘 다 허용 → slug 로 정규화.
    var q = qs('category') || 'tshirt';
    var norm = window.dtCategory(q) ? window.dtCategory(q).slug : q;
    if (!supportsDesign(norm)) { // 웹·앱·기타 등 미지원 카테고리 → 에디터 안 염
      root.replaceChildren(el('div', { class: 'dz-wrap' },
        el('div', { class: 'dz-describe', style: 'text-align:center' },
          el('div', { class: 'dz-describe__t' }, '디자인하기 미지원 카테고리'),
          el('div', { class: 'dz-describe__s' }, '이 카테고리(웹·앱/기타)는 디자인하기를 지원하지 않아요. 다른 카테고리를 선택해 주세요.'),
          btn('카테고리 선택으로', 'primary', function () { location.href = '/fund-create.html'; }, 'dz-describe__go'))));
      return;
    }
    S.slug = norm;
    S.catObj = window.dtCategory(S.slug);
    S.itemIdx = 0;
    S.product = curItem().name;
    S.color = '#ffffff';
    S.view = views()[0];
    S.views = {}; views().forEach(function (v) { S.views[v] = []; });
    S.title = (S.catObj ? S.catObj.label : '내') + ' 디자인';
    resetHistory();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
