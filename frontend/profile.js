/**
 * 상세 마이페이지 렌더링
 * CSS는 외부에서 제공 — 여기서는 구조와 로직만 담당
 */

/* 임시 유저 데이터 */
const MOCK_USER = {
  name: '이로운',
  university: '국민대학교',
  department: '소프트웨어학부',
  level: 3,
  levelTitle: '굿즈 크리에이터',
  points: 1250,
  avatarUrl: 'https://picsum.photos/seed/profile1/120/120',
  joinedFundingCount: 0,
  createdFundingCount: 0,
};

/* 탭 상태 */
let profileTab = 'liked'; // 'liked' | 'joined' | 'created'

/* 배송/결제 현황 카운트 (임시) */
const MOCK_ORDER_STATUS = {
  paymentPending: 0,
  paymentDone: 0,
  shippingReady: 0,
  shippingDone: 0,
};

function switchProfileTab(tab) {
  profileTab = tab;
  renderProfileTabs();
  renderProfileTabContent();
}

function renderProfileTabs() {
  const likedBtn = document.getElementById('tabLiked');
  const joinedBtn = document.getElementById('tabJoined');
  const createdBtn = document.getElementById('tabCreated');
  [likedBtn, joinedBtn, createdBtn].forEach((btn) => {
    if (!btn) return;
    if (btn.id === 'tab' + profileTab.charAt(0).toUpperCase() + profileTab.slice(1)) {
      btn.style.borderBottom = '2px solid #2563eb';
      btn.style.color = '#2563eb';
    } else {
      btn.style.borderBottom = '2px solid transparent';
      btn.style.color = '#9ca3af';
    }
  });
}

function renderProfileTabContent() {
  const container = document.getElementById('profileTabContent');
  let items;

  // 방어 로직: MOCK_PRODUCTS가 로드되지 않았을 경우 빈 배열로 fallback
  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS
    : [];

  if (profileTab === 'liked') {
    items = products.filter((p) => p.isLiked === true);
  } else if (profileTab === 'joined') {
    items = products.filter((p) => p.isReserved === true);
    MOCK_USER.joinedFundingCount = items.length;
  } else {
    // 제작한 펀딩 — 현재 mock에서는 없으므로 빈 배열
    items = [];
    MOCK_USER.createdFundingCount = items.length;
  }

  if (items.length === 0) {
    const label = profileTab === 'liked' ? '찜한 상품' : profileTab === 'joined' ? '참여한 펀딩' : '제작한 펀딩';
    container.innerHTML = `
      <div style="text-align:center;padding:48px 20px;color:#9ca3af;">
        <p style="font-size:14px;">${label}이 아직 없습니다</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      // 방어 로직: calcAchievementRate가 로드되지 않았을 경우 0으로 fallback
      const rate = (typeof calcAchievementRate === 'function')
        ? calcAchievementRate(item)
        : 0;
      return `
    <a href="detail.html?id=${item.id}" style="display:flex;gap:12px;padding:14px 20px;border-bottom:1px solid #f0f0f0;cursor:pointer;text-decoration:none;color:inherit;">
      <div style="width:64px;height:64px;border-radius:10px;overflow:hidden;flex-shrink:0;">
        <img src="${item.imageUrl}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;">
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.title}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${item.priceText} · ${rate}% 달성 · 사이즈: ${localStorage.getItem('selectedSize_' + item.id) || '미선택'}</div>
      </div>
    </a>
  `;
    })
    .join('');
}

function renderProfile() {
  const main = document.getElementById('profileMain');

  main.innerHTML = `
    <!-- 유저 프로필 정보 -->
    <section id="profileInfo" style="padding:24px 20px;text-align:center;border-bottom:8px solid #f5f5f5;">
      <img src="${MOCK_USER.avatarUrl}" alt="${MOCK_USER.name}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;margin-bottom:12px;">
      <div style="font-size:18px;font-weight:700;color:#1a1a1a;">${MOCK_USER.name}</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:4px;">${MOCK_USER.university} · ${MOCK_USER.department}</div>
      <div style="display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:6px 14px;background:#eff6ff;border-radius:20px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span style="font-size:13px;font-weight:600;color:#2563eb;">Lv.${MOCK_USER.level} ${MOCK_USER.levelTitle}</span>
      </div>
      <div style="margin-top:8px;font-size:12px;color:#6b7280;">${MOCK_USER.points.toLocaleString()} 포인트</div>
    </section>

    <!-- 내 프로젝트 관리 -->
    <section id="projectManage" style="padding:16px 20px;border-bottom:8px solid #f5f5f5;">
      <div style="display:flex;gap:10px;">
        <button onclick="switchProfileTab('liked');document.getElementById('profileTabContent').scrollIntoView({behavior:'smooth'})" style="flex:1;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-size:14px;font-weight:600;color:#1a1a1a;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          나의 활동
        </button>
        <button style="flex:1;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-size:14px;font-weight:600;color:#1a1a1a;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          프로젝트 관리
        </button>
      </div>
    </section>

    <!-- 탭: 참여한 펀딩 / 제작한 펀딩 -->
    <section style="border-bottom:8px solid #f5f5f5;">
      <div style="display:flex;border-bottom:1px solid #f0f0f0;">
        <button id="tabLiked" onclick="switchProfileTab('liked')" style="flex:1;padding:14px 0;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid #2563eb;color:#2563eb;">좋아요</button>
        <button id="tabJoined" onclick="switchProfileTab('joined')" style="flex:1;padding:14px 0;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;color:#9ca3af;">참여한 펀딩</button>
        <button id="tabCreated" onclick="switchProfileTab('created')" style="flex:1;padding:14px 0;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;color:#9ca3af;">제작한 펀딩</button>
      </div>
      <div id="profileTabContent"></div>
    </section>
`;

  // 배송/결제 현황 + 하단 메뉴는 append
  const orderSection = document.createElement('section');
  orderSection.id = 'orderStatus';
  orderSection.style.cssText = 'padding:20px;border-bottom:8px solid #f5f5f5;';
  orderSection.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:16px;">배송/결제 현황</div>
    <div style="display:flex;justify-content:space-around;text-align:center;">
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:#2563eb;">${MOCK_ORDER_STATUS.paymentPending}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">결제 대기</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:#2563eb;">${MOCK_ORDER_STATUS.paymentDone}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">결제 완료</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:#2563eb;">${MOCK_ORDER_STATUS.shippingReady}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">배송 준비</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:#2563eb;">${MOCK_ORDER_STATUS.shippingDone}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">배송 완료</div>
      </div>
    </div>
  `;
  main.appendChild(orderSection);

  // 하단 메뉴 리스트
  const menuSection = document.createElement('section');
  menuSection.id = 'profileMenu';
  menuSection.style.cssText = 'padding:8px 0;';

  const menuItems = [
    { icon: 'heart', label: '찜한 굿즈 아이디어', href: '#', onclick: "switchProfileTab('liked');document.getElementById('profileTabContent').scrollIntoView({behavior:'smooth'})" },
    { icon: 'bell', label: '알림 내역', href: '#' },
    { icon: 'message', label: '1:1 문의', href: '#' },
    { icon: 'megaphone', label: '공지사항', href: '#' },
  ];

  const iconMap = {
    heart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
    bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    message: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    megaphone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/></svg>',
  };

  menuSection.innerHTML = menuItems
    .map(
      (item) => `
    <a href="${item.href}" ${item.onclick ? 'onclick="' + item.onclick + '; return false;"' : ''} style="display:flex;align-items:center;gap:14px;padding:14px 20px;text-decoration:none;color:#1a1a1a;border-bottom:1px solid #f5f5f5;">
      <span style="color:#6b7280;">${iconMap[item.icon]}</span>
      <span style="font-size:14px;font-weight:500;flex:1;">${item.label}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
    </a>
  `
    )
    .join('');

  main.appendChild(menuSection);

  // 탭 콘텐츠 초기 렌더링
  renderProfileTabContent();
}

renderProfile();
