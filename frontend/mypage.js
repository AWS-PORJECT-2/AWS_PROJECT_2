/**
 * 나의 활동/관심 페이지
 * 탭 상태 관리 + 데이터 필터링
 */

let currentTab = 'liked'; // 'liked' | 'reserved'

/**
 * 탭 전환
 */
function switchTab(tab) {
  currentTab = tab;

  const tabLiked = document.getElementById('tabLiked');
  const tabReserved = document.getElementById('tabReserved');

  if (tab === 'liked') {
    tabLiked.style.borderBottom = '2px solid #2563eb';
    tabLiked.style.color = '#2563eb';
    tabReserved.style.borderBottom = '2px solid transparent';
    tabReserved.style.color = '#9ca3af';
  } else {
    tabReserved.style.borderBottom = '2px solid #2563eb';
    tabReserved.style.color = '#2563eb';
    tabLiked.style.borderBottom = '2px solid transparent';
    tabLiked.style.color = '#9ca3af';
  }

  renderMypageList();
}

/**
 * 필터링된 데이터 가져오기
 */
function getFilteredProducts() {
  if (currentTab === 'liked') {
    return MOCK_PRODUCTS.filter((p) => p.isLiked === true);
  }
  return MOCK_PRODUCTS.filter((p) => p.isReserved === true);
}

/**
 * 리스트 렌더링
 */
function renderMypageList() {
  const container = document.getElementById('mypageList');
  const items = getFilteredProducts();

  if (items.length === 0) {
    const label = currentTab === 'liked' ? '찜한 상품' : '예약한 상품';
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#9ca3af;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" style="margin:0 auto 16px;">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
        </svg>
        <p style="font-size:15px;font-weight:600;color:#6b7280;">${label}이 없습니다</p>
        <p style="font-size:13px;margin-top:6px;">공구 피드에서 마음에 드는 상품을 찾아보세요</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const rate = calcAchievementRate(item);
      return `
    <div style="display:flex;gap:14px;padding:16px 20px;border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="location.href='detail.html?id=${item.id}'">
      <div style="width:110px;height:110px;border-radius:12px;overflow:hidden;flex-shrink:0;">
        <img src="${item.imageUrl}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;">
      </div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:space-between;min-width:0;">
        <div>
          <div style="font-size:15px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${item.title}
          </div>
          <div style="font-size:12px;color:#9ca3af;margin-top:4px;">
            국민대학교 · ${item.department}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
          <span style="font-size:16px;font-weight:700;color:#1a1a1a;">${item.priceText}</span>
          <span style="font-size:13px;font-weight:600;color:#2563eb;">${rate}% 달성</span>
        </div>
        <div style="margin-top:8px;">
          <div style="height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;">
            <div style="height:100%;background:#2563eb;border-radius:2px;width:${Math.min(rate, 100)}%;"></div>
          </div>
        </div>
      </div>
    </div>
  `;
    })
    .join('');
}

// 초기 렌더링
renderMypageList();
