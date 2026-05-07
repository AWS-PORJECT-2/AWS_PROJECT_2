/**
 * 공구 피드 페이지
 * - 카테고리 필터 (전체/의류/문구/잡화/기타)
 * - 학과 필터
 * - 정렬 (인기순/최신순)
 */

let currentCategory = '전체';
let currentSort = 'popular';
let currentDept = 'all';

/* ===== 초기화 ===== */
document.addEventListener('DOMContentLoaded', () => {
  renderCategoryChips();
  renderDeptFilter();
  renderFeedList();
});

/* ===== 카테고리 칩 렌더링 ===== */
function renderCategoryChips() {
  const container = document.getElementById('categoryChips');
  if (!container) return;

  const categories = ['전체', '의류', '문구', '잡화', '기타'];
  container.innerHTML = categories
    .map((cat) => {
      const isActive = cat === currentCategory;
      return `<button onclick="selectCategory('${cat}')" style="padding:8px 16px;border:1.5px solid ${isActive ? '#2563eb' : '#e5e7eb'};border-radius:20px;background:${isActive ? '#eff6ff' : '#fff'};font-size:13px;font-weight:600;color:${isActive ? '#2563eb' : '#6b7280'};cursor:pointer;white-space:nowrap;transition:all 0.15s;flex-shrink:0;">${cat}</button>`;
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

  select.innerHTML = '<option value="all">전체 학과</option>' +
    depts.map((d) => '<option value="' + d + '">' + d + '</option>').join('');
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
    : products.filter((p) => (p.category || '기타') === currentCategory);

  // 2. 학과 필터
  if (currentDept !== 'all') {
    filtered = filtered.filter((p) => p.department === currentDept);
  }

  // 3. 정렬
  if (currentSort === 'latest') {
    filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else {
    filtered.sort((a, b) => b.likeCount - a.likeCount);
  }

  return filtered;
}

/* ===== 피드 리스트 렌더링 ===== */
function renderFeedList() {
  const container = document.getElementById('feedList');
  if (!container) return;

  const items = getProcessedProducts();

  if (items.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#9ca3af;">
        <p style="font-size:15px;font-weight:600;color:#6b7280;">해당 조건의 상품이 없습니다</p>
        <p style="font-size:13px;margin-top:6px;">다른 필터를 선택해 보세요</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const rate = (typeof calcAchievementRate === 'function') ? calcAchievementRate(item) : 0;
      return `
    <article class="feed-item" onclick="location.href='detail.html?id=${item.id}'">
      <div class="feed-thumb">
        <img src="${item.imageUrl}" alt="${item.title}">
      </div>
      <div class="feed-info">
        <div>
          <div class="feed-title">${item.title}</div>
          <div class="feed-meta">${item.meta}</div>
        </div>
        <div class="feed-price-row">
          <span class="feed-price">${item.priceText}</span>
          <span class="feed-progress">${rate}% 달성</span>
        </div>
        <div class="feed-stats">
          <span class="feed-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            ${item.comments}
          </span>
          <span class="feed-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            ${item.likeCount}
          </span>
        </div>
      </div>
    </article>
  `;
    })
    .join('');
}
