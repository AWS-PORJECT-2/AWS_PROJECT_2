/**
 * 임시 데이터베이스 (Mock Data)
 * 추후 백엔드 API 연동 시 이 파일을 교체합니다.
 *
 * likeCount: 좋아요 수 (정렬 기준)
 * targetQuantity: 판매자 설정 목표량
 * currentQuantity: 현재 참여 인원
 * isLiked: 현재 사용자의 찜 여부
 * isReserved: 현재 사용자의 공구 참여/예약 여부
 */

const _JACKET_DIR = '/' + encodeURIComponent('과잠 이미지') + '/';
const _JACKET_IMGS = [
  _JACKET_DIR + encodeURIComponent('다운로드.jpg'),
  _JACKET_DIR + encodeURIComponent('다운로드 (1).jpg'),
  _JACKET_DIR + encodeURIComponent('다운로드 (2).jpg'),
  _JACKET_DIR + encodeURIComponent('다운로드 (3).jpg'),
  _JACKET_DIR + encodeURIComponent('다운로드 (4).jpg'),
  _JACKET_DIR + encodeURIComponent('다운로드 (5).jpg'),
  _JACKET_DIR + encodeURIComponent('다운로드 (6).jpg'),
];

// 상품 데이터는 /api/groupbuys 실데이터로만 채운다(loadProductsFromBackend). 더미 시드 없음 — 비면 빈 상태 표시.
var MOCK_PRODUCTS = [];

/**
 * 달성률 계산
 */
function calcAchievementRate(product) {
  if (!product.targetQuantity) return 0;
  return Math.round((product.currentQuantity / product.targetQuantity) * 100);
}

/**
 * 좋아요 순 정렬 (내림차순)
 */
function sortByLikes(products) {
  return [...products].sort((a, b) => b.likeCount - a.likeCount);
}

/**
 * 서버에서 받은 내 찜 id 집합(로그인 시). GET /api/me/likes 로 채운다.
 * isLiked()/toggleLike() 가 product 가 없는 경우(상세 직접 진입)에도 참조한다.
 */
var _likedIdSet = Object.create(null);
function _markLiked(id, on) {
  if (id == null) return;
  if (on) _likedIdSet[String(id)] = true;
  else delete _likedIdSet[String(id)];
}

/**
 * 현재 경로(쿼리/해시 포함)를 로그인 후 복귀용으로 인코딩.
 */
function _currentReturn() {
  return encodeURIComponent(location.pathname + location.search + location.hash);
}

/**
 * 좋아요 토글 — 낙관적 UI + 서버 동기화.
 *  - product.isLiked 를 즉시 뒤집고 likeCount ±1 (새 boolean 반환).
 *  - 백그라운드로 POST/DELETE /api/funds/:id/like → 서버 likeCount 로 동기화.
 *  - 미로그인(401)이면 토글을 취소하고 /login.html?return=<현재경로> 로 이동.
 */
function toggleLike(productId) {
  const product = MOCK_PRODUCTS.find((p) => p.id === productId);
  // 현재 상태: product 우선, 없으면 서버 찜 집합
  const wasLiked = product ? !!product.isLiked : !!_likedIdSet[String(productId)];
  const nowLiked = !wasLiked;

  // 낙관적 반영
  _markLiked(productId, nowLiked);
  if (product) {
    product.isLiked = nowLiked;
    product.likeCount = Math.max(0, (Number(product.likeCount) || 0) + (nowLiked ? 1 : -1));
  }
  window.dispatchEvent(new CustomEvent('likes:updated', { detail: { id: productId, liked: nowLiked } }));

  // 백그라운드 서버 동기화
  const base = window.API_BASE_URL || (window.location.origin + '/api');
  const path = base + '/funds/' + encodeURIComponent(productId) + '/like';
  fetch(path, { method: nowLiked ? 'POST' : 'DELETE', credentials: 'include' })
    .then((res) => {
      if (res.status === 401) {
        // 미로그인 — 낙관적 토글 취소 후 로그인으로 유도
        _markLiked(productId, wasLiked);
        if (product) {
          product.isLiked = wasLiked;
          product.likeCount = Math.max(0, (Number(product.likeCount) || 0) + (nowLiked ? -1 : 1));
        }
        window.dispatchEvent(new CustomEvent('likes:updated', { detail: { id: productId, liked: wasLiked } }));
        location.href = '/login.html?return=' + _currentReturn();
        return null;
      }
      if (!res.ok) return null;
      return res.json().catch(() => null);
    })
    .then((data) => {
      if (!data) return;
      // 서버 응답으로 정확한 likeCount/liked 동기화(전역 반영)
      _markLiked(productId, !!data.liked);
      if (product) {
        if (typeof data.liked === 'boolean') product.isLiked = data.liked;
        if (typeof data.likeCount === 'number') product.likeCount = data.likeCount;
      }
      window.dispatchEvent(new CustomEvent('likes:updated', { detail: { id: productId, liked: !!data.liked, likeCount: data.likeCount } }));
    })
    .catch(() => { /* 네트워크 오류 시 낙관적 상태 유지 */ });

  return nowLiked;
}

/**
 * 좋아요 여부 확인 — product.isLiked 우선, 없으면 서버 찜 집합.
 */
function isLiked(productId) {
  const product = MOCK_PRODUCTS.find((p) => p.id === productId);
  if (product) return !!product.isLiked;
  return !!_likedIdSet[String(productId)];
}

/**
 * 특정 펀드의 좋아요 수(전역) 조회 — 카드/상세의 하트 옆 숫자 표시용.
 */
function getLikeCount(productId) {
  const product = MOCK_PRODUCTS.find((p) => p.id === productId);
  return product ? (Number(product.likeCount) || 0) : 0;
}

/**
 * 예약 상태 설정 (localStorage + isReserved + delta 동기화)
 */
function setReserved(productId, value) {
  const product = MOCK_PRODUCTS.find((p) => p.id === productId);
  const flagKey = 'reserved_' + productId;
  const deltaKey = 'reserved_delta_' + productId;

  // MOCK 목록에 없는 펀드(상세 API 직접 진입) — localStorage 단독 처리
  if (!product) {
    if (value) {
      localStorage.setItem(flagKey, '1');
    } else {
      localStorage.removeItem(flagKey);
      localStorage.removeItem(deltaKey);
      localStorage.removeItem('selectedSize_' + productId);
    }
    return true;
  }

  if (value && !product.isReserved) {
    // 새로 참여
    const currentDelta = Number(localStorage.getItem(deltaKey)) || 0;
    localStorage.setItem(flagKey, '1');
    localStorage.setItem(deltaKey, String(currentDelta + 1));
    product.currentQuantity++;
    product.isReserved = true;
  } else if (!value && product.isReserved) {
    // 참여 취소 — 플래그 해제 + delta 완전 초기화
    localStorage.removeItem(flagKey);
    localStorage.removeItem(deltaKey);
    localStorage.removeItem('selectedSize_' + productId);
    // 원본 기준으로 수치 복원 (멱등성)
    if (typeof product._baseCurrentQuantity !== 'undefined') {
      product.currentQuantity = product._baseCurrentQuantity;
    }
    product.isReserved = false;
  }
}

/**
 * 페이지 로드 시 localStorage와 isReserved/수치 동기화
 * - 좋아요(isLiked/likeCount)는 서버 데이터를 신뢰한다(여기서 건드리지 않음).
 * - 스토리지에 기록이 없으면(null) 기존 값을 유지
 * - reserved delta 값을 읽어 원본 + delta = 최종값 (멱등성 보장)
 */
function syncUserState() {
  MOCK_PRODUCTS.forEach((p) => {
    // 원본 값 보존 (최초 1회만 저장)
    if (typeof p._baseCurrentQuantity === 'undefined') {
      p._baseCurrentQuantity = p.currentQuantity;
    }

    // 플래그 복원 (null이면 seed data 유지)
    const reserved = localStorage.getItem('reserved_' + p.id);
    if (reserved !== null) {
      p.isReserved = reserved === '1';
    }

    // isPaid 복원
    const paid = localStorage.getItem('paid_' + p.id);
    if (paid !== null) {
      p.isPaid = paid === '1';
    }

    // 수치: 원본 + delta = 최종값 (누적 아닌 대입)
    const reservedDelta = Number(localStorage.getItem('reserved_delta_' + p.id)) || 0;
    p.currentQuantity = p._baseCurrentQuantity + reservedDelta;
  });
}

// 초기화
syncUserState();


/**
 * 백엔드(GET /api/groupbuys)에서 공구 목록을 가져와 window.MOCK_PRODUCTS 로 매핑.
 * 백엔드 <목록 아이템> 계약:
 *   { id, title, creatorId, creatorName, creatorSlug, category, coverImageUrl,
 *     currentQuantity, targetQuantity, achievementRate, deadline, status, createdAt }
 * 프론트 매핑: imageUrl=coverImageUrl, author=creatorName, creatorSlug, creatorId.
 * 실패/빈 결과 시 빈 배열(자연스러운 빈 상태). 더미 시드 없음.
 */
async function loadProductsFromBackend() {
  let items = [];
  try {
    const base = window.API_BASE_URL || (window.location.origin + '/api');
    const res = await fetch(base + '/groupbuys?sort=popular&limit=20', {
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.items)) items = data.items;
    } else {
      console.warn('백엔드 공구 조회 실패:', res.status);
    }
  } catch (err) {
    console.warn('백엔드 공구 조회 에러:', err);
  }

  MOCK_PRODUCTS = items.map(function (p) {
    const liked = !!p.isLiked;                  // 서버 viewer 기준 찜 여부(비로그인=false)
    if (liked) _markLiked(p.id, true);          // 서버 찜 집합에도 반영
    return {
      id: p.id,
      creatorId: p.creatorId || null,          // 제작한 펀딩 필터용 (내 userId 와 비교)
      creatorSlug: p.creatorSlug || null,       // 메이커 페이지 링크용
      imageUrl: p.coverImageUrl || '',          // 없으면 카테고리 아이콘 폴백(fillThumb)
      author: p.creatorName || '익명',
      title: p.title || '',
      targetQuantity: p.targetQuantity || 0,
      currentQuantity: p.currentQuantity || 0,
      achievementRate: (typeof p.achievementRate === 'number') ? p.achievementRate : null,
      likeCount: Number(p.likeCount) || 0,      // 서버 집계 좋아요 수(전역, 항상 채워짐)
      deadline: p.deadline || '',
      status: p.status || '',
      isLiked: liked,                           // 서버 viewer 기준 찜 여부
      isReserved: false,
      isPaid: false,
      category: p.category || '',
      createdAt: p.createdAt || '',
    };
  });
  window.MOCK_PRODUCTS = MOCK_PRODUCTS;

  // localStorage 의 예약/결제 플래그를 실데이터에 반영(좋아요는 서버 데이터를 신뢰)
  if (typeof syncUserState === 'function') syncUserState();

  // 외부 리스너에 데이터 갱신 알림 (빈 배열이어도 발행 → 빈 상태 렌더)
  window.dispatchEvent(new CustomEvent('mockproducts:updated', { detail: { items: MOCK_PRODUCTS } }));

  // 로그인 상태면 내 찜 id 를 받아 isLiked 보정(목록에 viewer LEFT JOIN 이 누락된 경우 대비).
  syncMyLikes();

  return items.length > 0;
}

/**
 * 로그인 사용자의 찜 id 목록(GET /api/me/likes)을 받아 products.isLiked 와 서버 찜 집합을 보정.
 * window.WZ.fetchMe 로 로그인 확인(미로그인은 호출 생략).
 */
async function syncMyLikes() {
  try {
    if (!(window.WZ && typeof window.WZ.fetchMe === 'function')) return;
    const me = await window.WZ.fetchMe();
    if (!me) return; // 비로그인: 서버 찜 없음
    const base = window.API_BASE_URL || (window.location.origin + '/api');
    const res = await fetch(base + '/me/likes', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    const ids = (data && Array.isArray(data.ids)) ? data.ids : [];
    // 서버 찜 집합 재구성
    _likedIdSet = Object.create(null);
    ids.forEach((id) => { _markLiked(id, true); });
    // 현재 로드된 products 의 isLiked 보정
    const idSet = {}; ids.forEach((id) => { idSet[String(id)] = true; });
    MOCK_PRODUCTS.forEach((p) => { p.isLiked = !!idSet[String(p.id)]; });
    window.dispatchEvent(new CustomEvent('likes:updated', { detail: { synced: true } }));
  } catch (_) { /* 무시 */ }
}

window.MOCK_PRODUCTS = MOCK_PRODUCTS;
window.loadProductsFromBackend = loadProductsFromBackend;
window.getLikeCount = getLikeCount;
window.syncMyLikes = syncMyLikes;

// 페이지 로드 후 자동 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadProductsFromBackend);
} else {
  loadProductsFromBackend();
}
