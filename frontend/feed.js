/**
 * 공구 피드 페이지
 * - 카테고리 필터 (전체/과잠/반팔티/에코백)
 * - 학과 필터
 * - 정렬 (인기순/최신순)
 *
 * 주의: HTML 보간 시 사용자 데이터는 반드시 escapeHTML 을 거친다.
 *   기본은 api.js 의 window.escapeHTML 을 사용하고, 미로드 시 아래 fallback 사용.
 */
if (typeof window.escapeHTML !== 'function') {
  window.escapeHTML = function (v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
}

let currentCategory = 'all'; // 'all' 또는 카테고리 slug
let currentSort = 'popular';
let currentKeyword = '';

/* ===== URL 파라미터에서 초기 카테고리/검색어 추출 (메인 페이지에서 진입 시) ===== */
(function applyInitialCategoryFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const c = params.get('category');
    if (c && typeof window.dtCategory === 'function' && window.dtCategory(c)) {
      currentCategory = window.dtCategory(c).slug;
    }

    const q = params.get('q') || params.get('search');
    if (q) currentKeyword = String(q).trim();

    const s = params.get('sort');
    if (s === 'latest' || s === 'popular') currentSort = s;
  } catch (_) { /* ignore */ }
})();

/* ===== 초기화 ===== */
document.addEventListener('DOMContentLoaded', () => {
  renderCategoryChips();
  renderFeedList();
});

// 백엔드 상품 데이터 도착하면 다시 렌더
window.addEventListener('mockproducts:updated', () => {
  renderFeedList();
});

/* ===== 카테고리 칩 렌더링 (categories.js 단일 소스 + 전체) ===== */
function renderCategoryChips() {
  const container = document.getElementById('categoryChips');
  if (!container) return;

  const esc = window.escapeHTML;
  const chips = [{ slug: 'all', label: '전체' }].concat(window.DT_CATEGORIES || []);
  container.innerHTML = chips
    .map((c) => {
      const isActive = c.slug === currentCategory;
      return `<button onclick="selectCategory('${esc(c.slug)}')" style="padding:8px 16px;border:1.5px solid ${isActive ? '#8b5cf6' : '#e5e7eb'};border-radius:20px;background:${isActive ? '#f3f0fe' : '#fff'};font-size:13px;font-weight:600;color:${isActive ? '#8b5cf6' : '#6b7280'};cursor:pointer;white-space:nowrap;transition:all 0.15s;flex-shrink:0;">${esc(c.label)}</button>`;
    })
    .join('');
}

/* ===== 이벤트 핸들러 ===== */
function selectCategory(cat) {
  currentCategory = cat;
  renderCategoryChips();
  renderFeedList();
}

function onSortChange() {
  const select = document.getElementById('sortSelect');
  currentSort = select ? select.value : 'popular';
  renderFeedList();
}

/* ===== 데이터 가공 (필터 + 정렬) ===== */
function getProcessedProducts() {
  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS : [];

  // 1. 카테고리 필터 (slug 기준, 'all'=전체)
  let filtered = currentCategory === 'all'
    ? [...products]
    : products.filter((p) => p.category === currentCategory);

  // 2. 키워드 검색 (제목/설명/카테고리 부분일치)
  if (currentKeyword) {
    const k = currentKeyword.toLowerCase();
    filtered = filtered.filter((p) => {
      const title = (p.title || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      return title.includes(k) || desc.includes(k) || cat.includes(k);
    });
  }

  // 3. 정렬
  if (currentSort === 'latest') {
    filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else {
    filtered.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
  }

  return filtered;
}

/* ===== 피드 리스트 렌더링 (4-col 그리드: 사진 → 소개글 → 달성률) ===== */
function renderFeedList() {
  const container = document.getElementById('feedList');
  if (!container) return;

  const items = getProcessedProducts();
  const esc = window.escapeHTML;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="feed-empty">
        <img class="feed-empty__img" src="/assets/empty-feed.png" alt="" onerror="this.remove()">
        <p class="empty-title">해당 조건의 프로젝트가 없어요</p>
        <p class="empty-sub">다른 필터를 선택하거나 첫 프로젝트를 올려보세요</p>
        <a class="dt-btn dt-btn--primary" href="/fund-create.html">프로젝트 올리기</a>
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const rate = (typeof calcAchievementRate === 'function') ? calcAchievementRate(item) : 0;
      const id = encodeURIComponent(item.id);
      const title = esc(item.title);
      const desc = esc(item.description ? item.description.split('.')[0] : '');
      const imageUrl = esc(item.imageUrl);
      const author = esc(item.author);
      const thumbInner = imageUrl
        ? `<img src="${imageUrl}" alt="${title}" loading="lazy" onerror="this.parentNode.classList.add('is-empty');this.remove()">`
        : '';
      return `
    <article class="feed-card" onclick="location.href='detail.html?id=${id}'">
      <div class="feed-card__thumb${imageUrl ? '' : ' is-empty'}">
        ${thumbInner}
      </div>
      <div class="feed-card__body">
        <p class="feed-card__author">${author}</p>
        <h3 class="feed-card__title">${title}</h3>
        <p class="feed-card__desc">${desc}</p>
        <div class="feed-card__progress">
          <span class="feed-card__rate">${rate}%</span>
          <span class="feed-card__rate-label">달성</span>
        </div>
      </div>
    </article>
  `;
    })
    .join('');
}

/* ===== 추천 카테고리 칩 클릭 핸들러 ===== */
document.addEventListener('DOMContentLoaded', () => {
  const recRow = document.getElementById('recommendRow');
  if (!recRow) return;
  recRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.rec-chip');
    if (!btn) return;
    recRow.querySelectorAll('.rec-chip').forEach((c) => c.classList.remove('rec-active'));
    btn.classList.add('rec-active');
    // 추천 키워드는 검색 키워드로 위임 (mock-data 에 없는 태그라 전체 노출)
    // 실제 백엔드 연결 시 GET /api/products?recommend=화사한 같은 식으로 확장 가능
    const rec = btn.getAttribute('data-rec');
    if (rec === 'all') {
      currentKeyword = '';
    } else {
      currentKeyword = rec;
    }
    renderFeedList();
  });
});
