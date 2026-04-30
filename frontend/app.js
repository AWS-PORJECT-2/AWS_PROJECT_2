/**
 * 홈 화면 — 실시간 펀딩 현황
 * mock-data.js의 MOCK_PRODUCTS를 likeCount 순으로 정렬하여 표시합니다.
 */

function getBadgeInfo(rate) {
  if (rate >= 100) return { text: '마감임박', type: 'urgent' };
  if (rate >= 50) return { text: '모집중', type: 'open' };
  return { text: '모집중', type: 'open' };
}

/**
 * 히어로 배너 — 좋아요 1위 상품 ID를 링크에 동적 바인딩
 */
function renderHeroBanner() {
  const link = document.getElementById('heroBannerLink');
  if (!link) return;

  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS
    : [];
  const sorted = (typeof sortByLikes === 'function') ? sortByLikes(products) : products;
  const topProduct = sorted[0];

  if (topProduct) {
    link.href = 'detail.html?id=' + topProduct.id;
  }
}

function renderFundingCards() {
  const container = document.getElementById('fundingCards');
  const sorted = sortByLikes(MOCK_PRODUCTS);

  container.innerHTML = sorted
    .map((item) => {
      const rate = calcAchievementRate(item);
      const badge = getBadgeInfo(rate);
      const logo = item.department.substring(0, 2).toUpperCase();
      return `
    <a href="detail.html?id=${item.id}" class="funding-card">
      <div class="card-thumb">
        <img src="${item.imageUrl}" alt="${item.title}">
        <span class="card-badge ${badge.type}">${badge.text}</span>
        <span class="card-logo">${logo}</span>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-price">${item.priceText}</div>
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
