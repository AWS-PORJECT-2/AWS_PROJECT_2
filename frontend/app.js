/**
 * 홈 화면 — 실시간 펀딩 현황
 * mock-data.js의 MOCK_PRODUCTS를 likeCount 순으로 정렬하여 표시합니다.
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

function getBadgeInfo(rate) {
  if (rate >= 100) return { text: '마감임박', type: 'urgent' };
  if (rate >= 50) return { text: '모집중', type: 'open' };
  return { text: '모집중', type: 'open' };
}

function renderHeroBanner() {
  const link = document.getElementById('heroBannerLink');
  if (!link) return;

  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS
    : [];
  const sorted = (typeof sortByLikes === 'function') ? sortByLikes(products) : products;
  const topProduct = sorted[0];

  if (topProduct) {
    link.href = 'detail.html?id=' + encodeURIComponent(topProduct.id);
  }
}

function renderFundingCards() {
  const container = document.getElementById('fundingCards');
  const sorted = sortByLikes(MOCK_PRODUCTS);
  const esc = window.escapeHTML;

  container.innerHTML = sorted
    .map((item) => {
      const rate = calcAchievementRate(item);
      const badge = getBadgeInfo(rate);
      const logo = esc(item.department.substring(0, 2).toUpperCase());
      const id = encodeURIComponent(item.id);
      const title = esc(item.title);
      const priceText = esc(item.priceText);
      const imageUrl = esc(item.imageUrl);
      return `
    <a href="detail.html?id=${id}" class="funding-card">
      <div class="card-thumb">
        <img src="${imageUrl}" alt="${title}">
        <span class="card-badge ${badge.type}">${badge.text}</span>
        <span class="card-logo">${logo}</span>
      </div>
      <div class="card-title">${title}</div>
      <div class="card-price">${priceText}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${Math.min(rate, 100)}%"></div>
      </div>
      <div class="progress-text">${rate}% 달성</div>
    </a>
  `;
    })
    .join('');
}

renderHeroBanner();
renderFundingCards();
