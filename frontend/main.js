/**
 * doothing 메인 페이지 — Vanilla JS 컴포넌트.
 *
 * 구조:
 *   Header
 *   SearchBar
 *   PopularSection
 *     ├ left-col: [메인 1위 카드] [카테고리 3개] [슬로건 두 줄]
 *     └ right-col: "실시간 순위" + 1~5위 (좌측 전체 높이까지 stretch)
 *   NewPicks
 *     ├ 이미지 카드(소개글 오버레이)
 *     └ 카드 밖 시그니처색 달성률(흰 박스 없음)
 *
 * 카테고리 클릭 → /feed.html?category=과잠|반팔티|에코백 (백엔드 카테고리 필터로 진입)
 *
 * XSS 방어: 외부 데이터는 textContent 로 렌더링.
 */

/* ===== 더미 데이터 ===== */
/* productId: mock-data.js MOCK_PRODUCTS 와 매핑 (좋아요 토글 연동)
 * img: 메인 카드 + 신규픽 카드의 모델 사진 — frontend/과잠 이미지/ 폴더 사용
 * model: 우측 순위 1~5위 썸네일용 모델 사진
 */
const JACKET_IMG_DIR = '/' + encodeURIComponent('과잠 이미지') + '/';
const JACKET_IMAGES = [
  JACKET_IMG_DIR + encodeURIComponent('다운로드.jpg'),
  JACKET_IMG_DIR + encodeURIComponent('다운로드 (1).jpg'),
  JACKET_IMG_DIR + encodeURIComponent('다운로드 (2).jpg'),
  JACKET_IMG_DIR + encodeURIComponent('다운로드 (3).jpg'),
  JACKET_IMG_DIR + encodeURIComponent('다운로드 (4).jpg'),
  JACKET_IMG_DIR + encodeURIComponent('다운로드 (5).jpg'),
  JACKET_IMG_DIR + encodeURIComponent('다운로드 (6).jpg'),
];

// 더미 제거 — 실시간 순위는 /api/groupbuys 실데이터로만 채움(buildSectionsFromMockProducts). 데이터 없으면 빈 상태.
const POPULAR_RANKING = [];

// 카테고리는 categories.js(window.DT_CATEGORIES) 단일 소스 사용. 미로드 시 최소 폴백.
const CATEGORIES = (typeof window !== 'undefined' && Array.isArray(window.DT_CATEGORIES))
  ? window.DT_CATEGORIES
  : [
      { key: 'jacket', label: '과잠',   slug: 'jacket' },
      { key: 'ecobag', label: '에코백', slug: 'ecobag' },
      { key: 'etc',    label: '기타',   slug: 'etc' },
    ];

// 더미 제거 — 신규픽도 실데이터(최신순)로만 채움. 없으면 빈 상태.
const NEW_PICKS = [];

/* ===== DOM 헬퍼 ===== */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'onClick') node.addEventListener('click', v);
    else if (k === 'style') node.style.cssText = v;
    else if (k === 'href') node.setAttribute('href', v);
    else if (k === 'aria-label') node.setAttribute('aria-label', v);
    else if (k === 'src') node.setAttribute('src', v);
    else if (k === 'alt') node.setAttribute('alt', v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  }
  return node;
}

function imgOrNull(src, alt, className) {
  if (!src) return null;
  const img = el('img', { src, alt: alt || '', class: className || '' });
  img.addEventListener('error', () => { img.style.display = 'none'; });
  return img;
}
function applyBg(node, bg) {
  if (bg) node.style.background = bg;
}

/**
 * SVG 아이콘 카드 (category-icons.js 의 createCategoryIcon 사용).
 * 인라인 콘텐츠라 안전하게 innerHTML 로 SVG 삽입.
 */
function svgIcon(key, className) {
  const wrap = el('div', { class: className || 'icon' });
  const svg = (typeof window.categoryIconSvg === 'function') ? window.categoryIconSvg(key) : '';
  if (svg) wrap.innerHTML = svg;
  return wrap;
}

/* ===== 좋아요 하트 SVG (투명/채움) ===== */
const HEART_SVG_OUTLINE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';
const HEART_SVG_FILLED  = '<svg viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';

/**
 * 좋아요 하트 버튼 — 투명 배경, 흰 외곽선, 클릭 시 빨간 채움.
 * 게시물 카드(이미지 영역) 좌측 상단에 절대 배치.
 *
 * @param {number} productId   mock-data.js MOCK_PRODUCTS 의 id
 */
function LikeHeartButton(productId) {
  const liked = (typeof isLiked === 'function') ? isLiked(productId) : false;
  const btn = el('button', {
    class: 'heart-btn' + (liked ? ' liked' : ''),
    type: 'button',
    'aria-label': '좋아요',
    'aria-pressed': liked ? 'true' : 'false',
  });
  btn.innerHTML = liked ? HEART_SVG_FILLED : HEART_SVG_OUTLINE;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (typeof toggleLike !== 'function') return;
    toggleLike(productId);
    const nowLiked = (typeof isLiked === 'function') ? isLiked(productId) : false;
    btn.classList.toggle('liked', nowLiked);
    btn.setAttribute('aria-pressed', nowLiked ? 'true' : 'false');
    btn.innerHTML = nowLiked ? HEART_SVG_FILLED : HEART_SVG_OUTLINE;
  });
  return btn;
}

/**
 * doothing 브랜드 마크 (옆 공백용).
 * SVG 정적 콘텐츠 → innerHTML 안전.
 *   - extra: 추가 클래스 (배치별 크기 조절)
 */
/* =====================================================================
 * Header
 *   variant: 'main' (기본 — 디자인하기/알림/설정/마이프로필 텍스트 메뉴 + 검색바 별도)
 *            'detail' (상품 상세 — 우측에 돋보기 아이콘 + 동그란 마이프로필 아바타)
 * ===================================================================== */
/* =====================================================================
 * Header v2 — 텀블벅형 2단 헤더 (흰 배경)
 *   1단: 로고 · 검색 · [프로젝트 올리기] · [로그인/마이]
 *   2단: 카테고리 · 홈 · 인기 · 신규 · 마감임박
 * 모든 페이지 공통. 로그인 상태는 비동기로 갱신.
 * ===================================================================== */
function Header() {
  const header = el('header', { class: 'dt-hd' });

  // --- 1단: 상단바 ---
  const topbar = el('div', { class: 'dt-hd__top' });
  const hamburger = el('button', { class: 'dt-hd__ham', type: 'button', 'aria-label': '카테고리' });
  hamburger.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
  hamburger.addEventListener('click', buildAndOpenMenu);

  const logo = el('a', { class: 'dt-hd__logo', href: '/main.html' }, 'doothing');

  const searchForm = el('form', { class: 'dt-hd__search', role: 'search' });
  const searchInput = el('input', { class: 'dt-hd__search-input', type: 'text', placeholder: '검색어를 입력해주세요', 'aria-label': '검색' });
  searchForm.appendChild(searchInput);
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    location.href = '/feed.html' + (q ? '?q=' + encodeURIComponent(q) : '');
  });

  const actions = el('div', { class: 'dt-hd__actions' });
  const uploadLink = el('a', { class: 'dt-hd__upload', href: '/fund-create.html' }, '프로젝트 올리기');
  const authArea = el('div', { class: 'dt-hd__auth' });
  authArea.appendChild(el('a', { class: 'dt-hd__login', href: '/login.html' }, '로그인/회원가입'));
  actions.appendChild(uploadLink);
  actions.appendChild(authArea);

  topbar.appendChild(hamburger);
  topbar.appendChild(logo);
  topbar.appendChild(searchForm);
  topbar.appendChild(actions);

  // --- 2단: 네비바 ---
  const navbar = el('nav', { class: 'dt-hd__nav', 'aria-label': '주요 메뉴' });
  const navItems = [
    { label: '카테고리', href: '/feed.html', cat: true },
    { label: '홈', href: '/main.html' },
    { label: '인기', href: '/feed.html?sort=popular' },
    { label: '신규', href: '/feed.html?sort=latest' },
    { label: '마감임박', href: '/feed.html?sort=ending' },
  ];
  navItems.forEach((it) => {
    const a = el('a', { class: 'dt-hd__navlink' + (it.cat ? ' dt-hd__navlink--cat' : ''), href: it.href }, it.label);
    navbar.appendChild(a);
  });

  header.appendChild(topbar);
  header.appendChild(navbar);

  // 로그인 상태 반영 (비동기)
  fetchAuthStatus().then((auth) => {
    if (!auth || !auth.user) return;
    const u = auth.user;
    const isAdmin = String(u.role || auth.role || 'USER').toUpperCase() === 'ADMIN';
    authArea.innerHTML = '';
    const my = el('a', { class: 'dt-hd__login', href: '/profile.html' }, (u.nickname || u.name || '마이') + '님');
    const set = el('a', { class: 'dt-hd__iconlink', href: '/settings.html', 'aria-label': '설정' }, '설정');
    authArea.appendChild(my);
    authArea.appendChild(set);
    if (isAdmin) authArea.appendChild(el('a', { class: 'dt-hd__iconlink dt-hd__admin', href: '/admin.html' }, '관리자'));
    const out = el('a', { class: 'dt-hd__iconlink', href: '#' }, '로그아웃');
    out.addEventListener('click', handleLogout);
    authArea.appendChild(out);
  }).catch(() => {});

  return header;
}

/* (구) Header — 미사용. 하위 호환용 잔존 코드 제거됨. */
function _legacyHeaderUnused({ variant = 'main' } = {}) {
  // 좌측 그룹 — 뒤로가기(모바일용) + ☰ + doothing + 인기/신규
  const backBtn = el('button', {
    class: 'back-btn-mobile', type: 'button', 'aria-label': '뒤로가기',
  });
  backBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  backBtn.addEventListener('click', () => {
    if (document.referrer && document.referrer.indexOf(location.hostname) !== -1) {
      history.back();
    } else {
      location.href = '/main.html';
    }
  });

  // 모바일용 알림 벨 아이콘 (좌측 인기/신규 옆에 배치)
  const bellIconBtn = el('button', {
    class: 'icon-btn-round bell-icon-btn', type: 'button', 'aria-label': '알림',
  });
  bellIconBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>';
  bellIconBtn.addEventListener('click', () => {
    if (typeof window.openNotification === 'function') window.openNotification();
    else location.href = '/notice.html';
  });

  const hamburgerBtn = el('button', { class: 'menu-btn', 'aria-label': '메뉴', type: 'button' });
  hamburgerBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
  const left = el('nav', { class: 'nav-group' },
    backBtn,
    hamburgerBtn,
    el('a', { class: 'brand', href: '/main.html' }, 'doothing'),
    el('a', { class: 'nav-all-btn', href: '/feed.html' }, '전체'),
    bellIconBtn,
  );

  // 우측 — 마이프로필 아이콘 (모바일) + 텍스트 메뉴 (데스크톱)

  // 모바일용 마이프로필 아이콘 (profile 페이지에서는 설정 아이콘으로 대체)
  const isProfilePage = /profile/i.test(location.pathname) || /profile/i.test(location.href);
  const profileIconBtn = el('a', {
    class: 'icon-btn-round avatar-btn',
    href: isProfilePage ? '/settings.html' : '/profile.html',
    'aria-label': isProfilePage ? '설정' : '마이프로필',
  });
  if (isProfilePage) {
    profileIconBtn.classList.remove('avatar-btn');
    profileIconBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
  } else {
    profileIconBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  }

  let right;

  if (variant === 'detail') {
    // sub/detail 페이지 우측: 알림 + 마이프로필(또는 설정)
    // bellIconBtn 은 좌측에서 이미 사용 중 → 별도 인스턴스 생성
    const bellIconBtnRight = el('button', {
      class: 'icon-btn-round bell-icon-btn', type: 'button', 'aria-label': '알림',
    });
    bellIconBtnRight.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>';
    bellIconBtnRight.addEventListener('click', () => {
      if (typeof window.openNotification === 'function') window.openNotification();
      else location.href = '/notice.html';
    });
    right = el('nav', { class: 'nav-group' }, bellIconBtnRight, profileIconBtn);
  } else {
    // 메인: 디자인하기 + 알림 / 설정 / 마이프로필 (텍스트 — 데스크톱)
    const designLink = el('a', { href: '/design-select.html', class: 'nav-text' }, '디자인하기');

    const bellBtn = el('button', {
      class: 'nav-text-btn', type: 'button', 'aria-label': '알림',
    }, '알림');
    bellBtn.addEventListener('click', () => {
      if (typeof window.openNotification === 'function') {
        window.openNotification();
      } else {
        location.href = '/notice.html';
      }
    });

    const settingsBtn = el('a', {
      class: 'nav-text-btn', href: '/settings.html', 'aria-label': '설정',
    }, '설정');

    const profileLink = el('a', {
      class: 'nav-text-btn nav-profile', href: '/profile.html', 'aria-label': '마이프로필',
    }, '마이프로필');
    profileLink.appendChild(el('span', { class: 'profile-dot', 'aria-hidden': 'true' }));

    // profile 페이지: 우측 헤더에 알림 아이콘 추가
    let profilePageBellBtn = null;
    if (isProfilePage) {
      profilePageBellBtn = el('button', {
        class: 'icon-btn-round bell-icon-btn', type: 'button', 'aria-label': '알림',
      });
      profilePageBellBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>';
      profilePageBellBtn.addEventListener('click', () => {
        if (typeof window.openNotification === 'function') window.openNotification();
        else location.href = '/notice.html';
      });
    }

    right = el('nav', { class: 'nav-group' },
      profilePageBellBtn,
      profileIconBtn,
      profileLink,
      bellBtn,
      settingsBtn,
      designLink,
    );
  }

  const header = el('header', { class: 'dt-header' }, left, right);

  // 햄버거: 모바일 사이드 메뉴 — 백엔드 인증 상태 확인 후 메뉴 항목 분기
  const menuBtn = left.querySelector('.menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      buildAndOpenMenu();
    });
  }
  return header;
}

/**
 * 백엔드 인증 상태(/api/dev-auth/me, /api/auth/me)를 확인하고 햄버거 메뉴를 연다.
 * 로그인 시 → 마이페이지/내주문/배송지/로그아웃 등 표시
 * 비로그인 시 → 로그인 항목만 표시
 *
 * 인증 확인은 비동기지만, 응답이 늦어도 사용자 경험을 위해 즉시 메뉴는 열고
 * 응답 도착 시 항목을 갈아끼운다 (낙관적 UI).
 */
function buildAndOpenMenu() {
  const baseItems = [
    { label: '홈',           href: '/main.html' },
    { label: '공구 피드',    href: '/feed.html' },
    { label: '디자인하기',   href: '/design-select.html' },
    { label: '공지사항',     href: '/announcements.html' },
    { label: '1:1 문의',     href: '/support.html' },
  ];

  // 1) 즉시 비로그인 메뉴로 열기
  const guestItems = [
    ...baseItems,
    { label: '로그인',       href: '/login.html' },
  ];
  openSimpleMenu(guestItems);

  // 2) 백엔드 인증 상태 비동기 확인
  fetchAuthStatus().then((auth) => {
    if (!auth || !auth.user) return; // 비로그인 — 그대로 둠
    const role = auth.user.role || auth.role || 'USER';
    const isAdmin = String(role).toUpperCase() === 'ADMIN';

    const userName = auth.user.name || auth.user.username || '내 계정';
    const loggedItems = [
      { label: userName + ' 님',  href: '/profile.html', emphasis: true },
      ...baseItems,
      { label: '마이페이지',     href: '/profile.html' },
      { label: '내 주문',        href: '/my-orders.html' },
      { label: '배송지 관리',    href: '/addresses.html' },
      { label: '설정',           href: '/settings.html' },
    ];
    if (isAdmin) {
      loggedItems.push(
        { label: '[관리자] 펀드 심사·입금', href: '/admin.html', emphasis: true },
        { label: '[관리자] 주문',  href: '/admin-orders.html' },
        { label: '[관리자] 채팅',  href: '/admin-chat.html' },
      );
    }
    loggedItems.push({ label: '로그아웃', href: '#', onClick: handleLogout });

    refreshSimpleMenu(loggedItems);
  }).catch(() => {
    // 네트워크 실패 시 비로그인 그대로
  });
}

/**
 * 첫 로그인 온보딩 가드 — 로그인했는데 onboarded=false 면 온보딩 페이지로.
 * 온보딩/로그인/랜딩 페이지에서는 동작 안 함(무한 리다이렉트 방지).
 */
(function ensureOnboarded() {
  const skip = ['/onboarding.html', '/login.html', '/login-dev.html', '/landing.html'];
  if (skip.indexOf(location.pathname) !== -1) return;
  function check() {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) {
        if (me && (me.userId || me.id) && me.onboarded === false) {
          location.href = '/onboarding.html';
        }
      })
      .catch(function () { /* 무시 */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check);
  else check();
})();

/**
 * 인증 상태 조회 — dev-auth 우선, 실패 시 정식 auth 시도.
 * 응답: { user: { id, name, role } } 또는 null
 */
async function fetchAuthStatus() {
  try {
    const res = await fetch('/api/dev-auth/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && (data.user || data.id || data.userId)) {
        return data.user ? data : { user: data };
      }
    }
  } catch (_) { /* fallthrough */ }

  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && (data.user || data.id || data.userId)) {
        return data.user ? data : { user: data };
      }
    }
  } catch (_) { /* ignore */ }

  return null;
}

/** 로그아웃 — 백엔드 세션/쿠키 정리 */
async function handleLogout(e) {
  if (e && e.preventDefault) e.preventDefault();
  try {
    await fetch('/api/dev-auth/logout', { method: 'POST', credentials: 'include' }).catch(() => null);
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => null);
  } finally {
    location.href = '/main.html';
  }
}

window.dtHeader = Header;
window.dtOpenSimpleMenu = openSimpleMenu;

/** 햄버거 메뉴 — 좌측 슬라이드 패널 */
function openSimpleMenu(items) {
  // 이미 열려있으면 항목만 갱신
  let panel = document.getElementById('dtSimpleMenu');
  if (panel) {
    refreshSimpleMenu(items);
    panel.classList.add('open');
    return;
  }

  const list = buildMenuList(items);
  const closeBtn = el('button', { class: 'simple-menu-close', 'aria-label': '닫기', type: 'button' }, '×');
  panel = el('aside', { id: 'dtSimpleMenu', class: 'simple-menu open' }, closeBtn, list);
  const backdrop = el('div', { class: 'simple-menu-backdrop' });
  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  const close = () => {
    panel.classList.remove('open');
    backdrop.remove();
    setTimeout(() => { if (panel.parentNode) panel.remove(); }, 220);
  };
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
}

/** 이미 열린 메뉴의 항목만 갈아끼움 (인증 상태 반영용) */
function refreshSimpleMenu(items) {
  const panel = document.getElementById('dtSimpleMenu');
  if (!panel) return;
  const oldList = panel.querySelector('.simple-menu-list');
  const newList = buildMenuList(items);
  if (oldList) panel.replaceChild(newList, oldList);
  else panel.appendChild(newList);
}

function buildMenuList(items) {
  const list = el('ul', { class: 'simple-menu-list' });
  items.forEach((it) => {
    const a = el('a', { href: it.href || '#' }, it.label);
    if (it.emphasis) a.classList.add('menu-emphasis');
    if (typeof it.onClick === 'function') {
      a.addEventListener('click', it.onClick);
    }
    list.appendChild(el('li', null, a));
  });
  return list;
}

/* =====================================================================
 * SearchBar
 * ===================================================================== */
function SearchBar({ placeholder = '검색' } = {}) {
  const input = el('input', { class: 'dt-search-input', type: 'text', placeholder });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (q) location.href = '/feed.html?q=' + encodeURIComponent(q);
    }
  });
  return el('div', { class: 'dt-search-wrap' }, input);
}

/* =====================================================================
 * Category Row — 메인 카드와 슬로건 사이
 *   클릭 시 /feed.html?category=<slug> 로 이동 (백엔드 카테고리 필터로 진입)
 * ===================================================================== */
function CategoryRow({ items = CATEGORIES } = {}) {
  const row = el('div', { class: 'category-row' });
  items.forEach((cat) => {
    const card = el('a', {
      class: 'category-card',
      href: '/feed.html?category=' + encodeURIComponent(cat.slug),
      'aria-label': cat.label + ' 카테고리로 이동',
    },
      svgIcon(cat.key, 'icon'),
      el('span', { class: 'label' }, cat.label),
    );
    row.appendChild(card);
  });
  return row;
}

/* =====================================================================
 * PopularSection
 * ===================================================================== */
function PopularSection({ ranking = POPULAR_RANKING, rotateMs = 2000 } = {}) {
  const hasRanking = Array.isArray(ranking) && ranking.length > 0;
  // 메인 카드
  const mainCard = el('div', { class: 'main-card' });

  if (hasRanking) {
    applyBg(mainCard, ranking[0].bg);
    mainCard.style.cursor = 'pointer';

    let mainImg = imgOrNull(ranking[0].img, ranking[0].name, 'main-img');
    if (mainImg) mainCard.appendChild(mainImg);

    mainCard.appendChild(el('div', { class: 'scrim' }));

    const rankBadge = el('span', { class: 'rank-badge' }, '실시간 ' + ranking[0].rank + '위');
    mainCard.appendChild(rankBadge);

    // 좌측 상단 좋아요 하트 — 회전 시 productId 갱신
    let heartBtn = LikeHeartButton(ranking[0].productId);
    mainCard.appendChild(heartBtn);

    const sellerOverlay = el('p', { class: 'seller-overlay' }, ranking[0].seller || ranking[0].name);
    mainCard.appendChild(sellerOverlay);

    // 1→2→3 fade 순환
    let idx = 0;

    // 메인 카드 클릭 → 현재 표시중 1위 상품 상세로 이동
    mainCard.addEventListener('click', (e) => {
      if (e.target.closest('.heart-btn')) return; // 하트는 자체 처리
      const cur = ranking[idx] || ranking[0];
      if (cur && cur.productId != null) {
        location.href = '/detail.html?id=' + encodeURIComponent(cur.productId);
      }
    });

    if (ranking.length > 1) {
      setInterval(() => {
        if (mainImg) mainImg.classList.add('fade-out');
        sellerOverlay.classList.add('fade-out');
        setTimeout(() => {
          idx = (idx + 1) % Math.min(3, ranking.length);
          const item = ranking[idx];

          if (item.img) {
            if (!mainImg) {
              mainImg = imgOrNull(item.img, item.name, 'main-img');
              if (mainImg) mainCard.insertBefore(mainImg, mainCard.firstChild);
            } else {
              mainImg.setAttribute('src', item.img);
              mainImg.style.display = '';
            }
          } else if (mainImg) {
            mainImg.style.display = 'none';
          }
          mainCard.style.background = '';
          applyBg(mainCard, item.bg);

          rankBadge.textContent = '실시간 ' + item.rank + '위';
          sellerOverlay.textContent = item.seller || item.name;

          // 하트 버튼 productId 갱신 (재생성)
          const newHeart = LikeHeartButton(item.productId);
          mainCard.replaceChild(newHeart, heartBtn);
          heartBtn = newHeart;

          if (mainImg) mainImg.classList.remove('fade-out');
          sellerOverlay.classList.remove('fade-out');
        }, 300);
      }, rotateMs);
    }
  } else {
    // 등록된 펀딩이 없을 때 — 더미 대신 안내(프로모 카드 자리)
    mainCard.appendChild(el('div', { class: 'scrim' }));
    mainCard.appendChild(el('p', { class: 'seller-overlay' }, '아직 등록된 펀딩이 없어요 — 첫 펀딩을 만들어보세요!'));
  }

  // 좌측 컬럼: [메인 홍보 카드] → [카테고리] → [슬로건] 세로 스택.
  // (기존 우측 두띵 브랜드 두들 이미지는 제거) / 우측 컬럼: 실시간 순위.
  const categoryRow = CategoryRow();
  const sloganText = el('img', {
    class: 'slogan-text slogan-img',
    src: '/assets/' + encodeURIComponent('left text renew') + '.png',
    alt: '우리의 상상을 현실로',
  });

  const leftCol = el('div', { class: 'left-col' }, mainCard, categoryRow, sloganText);

  // 우측 컬럼 — 텀블벅 스타일 (큰 정사각 썸네일 + 좌상단 순위 배지 + 창작자/제목/달성률)
  const list = el('div', { class: 'ranking-list' });
  if (!hasRanking) {
    list.appendChild(el('p', { class: 'ranking-empty', style: 'color:#9ca3af;font-size:14px;padding:24px 4px;' }, '실시간 순위가 아직 없어요'));
  }
  ranking.slice(0, 5).forEach((item) => {
    // 썸네일 (정사각)
    const thumb = el('div', { class: 'thumb-square' });
    if (item.bg) thumb.style.background = item.bg;

    if (item.model) {
      const img = el('img', {
        class: 'thumb-img',
        src: item.model,
        alt: item.name || '',
      });
      img.addEventListener('error', () => {
        img.remove();
        // SVG fallback (배경 그라데이션은 이미 깔려있음)
        const svgWrap = el('div', { class: 'thumb-svg-inner' });
        svgWrap.innerHTML = (typeof window.categoryIconSvg === 'function')
          ? window.categoryIconSvg(item.emoji)
          : '';
        thumb.appendChild(svgWrap);
      });
      thumb.appendChild(img);
    }

    // 순위 배지 (좌상단)
    const badge = el('span', { class: 'rank-badge-mini' }, String(item.rank));
    thumb.appendChild(badge);

    // 우측 정보
    const info = el('div', { class: 'rank-info' },
      el('span', { class: 'maker' }, item.maker || ''),
      el('span', { class: 'title' }, item.name),
      el('span', { class: 'achieve' }, item.achieve.toLocaleString() + '% 달성'),
    );

    list.appendChild((function () {
      const rowItem = el('div', { class: 'rank-item' }, thumb, info);
      rowItem.style.cursor = 'pointer';
      rowItem.addEventListener('click', () => {
        if (item.productId != null) {
          location.href = '/detail.html?id=' + encodeURIComponent(item.productId);
        }
      });
      return rowItem;
    })());
  });
  const rightCol = el('div', { class: 'right-col' },
    el('h2', { class: 'ranking-label' }, '실시간 순위'),
    list,
  );

  return el('section', { id: 'popular', class: 'dt-popular' }, leftCol, rightCol);
}

/* =====================================================================
 * NewPicks — 흰 박스 제거: 달성률은 카드 밖 밑에 텍스트로
 * ===================================================================== */
function NewPicks({ items = NEW_PICKS, title = '신규픽' } = {}) {
  const grid = el('div', { class: 'grid' });
  items.forEach((item) => {
    const imgWrap = el('div', { class: 'img-wrap' });
    applyBg(imgWrap, item.bg);

    const img = imgOrNull(item.img, item.name);
    if (img) imgWrap.appendChild(img);
    imgWrap.appendChild(el('div', { class: 'scrim' }));
    // 좌측 상단 좋아요 하트
    if (item.productId) {
      imgWrap.appendChild(LikeHeartButton(item.productId));
    }
    imgWrap.appendChild(el('p', { class: 'desc-overlay' }, item.desc));

    const slot = el('div', { class: 'slot' },
      imgWrap,
      el('span', { class: 'progress-text' }, '실시간 달성률 ' + item.progress + '%'),
    );
    slot.addEventListener('click', () => {
      location.href = '/detail.html?id=' + encodeURIComponent(item.id);
    });
    grid.appendChild(slot);
  });
  return el('section', { id: 'new', class: 'dt-new-picks' },
    el('h2', null, title),
    grid,
  );
}

/* =====================================================================
 * App
 *   body 의 data-page 속성으로 페이지 모드 판별:
 *     - 'main' (기본): 메인 페이지 전체 렌더
 *     - 'detail': 헤더만 메인 컴포넌트로 렌더, 본문은 detail.js 가 처리
 * ===================================================================== */
/* 최근 본 프로젝트 — detail 에서 localStorage 에 기록한 것을 홈에 가로 스크롤로 표시 */
function RecentlyViewed() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('recentFunds') || '[]'); } catch (_) { list = []; }
  const sec = el('section', { class: 'dt-recent' });
  if (!Array.isArray(list) || list.length === 0) { sec.style.display = 'none'; return sec; }

  sec.appendChild(el('h2', { class: 'dt-recent__title' }, '최근 본 프로젝트'));
  const row = el('div', { class: 'dt-recent__row' });
  list.forEach((it) => {
    const card = el('a', { class: 'dt-recent__card', href: '/detail.html?id=' + encodeURIComponent(it.id) });
    const thumb = el('div', { class: 'dt-recent__thumb' });
    if (it.imageUrl) {
      const img = el('img', { src: it.imageUrl, alt: it.title || '', loading: 'lazy' });
      thumb.appendChild(img);
    }
    card.appendChild(thumb);
    card.appendChild(el('div', { class: 'dt-recent__name' }, it.title || ''));
    row.appendChild(card);
  });
  sec.appendChild(row);
  return sec;
}

/* 카테고리 그리드 — 13종+기타를 아이콘+라벨 그리드로 (텀블벅 카테고리 영역) */
function CategoryGrid() {
  const sec = el('section', { class: 'dt-catgrid' });
  sec.appendChild(el('h2', { class: 'dt-catgrid__title' }, '카테고리'));
  const grid = el('div', { class: 'dt-catgrid__grid' });
  CATEGORIES.forEach((c) => {
    const a = el('a', { class: 'dt-catgrid__item', href: '/feed.html?category=' + encodeURIComponent(c.slug), 'aria-label': c.label });
    const ic = el('div', { class: 'dt-catgrid__icon' });
    const svg = (typeof window.categoryIconSvg === 'function') ? window.categoryIconSvg(c.key) : '';
    if (svg) ic.innerHTML = svg;
    a.appendChild(ic);
    a.appendChild(el('span', { class: 'dt-catgrid__label' }, c.label));
    grid.appendChild(a);
  });
  sec.appendChild(grid);
  return sec;
}

/* 프로젝트 카드 그리드 섹션 (인기/신규). 빈 상태 처리. */
function HomeProjectSection(title, items, badge) {
  const sec = el('div', { class: 'dt-home-sec__inner' });
  const head = el('div', { class: 'dt-home-sec__head' });
  head.appendChild(el('h2', { class: 'dt-home-sec__title' }, title));
  head.appendChild(el('a', { class: 'dt-home-sec__more', href: '/feed.html' }, '전체보기'));
  sec.appendChild(head);

  if (!items || items.length === 0) {
    sec.appendChild(el('div', { class: 'dt-home-sec__empty' }, '아직 등록된 프로젝트가 없어요. 첫 프로젝트를 올려보세요!'));
    return sec;
  }
  const grid = el('div', { class: 'dt-pcard-grid' });
  items.forEach((p) => grid.appendChild(ProjectCard(p, badge)));
  sec.appendChild(grid);
  return sec;
}

/* 프로젝트 카드 — 썸네일 + 카테고리/제목/창작자 + 달성률·가격 */
function ProjectCard(p, badge) {
  const rate = (typeof calcAchievementRate === 'function') ? calcAchievementRate(p) : 0;
  const card = el('a', { class: 'dt-pcard', href: '/detail.html?id=' + encodeURIComponent(p.id) });
  const thumb = el('div', { class: 'dt-pcard__thumb' });
  if (p.imageUrl) {
    const img = el('img', { src: p.imageUrl, alt: p.title || '', loading: 'lazy' });
    img.addEventListener('error', () => { img.style.display = 'none'; });
    thumb.appendChild(img);
  }
  if (badge) thumb.appendChild(el('span', { class: 'dt-pcard__badge' }, badge));
  card.appendChild(thumb);

  const body = el('div', { class: 'dt-pcard__body' });
  const catLabel = (typeof window.dtCategory === 'function' && window.dtCategory(p.category)) ? window.dtCategory(p.category).label : '';
  if (catLabel) body.appendChild(el('span', { class: 'dt-pcard__cat' }, catLabel));
  body.appendChild(el('p', { class: 'dt-pcard__author' }, p.author || '익명'));
  body.appendChild(el('h3', { class: 'dt-pcard__title' }, p.title || ''));
  const meta = el('div', { class: 'dt-pcard__meta' });
  meta.appendChild(el('span', { class: 'dt-pcard__rate' }, rate + '% 달성'));
  if (p.priceText) meta.appendChild(el('span', { class: 'dt-pcard__price' }, p.priceText));
  body.appendChild(meta);
  card.appendChild(body);
  return card;
}

function App() {
  document.body.classList.add('main-page');
  const pageMode = document.body.dataset.page || 'main';
  const root = document.getElementById('app') || document.body;

  if (pageMode === 'detail') {
    // 상품 상세 — 헤더만 메인 컴포넌트로 통일
    root.appendChild(Header({ variant: 'detail' }));
    return;
  }

  if (pageMode === 'feed') {
    // 공동구매 피드 — 메인 헤더 (디자인하기/알림/설정/마이프로필) 그대로 사용
    root.appendChild(Header({ variant: 'main' }));
    return;
  }

  if (pageMode === 'sub') {
    // 기타 서브 페이지 — 헤더만 삽입, 나머지는 기존 HTML 콘텐츠 유지
    root.appendChild(Header({ variant: 'main' }));
    return;
  }

  // 메인 페이지 (텀블벅형: 카테고리 그리드 + 프로젝트 카드 그리드)
  root.appendChild(Header());
  root.appendChild(CategoryGrid());

  const popularWrap = el('section', { class: 'dt-home-sec' });
  const newWrap = el('section', { class: 'dt-home-sec' });
  root.appendChild(popularWrap);
  root.appendChild(newWrap);
  root.appendChild(RecentlyViewed());

  function buildHome() {
    const products = (Array.isArray(window.MOCK_PRODUCTS)) ? window.MOCK_PRODUCTS : [];
    const rate = (p) => (p.targetQuantity > 0 ? p.currentQuantity / p.targetQuantity : 0);
    const popular = [...products].sort((a, b) => rate(b) - rate(a)).slice(0, 8);
    const fresh = [...products].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 8);
    popularWrap.replaceChildren(HomeProjectSection('인기 프로젝트', popular, '인기'));
    newWrap.replaceChildren(HomeProjectSection('신규 프로젝트', fresh, '신규'));
  }
  buildHome();
  window.addEventListener('mockproducts:updated', buildHome);

  // index.html?search=<keyword> 로 진입 시 feed.html?q= 로 자동 위임
  try {
    const params = new URLSearchParams(location.search);
    const keyword = params.get('search') || params.get('q');
    if (keyword) {
      location.replace('/feed.html?q=' + encodeURIComponent(keyword));
      return;
    }
  } catch (_) { /* ignore */ }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App);
} else {
  App();
}

/* ===== 전역 푸터 — 실운영용 회사정보/약관/문의 (로그인·온보딩·랜딩 제외) ===== */
function renderGlobalFooter() {
  const skip = ['/login.html', '/login-dev.html', '/onboarding.html', '/landing.html'];
  if (skip.indexOf(location.pathname) !== -1) return;
  if (document.querySelector('.dt-footer')) return;

  const f = document.createElement('footer');
  f.className = 'dt-footer';
  f.innerHTML = [
    '<div class="dt-footer__inner">',
    '  <nav class="dt-footer__links">',
    '    <a href="/announcements.html">공지사항</a>',
    '    <a href="/support.html">고객지원·문의</a>',
    '    <a href="/privacy.html">개인정보처리방침</a>',
    '    <a href="/terms.html">이용약관</a>',
    '  </nav>',
    '  <div class="dt-footer__support">',
    '    <strong>고객지원</strong> 평일 10:00~18:00 (점심 12:00~13:00 제외)',
    '    · <a href="/support.html">1:1 문의</a>',
    '  </div>',
    '  <div class="dt-footer__company">',
    '    두띵(doothing) · 대학교 굿즈 펀딩 플랫폼<br>',
    '    <span class="dt-footer__biz">상호/대표/사업자등록번호/주소: 사업자 등록 후 기입 예정</span>',
    '  </div>',
    '  <div class="dt-footer__legal">두띵은 통신판매중개자로서 거래 당사자가 아니며, 상품·후원·환불 등에 대한 책임은 각 펀드 개설자에게 있습니다.</div>',
    '  <div class="dt-footer__copy">© 2026 doothing. All rights reserved.</div>',
    '</div>',
  ].join('');
  document.body.appendChild(f);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderGlobalFooter);
else renderGlobalFooter();
