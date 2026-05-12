/**
 * 상세 마이페이지 렌더링
 * CSS는 외부에서 제공 — 여기서는 구조와 로직만 담당
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

/* ===== 예약 취소 함수 (전역) ===== */
function cancelReservation(productId) {
  if (!confirm('정말로 이 펀딩 참여(예약)를 취소하시겠습니까?')) return;

  // 통합 함수로 플래그 + delta + 사이즈 일괄 정리
  if (typeof setReserved === 'function') {
    setReserved(productId, false);
  }

  alert('예약이 정상적으로 취소되었습니다.');

  // UI 즉시 갱신 (새로고침 없이)
  switchProfileTab('joined');
}

/* 사용자 정보 — /api/auth/me 로 채워짐. 로그인 전이거나 fetch 실패 시 fallback. */
const SCHOOL_DOMAIN_TO_NAME = {
  'kookmin.ac.kr': '국민대학교',
};
const currentUser = {
  name: '게스트',
  university: '',
  department: '', // 백엔드에 학과 정보 없음 — 우선 비움
  avatarUrl: 'https://picsum.photos/seed/profile1/120/120',
  joinedFundingCount: 0,
  createdFundingCount: 0,
};

async function loadCurrentUser() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (!res.ok) {
      // 500/503 등 서버 장애는 강제 로그아웃 시키지 않고 fallback 값 유지
      throw new Error('failed to load /api/auth/me: ' + res.status);
    }
    const data = await res.json();
    currentUser.name = data.name || data.email || '사용자';
    currentUser.university = SCHOOL_DOMAIN_TO_NAME[data.schoolDomain] || data.schoolDomain || '';
    if (data.picture) currentUser.avatarUrl = data.picture;
  } catch (err) {
    console.error('failed to load user', err);
  }
}

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
  const esc = window.escapeHTML;

  // 방어 로직: MOCK_PRODUCTS가 로드되지 않았을 경우 빈 배열로 fallback
  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS
    : [];

  if (profileTab === 'liked') {
    items = products.filter((p) => p.isLiked === true);
  } else if (profileTab === 'joined') {
    items = products.filter((p) => p.isReserved === true);
    currentUser.joinedFundingCount = items.length;
  } else {
    items = [];
    currentUser.createdFundingCount = items.length;
  }

  if (items.length === 0) {
    const label = profileTab === 'liked' ? '찜한 상품' : profileTab === 'joined' ? '참여한 펀딩' : '제작한 펀딩';
    container.innerHTML = `
      <div style="text-align:center;padding:48px 20px;color:#9ca3af;">
        <p style="font-size:14px;">${esc(label)}이 아직 없습니다</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const rate = (typeof calcAchievementRate === 'function')
        ? calcAchievementRate(item)
        : 0;
      const id = encodeURIComponent(item.id);
      const title = esc(item.title);
      const imageUrl = esc(item.imageUrl);
      const priceText = esc(item.priceText);
      const sizeRaw = localStorage.getItem('selectedSize_' + item.id) || '미선택';
      const size = esc(sizeRaw);
      // item.id 가 number/string 이라 cancelReservation 인자에 그대로 전달.
      // onclick 핸들러는 quote 안전을 위해 JSON.stringify 로 감싼다.
      const cancelArg = JSON.stringify(item.id);
      const cancelBtn = (profileTab === 'joined' && !item.isPaid)
        ? '<button onclick="event.stopPropagation(); cancelReservation(' + cancelArg + ')" style="background:#fee2e2;color:#ef4444;border:none;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;align-self:center;">취소</button>'
        : '';
      return `
    <div style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid #f0f0f0;">
      <a href="detail.html?id=${id}" style="display:flex;gap:12px;cursor:pointer;text-decoration:none;color:inherit;flex:1;min-width:0;">
        <div style="width:64px;height:64px;border-radius:10px;overflow:hidden;flex-shrink:0;">
          <img src="${imageUrl}" alt="${title}" style="width:100%;height:100%;object-fit:cover;">
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${priceText} · ${rate}% 달성 · 사이즈: ${size}</div>
        </div>
      </a>
      ${cancelBtn}
    </div>
  `;
    })
    .join('');
}

function renderProfile() {
  const main = document.getElementById('profileMain');
  const esc = window.escapeHTML;
  const userName = esc(currentUser.name);
  const userAvatar = esc(currentUser.avatarUrl);
  const userUni = esc(currentUser.university);
  const userDept = esc(currentUser.department);
  const metaLine = [userUni, userDept].filter(Boolean).join(' · ');

  main.innerHTML = `
    <!-- 유저 프로필 정보 -->
    <section id="profileInfo" style="padding:24px 20px;text-align:center;border-bottom:8px solid #f5f5f5;">
      <img src="${userAvatar}" alt="${userName}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;margin-bottom:12px;">
      <div style="font-size:18px;font-weight:700;color:#1a1a1a;">${userName}</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:4px;">${metaLine}</div>
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
  // 카운트는 number 라 escape 불필요하지만 일관성을 위해 거친다.
  orderSection.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:16px;">배송/결제 현황</div>
    <div style="display:flex;justify-content:space-around;text-align:center;">
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:#2563eb;">${esc(MOCK_ORDER_STATUS.paymentPending)}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">결제 대기</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:#2563eb;">${esc(MOCK_ORDER_STATUS.paymentDone)}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">결제 완료</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:#2563eb;">${esc(MOCK_ORDER_STATUS.shippingReady)}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">배송 준비</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:#2563eb;">${esc(MOCK_ORDER_STATUS.shippingDone)}</div>
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
    { icon: 'message', label: '1:1 문의', href: '/support.html' },
    { icon: 'megaphone', label: '공지사항', href: '/notice.html' },
  ];

  const iconMap = {
    heart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
    bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    message: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    megaphone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/></svg>',
  };

  // menuItems 는 정적 배열 — 외부 데이터 아님. 그래도 일관성을 위해 escape.
  menuSection.innerHTML = menuItems
    .map(
      (item) => `
    <a href="${esc(item.href)}" ${item.onclick ? 'onclick="' + item.onclick + '; return false;"' : ''} style="display:flex;align-items:center;gap:14px;padding:14px 20px;text-decoration:none;color:#1a1a1a;border-bottom:1px solid #f5f5f5;">
      <span style="color:#6b7280;">${iconMap[item.icon]}</span>
      <span style="font-size:14px;font-weight:500;flex:1;">${esc(item.label)}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
    </a>
  `
    )
    .join('');

  main.appendChild(menuSection);

  renderProfileTabContent();
}

(async function init() {
  await loadCurrentUser();
  renderProfile();
})();
