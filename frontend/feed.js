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

let currentCategory = '전체';
let currentSort = 'popular';
let currentDept = 'all';
let currentKeyword = '';

/* ===== URL 파라미터에서 초기 카테고리/검색어 추출 (메인 페이지에서 진입 시) ===== */
(function applyInitialCategoryFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const c = params.get('category');
    const allowed = ['전체', '과잠', '반팔티', '에코백'];
    if (c && allowed.includes(c)) currentCategory = c;

    const q = params.get('q') || params.get('search');
    if (q) currentKeyword = String(q).trim();

    const s = params.get('sort');
    if (s === 'latest' || s === 'popular') currentSort = s;
  } catch (_) { /* ignore */ }
})();

/* ===== 초기화 ===== */
document.addEventListener('DOMContentLoaded', () => {
  renderCategoryChips();
  renderDeptFilter();
  renderFeedList();
});

// 백엔드 상품 데이터 도착하면 다시 렌더
window.addEventListener('mockproducts:updated', () => {
  renderDeptFilter();
  renderFeedList();
});

/* ===== 카테고리 칩 렌더링 ===== */
function renderCategoryChips() {
  const container = document.getElementById('categoryChips');
  if (!container) return;

  const esc = window.escapeHTML;
  const categories = ['전체', '과잠', '반팔티', '에코백'];
  container.innerHTML = categories
    .map((cat) => {
      const isActive = cat === currentCategory;
      const safeCat = esc(cat);
      return `<button onclick="selectCategory('${safeCat}')" style="padding:8px 16px;border:1.5px solid ${isActive ? '#2563eb' : '#e5e7eb'};border-radius:20px;background:${isActive ? '#eff6ff' : '#fff'};font-size:13px;font-weight:600;color:${isActive ? '#2563eb' : '#6b7280'};cursor:pointer;white-space:nowrap;transition:all 0.15s;flex-shrink:0;">${safeCat}</button>`;
    })
    .join('');
}

/* ===== 학과 필터 렌더링 ===== */
function renderDeptFilter() {
  const select = document.getElementById('deptFilter');
  if (!select) return;

  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS : [];
  const depts = [...new Set(products.map((p) => p.department))];
  const esc = window.escapeHTML;

  select.innerHTML = '<option value="all">전체 학과</option>' +
    depts.map((d) => '<option value="' + esc(d) + '">' + esc(d) + '</option>').join('');
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

function onFilterChange() {
  const select = document.getElementById('deptFilter');
  currentDept = select ? select.value : 'all';
  renderFeedList();
}

/* ===== 데이터 가공 (필터 + 정렬) ===== */
function getProcessedProducts() {
  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS : [];

  // 1. 카테고리 필터
  let filtered = currentCategory === '전체'
    ? [...products]
    : products.filter((p) => p.category === currentCategory);

  // 2. 학과 필터
  if (currentDept !== 'all') {
    filtered = filtered.filter((p) => p.department === currentDept);
  }

  // 3. 키워드 검색 (제목/설명/카테고리 부분일치)
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
    filtered.sort((a, b) => b.likeCount - a.likeCount);
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
        <p class="empty-title">해당 조건의 상품이 없습니다</p>
        <p class="empty-sub">다른 필터를 선택해 보세요</p>
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
      return `
    <article class="feed-card" onclick="location.href='detail.html?id=${id}'">
      <div class="feed-card__thumb">
        <img src="${imageUrl}" alt="${title}" loading="lazy">
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
