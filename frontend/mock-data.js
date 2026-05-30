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
 * 좋아요 토글 (localStorage + isLiked + delta 동기화)
 */
function toggleLike(productId) {
  const product = MOCK_PRODUCTS.find((p) => p.id === productId);
  const flagKey = 'liked_' + productId;
  const deltaKey = 'liked_delta_' + productId;
  const currentDelta = Number(localStorage.getItem(deltaKey)) || 0;

  // MOCK 목록에 없는 펀드(상세 API 직접 진입) — localStorage 단독으로 토글
  if (!product) {
    const nowLiked = localStorage.getItem(flagKey) !== '1';
    localStorage.setItem(flagKey, nowLiked ? '1' : '0');
    localStorage.setItem(deltaKey, String(currentDelta + (nowLiked ? 1 : -1)));
    return nowLiked;
  }

  if (product.isLiked) {
    // 좋아요 해제
    localStorage.setItem(flagKey, '0');
    localStorage.setItem(deltaKey, String(currentDelta - 1));
    product.likeCount--;
    product.isLiked = false;
    return false;
  } else {
    // 좋아요 추가
    localStorage.setItem(flagKey, '1');
    localStorage.setItem(deltaKey, String(currentDelta + 1));
    product.likeCount++;
    product.isLiked = true;
    return true;
  }
}

/**
 * 좋아요 여부 확인
 */
function isLiked(productId) {
  const val = localStorage.getItem('liked_' + productId);
  if (val !== null) return val === '1';
  const product = MOCK_PRODUCTS.find((p) => p.id === productId);
  return product ? product.isLiked : false;
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
 * 페이지 로드 시 localStorage와 isLiked/isReserved/수치 동기화
 * - 스토리지에 기록이 없으면(null) 기존 목데이터 값을 유지
 * - delta 값을 읽어 원본 + delta = 최종값 (멱등성 보장)
 */
function syncUserState() {
  MOCK_PRODUCTS.forEach((p) => {
    // 원본 값 보존 (최초 1회만 저장)
    if (typeof p._baseLikeCount === 'undefined') {
      p._baseLikeCount = p.likeCount;
    }
    if (typeof p._baseCurrentQuantity === 'undefined') {
      p._baseCurrentQuantity = p.currentQuantity;
    }

    // 플래그 복원 (null이면 seed data 유지)
    const liked = localStorage.getItem('liked_' + p.id);
    const reserved = localStorage.getItem('reserved_' + p.id);

    if (liked !== null) {
      p.isLiked = liked === '1';
    }
    if (reserved !== null) {
      p.isReserved = reserved === '1';
    }

    // isPaid 복원
    const paid = localStorage.getItem('paid_' + p.id);
    if (paid !== null) {
      p.isPaid = paid === '1';
    }

    // 수치: 원본 + delta = 최종값 (누적 아닌 대입)
    const likeDelta = Number(localStorage.getItem('liked_delta_' + p.id)) || 0;
    const reservedDelta = Number(localStorage.getItem('reserved_delta_' + p.id)) || 0;

    p.likeCount = p._baseLikeCount + likeDelta;
    p.currentQuantity = p._baseCurrentQuantity + reservedDelta;
  });
}

// 초기화
syncUserState();


/**
 * 백엔드(/api/groupbuys)에서 상품 목록을 가져와 MOCK_PRODUCTS 를 덮어씀.
 * 실패 시 기존 mock 데이터 유지 (페이지 동작 보장).
 */
async function loadProductsFromBackend() {
  try {
    const base = window.API_BASE_URL || (window.location.origin + '/api');
    const res = await fetch(base + '/groupbuys?sort=popular&limit=20', {
      credentials: 'include',
    });
    if (!res.ok) {
      console.warn('백엔드 상품 조회 실패:', res.status);
      return false;
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.items) || data.items.length === 0) return false;

    MOCK_PRODUCTS = data.items.map(function (p) {
      return {
        id: p.id,
        creatorId: p.creatorId || null,  // 제작한 펀딩 필터용 (내 userId 와 비교)
        imageUrl: p.imageUrl || _JACKET_IMGS[0],
        author: p.author || '익명',
        authorAvatar: p.authorAvatar || ('https://picsum.photos/seed/avatar-' + encodeURIComponent(p.id) + '/48/48'),
        department: p.department || '',
        title: p.title,
        price: p.price ?? 0,
        priceText: p.priceText || (p.price ? p.price.toLocaleString('ko-KR') + '원' : ''),
        description: p.description || '',
        targetQuantity: p.targetQuantity || 0,
        currentQuantity: p.currentQuantity || 0,
        likeCount: p.likeCount || 0,
        meta: p.meta || '',
        deadline: p.deadline || '',
        isLiked: false,
        isReserved: false,
        isPaid: false,
        sizeType: p.sizeType || 'multiple',
        category: p.category || '',
        createdAt: p.createdAt || '',
      };
    });
    window.MOCK_PRODUCTS = MOCK_PRODUCTS;

    // localStorage 의 좋아요/예약/결제 플래그를 실데이터에 반영 (좋아요·참여한 펀딩 탭이 채워지도록)
    if (typeof syncUserState === 'function') syncUserState();

    // 외부 리스너에 데이터 갱신 알림
    window.dispatchEvent(new CustomEvent('mockproducts:updated', { detail: { items: MOCK_PRODUCTS } }));
    return true;
  } catch (err) {
    console.warn('백엔드 상품 조회 에러:', err);
    return false;
  }
}

window.MOCK_PRODUCTS = MOCK_PRODUCTS;
window.loadProductsFromBackend = loadProductsFromBackend;

// 페이지 로드 후 자동 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadProductsFromBackend);
} else {
  loadProductsFromBackend();
}
