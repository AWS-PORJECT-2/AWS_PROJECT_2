/**
 * 디자인하기 에디터 — 마플 스타일 상품 커스터마이즈.
 *
 *  - 카테고리·상품별 사진 목업(/assets/mockups/<img>_<view>.png, 1248² 1:1). 없으면 SVG 폴백.
 *  - 카테고리 내 상품 변형(후드↔맨투맨, 텀블러↔머그, 키링 모양 등) + 다면(앞/뒤/좌/우/넥/전개도).
 *  - 레이어: 이미지 업로드 + 텍스트. 캔버스 위에서 드래그/리사이즈/삭제, 레이어 패널로 순서/선택.
 *  - 옵션: 상품 종류 · 색상(주문 메타). 면별 독립 레이어.
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

  // 목업/마스크 캐시버스터 — 이미지·마스크 갱신할 때마다 올린다(브라우저·CloudFront 캐시 무력화).
  var ASSET_VER = '8';
  function av(u) { return u ? u + (u.indexOf('?') < 0 ? '?v=' : '&v=') + ASSET_VER : u; }

  // ---- 카테고리별 상품 정의 ---------------------------------------------------
  // 각 카테고리 → { type, items:[{ name, img, views, print:{view:{l,t,w,h}} }] }
  //   type: 'apparel'(가상피팅) | 'goods'(전시) | 'none'
  //   img : /assets/mockups/<img>_<view>.png 베이스 이름. null 이면 SVG 폴백.
  //   views: 제공되는 면(front/back/left/right/neck/wrap). print: 면별 인쇄영역(캔버스 대비 %).
  var AP = ['front', 'back', 'left', 'right'];
  function pr(l, t, w, h) { return { l: l, t: t, w: w, h: h }; }
  // 인쇄영역(캔버스 대비 %)은 실제 목업 이미지의 제품 위치를 픽셀 분석 + 시각 검수로 맞춤.
  // 색상 팔레트(사용자 제공 실사 색상 이미지 기준). {s:slug, n:한글명, h:스와치hex}.
  //  파일: /assets/mockups/<img>_<view>__<slug>.jpg (첫 항목이 기본색).
  var C_JACKET = [{s:'black',n:'블랙',h:'#171817'}, {s:'charcoal',n:'차콜',h:'#434243'}, {s:'navy',n:'네이비',h:'#182033'}, {s:'royalblue',n:'로얄블루',h:'#123b8b'}, {s:'burgundy',n:'버건디',h:'#4d181e'}, {s:'red',n:'레드',h:'#b20710'}, {s:'forestgreen',n:'포레스트그린',h:'#273229'}, {s:'olive',n:'올리브',h:'#545135'}, {s:'camel',n:'카멜',h:'#caa580'}, {s:'gray',n:'라이트그레이',h:'#bfbfc1'}];
  var C_HOODIE = [{s:'white',n:'화이트',h:'#fafafa'}, {s:'heathergray',n:'헤더그레이',h:'#c6c5c4'}, {s:'black',n:'블랙',h:'#1d1d1c'}, {s:'charcoal',n:'차콜',h:'#454546'}, {s:'navy',n:'네이비',h:'#212940'}, {s:'cream',n:'크림',h:'#f4e7d1'}, {s:'oatmeal',n:'오트밀',h:'#eee6dd'}, {s:'forestgreen',n:'포레스트그린',h:'#284234'}, {s:'burgundy',n:'버건디',h:'#6b2235'}, {s:'skyblue',n:'스카이블루',h:'#a3bfdb'}, {s:'dustypink',n:'더스티핑크',h:'#e0a6a5'}];
  var C_SWEAT = [{s:'white',n:'화이트',h:'#fafafa'}, {s:'heathergray',n:'헤더그레이',h:'#c9c9c9'}, {s:'black',n:'블랙',h:'#1d1d1d'}, {s:'charcoal',n:'차콜',h:'#404041'}, {s:'navy',n:'네이비',h:'#1e263b'}, {s:'cream',n:'크림',h:'#faf2e6'}, {s:'oatmeal',n:'오트밀',h:'#ece4d8'}, {s:'forestgreen',n:'포레스트그린',h:'#324837'}, {s:'burgundy',n:'버건디',h:'#5a1d2a'}, {s:'skyblue',n:'스카이블루',h:'#b0d1ee'}, {s:'dustypink',n:'더스티핑크',h:'#e0adaf'}];
  var C_TSHIRT = [{s:'white',n:'화이트',h:'#f8f8f9'}, {s:'black',n:'블랙',h:'#181818'}, {s:'heathergray',n:'헤더그레이',h:'#d0d0cf'}, {s:'charcoal',n:'차콜',h:'#3e3e41'}, {s:'navy',n:'네이비',h:'#172239'}, {s:'cream',n:'크림',h:'#fbf2e2'}, {s:'beige',n:'베이지',h:'#e7dacb'}, {s:'forestgreen',n:'포레스트그린',h:'#2d3d30'}, {s:'skyblue',n:'스카이블루',h:'#b9d5f3'}, {s:'dustypink',n:'더스티핑크',h:'#dba5a9'}];
  var C_ECOBAG = [{s:'natural',n:'내추럴캔버스',h:'#eddfcb'}, {s:'ivory',n:'아이보리',h:'#f2e8d9'}, {s:'oatmeal',n:'오트밀',h:'#e6d8c5'}, {s:'sand',n:'샌드베이지',h:'#dcc9b1'}, {s:'greige',n:'그레이지',h:'#c5b6a6'}, {s:'mocha',n:'모카브라운',h:'#5e4536'}, {s:'olivekhaki',n:'올리브카키',h:'#7d7251'}, {s:'deepnavy',n:'딥네이비',h:'#242d44'}, {s:'charcoal',n:'차콜',h:'#4f4e4f'}, {s:'black',n:'블랙',h:'#282827'}];
  var C_PHONE = [{s:'black',n:'블랙',h:'#3b3b3a'}, {s:'darkgray',n:'다크그레이',h:'#555556'}, {s:'cream',n:'크림',h:'#d7ccc0'}, {s:'beige',n:'베이지',h:'#f3ebdc'}, {s:'burgundy',n:'버건디',h:'#e8c9c6'}, {s:'lavender',n:'라벤더',h:'#ccc1e0'}, {s:'sagegreen',n:'세이지그린',h:'#9da490'}, {s:'navy',n:'네이비',h:'#455247'}, {s:'babyblue',n:'베이비블루',h:'#c4d9ed'}, {s:'blushpink',n:'블러시핑크',h:'#682b3a'}, {s:'clear',n:'투명',h:'#ebe9ea'}];
  var C_TUMBLER = [{s:'black',n:'블랙',h:'#2d2d2c'}, {s:'ivory',n:'아이보리',h:'#e3dac6'}, {s:'tan',n:'탄',h:'#c9b89f'}, {s:'sage',n:'세이지',h:'#8d9b81'}, {s:'darkgreen',n:'다크그린',h:'#30422f'}, {s:'navy',n:'네이비',h:'#15263c'}, {s:'skyblue',n:'스카이블루',h:'#8db1cc'}, {s:'lavender',n:'라벤더',h:'#c5b8d9'}, {s:'dustypink',n:'더스티핑크',h:'#e6b5af'}, {s:'burgundy',n:'버건디',h:'#551521'}];

  var PRODUCTS = {
    jacket: { type: 'apparel', items: [
      { name: '바시티 자켓', img: 'varsity_jacket', views: AP, colors: C_JACKET,
        print: { front: pr(31, 23, 38, 56), back: pr(29, 18, 42, 62), left: pr(40, 26, 20, 24), right: pr(40, 26, 20, 24) } },
    ] },
    hoodie: { type: 'apparel', items: [
      { name: '후드티', img: 'hoodie', views: AP, colors: C_HOODIE,
        print: { front: pr(31, 47, 38, 33), back: pr(30, 18, 40, 60), left: pr(40, 26, 20, 24), right: pr(40, 26, 20, 24) } },
      { name: '맨투맨', img: 'sweatshirt', views: AP, colors: C_SWEAT,
        print: { front: pr(30, 22, 40, 58), back: pr(29, 22, 42, 57), left: pr(40, 26, 20, 24), right: pr(40, 26, 20, 24) } },
    ] },
    tshirt: { type: 'apparel', items: [
      { name: '반팔티', img: 'tshirt', views: ['front', 'back', 'left', 'right', 'neck'], colors: C_TSHIRT,
        print: { front: pr(29, 18, 42, 66), back: pr(29, 17, 42, 68), left: pr(40, 26, 20, 24), right: pr(40, 26, 20, 24), neck: pr(36, 40, 28, 14) } },
    ] },
    ecobag: { type: 'goods', items: [
      { name: '에코백', img: 'ecobag', views: ['front', 'back'], colors: C_ECOBAG, print: { front: pr(30, 37, 40, 40), back: pr(30, 37, 40, 40) } },
    ] },
    keyring: { type: 'goods', items: [
      { name: '하트 키링', img: 'keyring_heart', views: ['front'], print: { front: pr(30, 32, 40, 36) } },
      { name: '별 키링', img: 'keyring_star', views: ['front'], print: { front: pr(30, 34, 40, 32) } },
      { name: '육각형 키링', img: 'keyring_hexagon', views: ['front'], print: { front: pr(30, 32, 40, 40) } },
      { name: '티켓 키링', img: 'keyring_ticket', views: ['front'], print: { front: pr(28, 34, 44, 34) } },
      { name: '알약 키링', img: 'keyring_pill', views: ['front'], print: { front: pr(32, 32, 36, 38) } },
      { name: '아치 키링', img: 'keyring_arch', views: ['front'], print: { front: pr(30, 36, 40, 36) } },
      { name: '클로버 키링', img: 'keyring_clover', views: ['front'], print: { front: pr(32, 34, 36, 36) } },
      { name: '구름 키링', img: 'keyring_cloud', views: ['front'], print: { front: pr(28, 36, 44, 30) } },
      { name: '곰 키링', img: 'keyring_bear', views: ['front'], print: { front: pr(30, 36, 40, 34) } },
      { name: '롱태그 키링', img: 'keyring_longtag', views: ['front'], print: { front: pr(32, 36, 36, 30) } },
    ] },
    phonecase: { type: 'goods', items: [
      { name: '폰케이스', img: 'phonecase', views: ['back'], colors: C_PHONE, print: { back: pr(33, 15, 34, 66) } },
    ] },
    sticker: { type: 'goods', items: [
      { name: '스티커', img: 'sticker_sheet', views: ['front'], print: { front: pr(18, 14, 64, 74) } },
    ] },
    badge: { type: 'goods', items: [
      { name: '뱃지', img: 'badge', views: ['front'], print: { front: pr(26, 32, 48, 36) } },
    ] },
    tumbler: { type: 'goods', items: [
      { name: '텀블러', img: 'tumbler', views: ['front'], colors: C_TUMBLER, print: { front: pr(37, 20, 24, 54) } },
      { name: '머그컵', img: 'mug', views: ['front'], print: { front: pr(34, 34, 28, 30) } },
    ] },
    fabric: { type: 'goods', items: [
      { name: '담요', img: 'blanket', views: ['front'], print: { front: pr(24, 18, 52, 62) } },
    ] },
    // 인형·액세서리·웹앱·기타는 디자인하기 미지원 — PRODUCTS 에서 제외(에디터 안 열림, 만들기서 잠금).
  };
  function catDef(slug) { return PRODUCTS[slug] || PRODUCTS.tshirt; }
  function supportsDesign(slug) { return !!PRODUCTS[slug]; }
  function curItem() { return catDef(S.slug).items[S.itemIdx] || catDef(S.slug).items[0]; }
  function isApparel() { return catDef(S.slug).type === 'apparel'; }

  // 색상 — 아이템별 팔레트(curItem().colors). S.color = 선택 slug, 기본 = 첫 색.
  function itemColors() { return curItem().colors || []; }
  function colorable() { return itemColors().length > 0; }
  function defaultColor() { var c = itemColors(); return c.length ? c[0].s : ''; }
  function colorHex() { var c = itemColors(); for (var i = 0; i < c.length; i++) if (c[i].s === S.color) return c[i].h; return c.length ? c[0].h : '#e9e9ee'; }

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
    var k = colorable() ? (S.color || defaultColor()) : '';
    return av('/assets/mockups/' + it.img + '_' + view + (k ? '__' + k : '') + '.jpg');
  }
  function baseMockupSrc(view) { var it = curItem(); return it.img ? av('/assets/mockups/' + it.img + '_' + view + '.jpg') : null; }
  // 옷/제품 실루엣 마스크(알파 PNG, 제품=불투명·배경=투명). 레이어를 이 모양으로 클리핑 → 제품 밖은 잘림.
  function maskSrc(view) {
    var it = curItem();
    return it.img ? av('/assets/mockups/' + it.img + '_' + view + '_mask.png') : null;
  }
  function applyMaskCss(node, src) {
    if (!src) return;
    var c = 'url("' + src + '")';
    node.style.webkitMaskImage = c; node.style.maskImage = c;
    node.style.webkitMaskSize = '100% 100%'; node.style.maskSize = '100% 100%';
    node.style.webkitMaskRepeat = 'no-repeat'; node.style.maskRepeat = 'no-repeat';
  }

  // ---- 목업 SVG 폴백(이미지 없는 webapp/etc, 또는 로드 실패 시) -----------------
  function goodsSvg() {
    var stroke = '#cfcfd6';
    var inner = '<rect x="40" y="40" width="420" height="420" rx="44" fill="' + colorHex() + '" stroke="' + stroke + '" stroke-width="3"/>'
      + '<image href="/assets/' + S.slug + '.png" x="150" y="150" width="200" height="200" opacity="0.10" preserveAspectRatio="xMidYMid meet"/>';
    return '<svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' + inner + '</svg>';
  }
  function mockSvg() { return goodsSvg(); }
  function canvasAspect() { return 1; } // 모든 목업 1:1(1248²)

  // ---- 상태 -------------------------------------------------------------------
  var S = {
    slug: '', catObj: null, itemIdx: 0,
    product: '', color: '', qty: 1,
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
        btn('내 디자인 보기', 'outline', openLoadModal),
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
    S.color = defaultColor(); // 아이템마다 팔레트가 다름 → 첫 색으로 리셋
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

  // ---- 옵션 카드(상품/색) ----------------------------------------
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
      itemColors().forEach(function (c) {
        var d = el('div', { class: 'dz-sw' + (c.s === S.color ? ' is-on' : ''), title: c.n, style: 'background:' + c.h });
        d.addEventListener('click', function () {
          S.color = c.s;
          sw.querySelectorAll('.dz-sw').forEach(function (n) { n.classList.remove('is-on'); });
          d.classList.add('is-on');
          repaintMock(); // 선택 색 실사 이미지로 교체
        });
        sw.appendChild(d);
      });
      card.appendChild(field('색상', sw));
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
        var png = new Image(); png.crossOrigin = 'anonymous';
        png.onload = function () { ctx.drawImage(png, 0, 0, CW, CH); cb(); };
        png.onerror = function () { // 색상 이미지 없으면 흰색 베이스 → 그래도 없으면 SVG
          var fb = baseMockupSrc(view);
          if (fb && fb !== base) { var p2 = new Image(); p2.crossOrigin = 'anonymous'; p2.onload = function () { ctx.drawImage(p2, 0, 0, CW, CH); cb(); }; p2.onerror = function () { drawSvg(cb); }; p2.src = fb; }
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
        var mi = new Image(); mi.crossOrigin = 'anonymous'; mi.onload = function () { cb(mi); }; mi.onerror = function () { cb(null); }; mi.src = msrc;
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
    return { product: S.product, itemIdx: S.itemIdx, color: S.color, qty: S.qty, views: S.views, version: 2 };
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
      // 저장 한도(5개) 초과 — "꽉 찼어요" 안내 후 [내 디자인 보기]로 유도.
      if (err && err.status === 409) { toast((err.message || '내 디자인이 꽉 찼어요. 삭제 후 저장할 수 있어요.')); return; }
      toast('저장에 실패했어요: ' + ((err && err.message) || '오류'));
    }).finally(function () { if (btnEl) btnEl.disabled = false; });
  }

  // '내 디자인' 모달 — 저장본을 [불러오기]/[삭제하기]. 삭제는 즉시 반영(새로고침 불필요), 상단에 n/5 표시.
  var MAX_DESIGNS = 5;
  function openLoadModal() {
    var overlay = el('div', { class: 'dz-modal' });
    var box = el('div', { class: 'dz-modal__box' });
    overlay.appendChild(box);
    overlay.addEventListener('pointerdown', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    function paint(items) {
      var head = el('div', { class: 'dz-modal__t' }, '내 디자인 ' + items.length + ' / ' + MAX_DESIGNS);
      var sub = el('div', { class: 'dz-modal__s' }, items.length >= MAX_DESIGNS
        ? '저장 공간이 꽉 찼어요. 삭제하면 새로 저장할 수 있어요.'
        : '불러오기로 이어서 편집하거나 삭제할 수 있어요. (최대 ' + MAX_DESIGNS + '개)');
      var kids = [head, sub];
      if (!items.length) {
        kids.push(el('div', { class: 'dz-status' }, '아직 저장한 디자인이 없어요.'));
      } else {
        var listWrap = el('div', { class: 'dz-saved' });
        items.forEach(function (it) {
          var card = el('div', { class: 'dz-saved__item' });
          card.appendChild(el('img', { class: 'dz-saved__th', src: it.preview || '/assets/placeholder-project.png', alt: '' }));
          card.appendChild(el('div', { class: 'dz-saved__meta' },
            el('div', { class: 'dz-saved__n' }, it.title || '내 디자인'),
            el('div', { class: 'dz-saved__d' }, fmtDate(it.updatedAt)),
          ));
          var loadBtn = btn('불러오기', 'primary', function () { loadDesign(it.id); overlay.remove(); });
          var delBtn = btn('삭제하기', 'outline', function () {
            if (!confirm('이 디자인을 삭제할까요?')) return;
            delBtn.disabled = true; loadBtn.disabled = true;
            window.api.del('/me/designs/' + it.id).then(function () {
              // 즉시 반영: 목록·카운트 갱신(다시 그림)
              paint(items.filter(function (x) { return x.id !== it.id; }));
              toast('삭제했어요');
            }).catch(function (err) {
              if (err && err.status === 401) { location.href = '/login.html'; return; }
              delBtn.disabled = false; loadBtn.disabled = false; toast('삭제하지 못했어요');
            });
          });
          card.appendChild(el('div', { class: 'dz-saved__actions' }, loadBtn, delBtn));
          listWrap.appendChild(card);
        });
        kids.push(listWrap);
      }
      kids.push(el('div', { class: 'dz-modal__foot' }, btn('닫기', 'outline', function () { overlay.remove(); })));
      box.replaceChildren.apply(box, kids);
    }

    box.replaceChildren(el('div', { class: 'dz-modal__t' }, '내 디자인'),
      el('div', { class: 'dz-status' }, el('span', { class: 'dz-spin' }), '불러오는 중…'));
    window.api.get('/me/designs').then(function (res) {
      paint((res && res.items) || []);
    }).catch(function (err) {
      if (err && err.status === 401) { location.href = '/login.html'; return; }
      box.replaceChildren(el('div', { class: 'dz-modal__t' }, '내 디자인'),
        el('div', { class: 'dz-status' }, '목록을 불러오지 못했어요.'),
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
      // 저장된 색 slug 이 현재 팔레트에 있으면 복원, 아니면(구버전 hex 등) 기본색.
      S.color = (function () { var cs = itemColors(); for (var i = 0; i < cs.length; i++) if (cs[i].s === dz.color) return dz.color; return defaultColor(); })();
      S.qty = dz.qty || 1;
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

  // 왼쪽: AI 디자인 보기 — 합성 디자인 → /ai/blueprint(AI 의상/제품 이미지). 성공 시 가상피팅 잠금 해제.
  // 디자인 있는 모든 면(앞/뒤/좌/우/넥)을 합성해 배열로 반환 — AI 에 전부 전달(blueprint 최대 5장).
  function compositeArtViews(pxW) {
    var all = views();
    var list;
    if (isApparel()) {
      // 의류: 앞·뒤는 항상 포함(결과를 무조건 앞/뒤 2패널로). 옆면·넥은 디자인 있을 때만 추가(소매 반영용).
      list = all.filter(function (v) { return v === 'front' || v === 'back' || (S.views[v] || []).length > 0; });
    } else {
      var withArt = all.filter(function (v) { return (S.views[v] || []).length > 0; });
      list = withArt.length ? withArt : [primaryView()];
    }
    list = list.slice(0, 5);
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
          el('div', { class: 'dz-describe__s' }, '이 카테고리(웹·앱/기타/인형/액세서리)는 디자인하기를 지원하지 않아요. 다른 카테고리를 선택해 주세요.'),
          btn('카테고리 선택으로', 'primary', function () { location.href = '/fund-create.html'; }, 'dz-describe__go'))));
      return;
    }
    S.slug = norm;
    S.catObj = window.dtCategory(S.slug);
    S.itemIdx = 0;
    S.product = curItem().name;
    S.color = defaultColor();
    S.view = views()[0];
    S.views = {}; views().forEach(function (v) { S.views[v] = []; });
    S.title = (S.catObj ? S.catObj.label : '내') + ' 디자인';
    resetHistory();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
