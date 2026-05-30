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
function Header({ variant = 'main' } = {}) {
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

  const left = el('nav', { class: 'nav-group' },
    backBtn,
    el('button', { class: 'menu-btn', 'aria-label': '메뉴', type: 'button' }, '☰'),
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
    { label: '로그인',       href: '/login-dev.html' },
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
  const closeBtn = el('button', { class: 'simple-menu-close', 'aria-label': '닫기', type: 'button' }, '✕');
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

  // 메인 페이지
  root.appendChild(Header({ variant: 'main' }));
  root.appendChild(SearchBar());

  // PopularSection / NewPicks 컨테이너 — 백엔드 데이터 도착 시 다시 렌더
  const popularWrap = el('div', { class: 'popular-wrap' });
  const newPicksWrap = el('div', { class: 'new-picks-wrap' });
  root.appendChild(popularWrap);
  root.appendChild(newPicksWrap);

  function buildSectionsFromMockProducts() {
    // MOCK_PRODUCTS (백엔드에서 가져왔거나 mock) 기반으로 ranking/newpicks 생성
    const products = (typeof window.MOCK_PRODUCTS !== 'undefined' && Array.isArray(window.MOCK_PRODUCTS))
      ? window.MOCK_PRODUCTS : [];

    let rankingData = POPULAR_RANKING;
    let newPicksData = NEW_PICKS;

    if (products.length > 0) {
      // 인기순 5개 → POPULAR_RANKING 형식
      const sortedByLikes = [...products]
        .sort((a, b) => {
          const aRate = a.targetQuantity > 0 ? a.currentQuantity / a.targetQuantity : 0;
          const bRate = b.targetQuantity > 0 ? b.currentQuantity / b.targetQuantity : 0;
          return bRate - aRate;
        })
        .slice(0, 5);

      rankingData = sortedByLikes.map((p, idx) => ({
        rank: idx + 1,
        productId: p.id,
        maker: p.author || '익명',
        name: p.title,
        seller: p.title,
        achieve: p.targetQuantity > 0
          ? Math.round((p.currentQuantity / p.targetQuantity) * 100)
          : 0,
        img: p.imageUrl || JACKET_IMAGES[idx % JACKET_IMAGES.length],
        bg: 'var(--primary-soft)',
        emoji: 'jacket',
        model: p.imageUrl || JACKET_IMAGES[idx % JACKET_IMAGES.length],
      }));

      // 최신순 5개 → NEW_PICKS 형식
      const sortedByCreated = [...products]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5);

      newPicksData = sortedByCreated.map((p, idx) => ({
        id: p.id,
        productId: p.id,
        name: p.title,
        desc: p.description?.slice(0, 30) || p.title,
        img: p.imageUrl || JACKET_IMAGES[idx % JACKET_IMAGES.length],
        bg: 'var(--primary-soft)',
        progress: p.targetQuantity > 0
          ? Math.round((p.currentQuantity / p.targetQuantity) * 100)
          : 0,
      }));
    }

    popularWrap.replaceChildren(PopularSection({ ranking: rankingData }));
    newPicksWrap.replaceChildren(NewPicks({ items: newPicksData }));
  }

  buildSectionsFromMockProducts();
  window.addEventListener('mockproducts:updated', buildSectionsFromMockProducts);

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
