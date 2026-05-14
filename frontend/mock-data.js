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

const MOCK_PRODUCTS = [
  {
    id: 1,
    imageUrl: 'https://picsum.photos/seed/feed1/600/600',
    author: '김민수',
    authorAvatar: 'https://picsum.photos/seed/avatar1/48/48',
    department: '소프트웨어학부',
    title: '국민대학교 실시간 인기 순위 과잠',
    price: 1,
    priceText: '1원',
    description: '2026년 신규 디자인 국민대학교 과잠입니다. 고급 울 소재에 자수 로고가 들어간 프리미엄 에디션이에요. 사이즈는 S/M/L/XL 중 선택 가능하며, 캠퍼스 내 직수령으로 진행됩니다.',
    targetQuantity: 50,
    currentQuantity: 60,
    likeCount: 142,
    comments: 34,
    meta: '캠퍼스 내 직수령 · 1시간 전',
    deadline: '2026-05-15',
    isLiked: true,
    isReserved: true,
    isPaid: false,
    sizeType: 'multiple',
    category: '과잠',
    createdAt: '2026-04-29T09:00:00Z',
  },
  {
    id: 2,
    imageUrl: 'https://picsum.photos/seed/feed2/600/600',
    author: '이서연',
    authorAvatar: 'https://picsum.photos/seed/avatar2/48/48',
    department: '경영학부',
    title: '국민대학교 블랙 반팔티 공구',
    price: 1,
    priceText: '1원',
    description: '깔끔한 블랙 반팔티에 국민대 로고가 미니멀하게 들어간 디자인입니다. 면 100% 소재로 편안한 착용감을 제공합니다.',
    targetQuantity: 30,
    currentQuantity: 24,
    likeCount: 85,
    comments: 12,
    meta: '캠퍼스 내 직수령 · 3시간 전',
    deadline: '2026-05-20',
    isLiked: true,
    isReserved: false,
    isPaid: false,
    sizeType: 'multiple',
    category: '반팔티',
    createdAt: '2026-04-29T06:00:00Z',
  },
  {
    id: 3,
    imageUrl: 'https://picsum.photos/seed/feed3/600/600',
    author: '박지훈',
    authorAvatar: 'https://picsum.photos/seed/avatar3/48/48',
    department: '디자인학부',
    title: '[앵콜] 국민대학교 과잠 디자인 에디션',
    price: 1,
    priceText: '1원',
    description: '지난 시즌 완판된 디자인 에디션 과잠의 앵콜 공구입니다. 디자인학부 학생이 직접 디자인한 한정판으로, 자수 퀄리티가 매우 높습니다.',
    targetQuantity: 40,
    currentQuantity: 80,
    likeCount: 210,
    comments: 56,
    meta: '캠퍼스 내 직수령 · 5시간 전',
    deadline: '2026-05-10',
    isLiked: false,
    isReserved: true,
    isPaid: false,
    sizeType: 'multiple',
    category: '과잠',
    createdAt: '2026-04-29T04:00:00Z',
  },
  {
    id: 4,
    imageUrl: 'https://picsum.photos/seed/feed4/600/600',
    author: '최유진',
    authorAvatar: 'https://picsum.photos/seed/avatar4/48/48',
    department: '체육학부',
    title: '국민대학교 미니멀 에코백',
    price: 1,
    priceText: '1원',
    description: '데일리로 메기 좋은 미니멀 에코백입니다. 국민대 심볼이 한쪽에 작게 자수 처리되어 있어 깔끔합니다. 두꺼운 캔버스 원단으로 튼튼해요.',
    targetQuantity: 60,
    currentQuantity: 27,
    likeCount: 45,
    comments: 8,
    meta: '캠퍼스 내 직수령 · 1일 전',
    deadline: '2026-05-25',
    isLiked: false,
    isReserved: false,
    isPaid: false,
    sizeType: 'free',
    category: '에코백',
    createdAt: '2026-04-28T12:00:00Z',
  },
];

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
  if (!product) return false;

  const flagKey = 'liked_' + productId;
  const deltaKey = 'liked_delta_' + productId;
  const currentDelta = Number(localStorage.getItem(deltaKey)) || 0;

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
  if (!product) return;

  const flagKey = 'reserved_' + productId;
  const deltaKey = 'reserved_delta_' + productId;

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
