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
  const esc = window.escapeHTML;

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
      const id = encodeURIComponent(item.id);
      const title = esc(item.title);
      const meta = esc(item.meta);
      const priceText = esc(item.priceText);
      const imageUrl = esc(item.imageUrl);
      const likeCount = esc(item.likeCount);
      return `
    <article class="feed-item" onclick="location.href='detail.html?id=${id}'">
      <div class="feed-thumb">
        <img src="${imageUrl}" alt="${title}">
      </div>
      <div class="feed-info">
        <div>
          <div class="feed-title">${title}</div>
          <div class="feed-meta">${meta}</div>
        </div>
        <div class="feed-price-row">
          <span class="feed-price">${priceText}</span>
          <span class="feed-progress">${rate}% 달성</span>
        </div>
        <div class="feed-stats">
          <span class="feed-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            ${likeCount}
          </span>
        </div>
      </div>
    </article>
  `;
    })
    .join('');
}
