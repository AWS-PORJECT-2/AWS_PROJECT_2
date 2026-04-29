/**
 * 공구 피드 페이지
 * mock-data.js의 MOCK_PRODUCTS를 사용하여 렌더링합니다.
 * likeCount 높은 순으로 정렬하여 상위 노출합니다.
 */

function renderFeedList() {
  const container = document.getElementById('feedList');
  const sorted = sortByLikes(MOCK_PRODUCTS);

  container.innerHTML = sorted
    .map((item) => {
      const rate = calcAchievementRate(item);
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

renderFeedList();
