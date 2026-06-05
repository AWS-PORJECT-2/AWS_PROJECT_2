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
 * 좋아요 토글 — 로그인-우선 + 낙관적 UI + 서버 동기화.
 *  - 미로그인이 확실(window.__WZ_AUTHED === false)하면 토글하지 않고 즉시 로그인 페이지로.
 *  - 로그인 확정(=== true)이면 product.isLiked 즉시 뒤집고 likeCount ±1 후 POST/DELETE 동기화.
 *  - undefined(미확정)면 fetchMe 로 확인 후 진행. fetchMe 가 없으면 기존 폴백(낙관적 + 401 리다이렉트).
 */
function toggleLike(productId) {
  // 현재(변경 전) 찜 상태 — 토글을 막을 때 호출부의 하트 UI 를 실제 상태로 되돌리기 위해 반환.
  const curLiked = (typeof isLiked === 'function') ? isLiked(productId) : false;

  // 1) 로그인 안 한 게 확실하면 토글 없이 즉시 로그인으로(early return).
  //    반환값은 변경 전 상태 — classList.toggle('is-on', curLiked) 가 하트를 켜지 않게 함.
  if (window.__WZ_AUTHED === false) {
    location.href = '/login.html?return=' + _currentReturn();
    return curLiked;
  }
  // 2) 미확정(undefined)이면 캐시된 인증 상태를 fetchMe 로 확인 후 진행.
  //    동기 반환이 필요한 호출부(하트 토글)를 위해 일단 현재 상태를 반환하고,
  //    로그인 확정 시 _applyToggleLike 가 likes:updated 를 발행해 하트를 갱신한다.
  if (window.__WZ_AUTHED === undefined && window.WZ && typeof window.WZ.fetchMe === 'function') {
    window.WZ.fetchMe().then((me) => {
      window.__WZ_AUTHED = !!me;
      if (!me) { location.href = '/login.html?return=' + _currentReturn(); return; }
      _applyToggleLike(productId);
    }).catch(() => { _applyToggleLike(productId); });
    return curLiked;
  }
  // 3) 로그인 확정(true) 또는 fetchMe 미가용 — 기존 낙관적 토글 수행.
  return _applyToggleLike(productId);
}

/**
 * 실제 낙관적 토글 + 서버 동기화. 미로그인(401) 폴백 포함(인증 미확정 경로 대비).
 */
function _applyToggleLike(productId) {
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

  // 낙관적 토글을 취소(원상복구)하는 헬퍼 — 401(미로그인) 시 호출.
  const _rollbackOptimistic = () => {
    _markLiked(productId, wasLiked);
    if (product) {
      product.isLiked = wasLiked;
      product.likeCount = Math.max(0, (Number(product.likeCount) || 0) + (nowLiked ? -1 : 1));
    }
    window.dispatchEvent(new CustomEvent('likes:updated', { detail: { id: productId, liked: wasLiked } }));
  };

  // 백그라운드 서버 동기화 — window.api 로 호출해 401 시 자동 토큰 갱신을 활용.
  //  · silentAuthFail: 갱신 후에도 미로그인이면 api 가 자동 리다이렉트하지 않고 NOT_AUTHENTICATED 를 throw.
  //    → 여기서 낙관적 토글을 되돌린 뒤(롤백) 직접 로그인으로 유도(기존 동작 보존).
  const _syncPromise = (window.api && typeof window.api.post === 'function')
    ? (nowLiked
        ? window.api.post('/funds/' + encodeURIComponent(productId) + '/like', null, { silentAuthFail: true })
        : window.api.del('/funds/' + encodeURIComponent(productId) + '/like', null, { silentAuthFail: true }))
    // 폴백: window.api 미가용 시 기존 raw fetch 경로(드문 케이스).
    : fetch((window.API_BASE_URL || (window.location.origin + '/api')) + '/funds/' + encodeURIComponent(productId) + '/like',
        { method: nowLiked ? 'POST' : 'DELETE', credentials: 'include' })
        .then((res) => {
          if (res.status === 401) { const e = new Error('NOT_AUTHENTICATED'); e.status = 401; throw e; }
          if (!res.ok) return null;
          return res.json().catch(() => null);
        });

  _syncPromise
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
    .catch((err) => {
      // 미로그인(401) — 캐시 갱신 + 낙관적 토글 취소 후 로그인으로 유도.
      if (err && err.status === 401) {
        window.__WZ_AUTHED = false;
        _rollbackOptimistic();
        location.href = '/login.html?return=' + _currentReturn();
        return;
      }
      /* 그 외 네트워크 오류 시 낙관적 상태 유지 */
    });

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
    // limit=200 — 홈 그리드는 이 캐시를 로컬에서 재정렬/필터(정렬탭·카테고리칩)하므로 충분한 모수를 한 번에 확보.
    //  (과거 limit=20 이라 신규순·마감임박순·카테고리가 '인기 top20' 안에서만 동작해 부정확했다. 피드와 동일하게 200.)
    const res = await fetch(base + '/groupbuys?sort=popular&limit=200', {
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
      achievedAmount: Number(p.achievedAmount) || 0,   // 현재 모인 금액(카드 표시)
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
    window.__WZ_AUTHED = !!me; // 인증 상태 캐시(찜 로그인-우선 가드용)
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
window.syncMyLikes = syncMyLikes;

/**
 * 인증 상태 캐시 초기화 — 찜 로그인-우선 가드(window.__WZ_AUTHED)를 한 번 채운다.
 * httpOnly 쿠키라 동기로 못 읽으므로 fetchMe 결과를 캐시한다(확정 전까진 undefined → 폴백 경로).
 * loadProductsFromBackend → syncMyLikes 가 같은 플래그를 갱신하므로 중복 1회는 허용.
 */
function _initAuthFlag() {
  if (window.__WZ_AUTHED !== undefined) return; // 이미 확정됨
  if (window.WZ && typeof window.WZ.fetchMe === 'function') {
    window.WZ.fetchMe()
      .then((me) => { window.__WZ_AUTHED = !!me; })
      .catch(() => { /* 실패 시 undefined 유지 → 폴백 경로 */ });
  }
}
_initAuthFlag();

// 페이지 로드 후 자동 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadProductsFromBackend);
} else {
  loadProductsFromBackend();
}
