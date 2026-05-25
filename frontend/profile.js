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

/* ===== 로그아웃 ===== */
async function handleLogout() {
  try {
    await window.api.post('/auth/logout');
  } catch (e) {
    console.warn('로그아웃 API 실패:', e);
    // 서버 세션 정리 실패해도 클라이언트 쿠키는 만료되므로 진행
  }
  window.location.href = '/login.html';
}

/* ===== 프로필 수정 모달 ===== */
function openProfileEdit() {
  var existing = document.getElementById('profileEditModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'profileEditModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:700;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML =
    '<div onclick="closeProfileEdit()" style="position:absolute;inset:0;background:rgba(0,0,0,0.4);"></div>' +
    '<div style="position:relative;background:#fff;border-radius:16px;padding:24px;width:90%;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.15);">' +
      '<h3 style="font-size:17px;font-weight:700;margin-bottom:20px;color:#1a1a1a;">프로필 수정</h3>' +
      '<div style="text-align:center;margin-bottom:20px;">' +
        '<div style="position:relative;display:inline-block;cursor:pointer;" onclick="document.getElementById(\'editFileInput\').click()">' +
          '<img id="editAvatarPreview" src="' + window.escapeHTML(currentUser.avatarUrl) + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">' +
          '<div style="position:absolute;bottom:0;right:0;width:28px;height:28px;border-radius:50%;background:#2563eb;border:2px solid #fff;display:flex;align-items:center;justify-content:center;">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>' +
          '</div>' +
        '</div>' +
        '<input type="file" id="editFileInput" accept="image/*" style="display:none;" onchange="previewProfileImage(this)">' +
        '<p style="font-size:12px;color:#9ca3af;margin-top:8px;">사진을 클릭하여 변경</p>' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="font-size:13px;color:#6b7280;display:block;margin-bottom:4px;">이름</label>' +
        '<input type="text" id="editName" value="' + window.escapeHTML(currentUser.name) + '" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">' +
      '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button onclick="closeProfileEdit()" style="flex:1;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;font-size:14px;font-weight:600;cursor:pointer;">취소</button>' +
        '<button onclick="saveProfileEdit()" style="flex:1;padding:12px;border:none;border-radius:10px;background:#2563eb;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">저장</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
}

var _pendingProfilePicture = null;

function previewProfileImage(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  if (file.size > 5 * 1024 * 1024) { alert('이미지는 5MB 이하만 가능합니다'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('editAvatarPreview').src = e.target.result;
    _pendingProfilePicture = e.target.result; // base64 data URL
  };
  reader.readAsDataURL(file);
}

function closeProfileEdit() {
  _pendingProfilePicture = null;
  var modal = document.getElementById('profileEditModal');
  if (modal) modal.remove();
}

async function saveProfileEdit() {
  var name = document.getElementById('editName').value.trim();

  if (!name) { alert('이름을 입력해주세요'); return; }

  var body = { name: name };
  if (_pendingProfilePicture) body.picture = _pendingProfilePicture;

  try {
    await window.api.patch('/auth/me', body);
    _pendingProfilePicture = null;
    closeProfileEdit();
    window.location.reload();
  } catch (err) {
    alert('수정 실패: ' + (err.message || ''));
  }
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

/* ===== 아코디언 토글 ===== */
function toggleAccordion(id) {
  var content = document.getElementById(id + '-content');
  var arrow = document.getElementById(id + '-arrow');
  if (!content) return;

  if (content.style.display === 'none') {
    content.style.display = 'block';
    arrow.style.transform = 'rotate(180deg)';
    renderAccordionContent(id);
  } else {
    content.style.display = 'none';
    arrow.style.transform = 'rotate(0deg)';
  }
}

function renderAccordionContent(id) {
  var container = document.getElementById(id + '-content');
  if (!container) return;

  var products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS : [];
  var esc = window.escapeHTML;
  var items;

  if (id === 'accordion-joined') {
    items = products.filter(function(p) { return p.isReserved === true; });
  } else if (id === 'accordion-liked') {
    items = products.filter(function(p) { return p.isLiked === true; });
  } else {
    items = [];
  }

  if (items.length === 0) {
    var label = id === 'accordion-joined' ? '참여한 펀딩' : '찜한 굿즈 아이디어';
    container.innerHTML = '<div style="text-align:center;padding:24px 20px;color:#9ca3af;font-size:13px;">' + esc(label) + '이 아직 없습니다</div>';
    return;
  }

  container.innerHTML = items.map(function(item) {
    var rate = (typeof calcAchievementRate === 'function') ? calcAchievementRate(item) : 0;
    var itemId = encodeURIComponent(item.id);
    var title = esc(item.title);
    var imageUrl = esc(item.imageUrl);
    var priceText = esc(item.priceText);
    var size = esc(localStorage.getItem('selectedSize_' + item.id) || 'Free');
    return '<a href="detail.html?id=' + itemId + '" style="display:flex;gap:12px;padding:12px 20px;text-decoration:none;color:inherit;border-bottom:1px solid #f0f0f0;">' +
      '<div style="width:52px;height:52px;border-radius:8px;overflow:hidden;flex-shrink:0;">' +
        '<img src="' + imageUrl + '" alt="' + title + '" style="width:100%;height:100%;object-fit:cover;">' +
      '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + title + '</div>' +
        '<div style="font-size:11px;color:#9ca3af;margin-top:2px;">' + priceText + ' · ' + rate + '% 달성 · 사이즈: ' + size + '</div>' +
      '</div>' +
    '</a>';
  }).join('');
}

/* 사용자 정보 — /api/auth/me 로 채워짐.
 * loadError 가 채워지면 renderProfile 이 "정보를 불러오지 못했습니다" 배너를 띄운다.
 * 절대로 "게스트" 같은 가짜 신원을 사용자에게 노출하지 않는다.
 */
const SCHOOL_DOMAIN_TO_NAME = {
  'kookmin.ac.kr': '국민대학교',
};
const currentUser = {
  name: '',
  university: '',
  department: '',
  avatarUrl: 'https://picsum.photos/seed/profile1/120/120',
  joinedFundingCount: 0,
  createdFundingCount: 0,
  loaded: false,
  loadError: null,
};

async function loadCurrentUser() {
  try {
    const data = await window.api.get('/auth/me');
    currentUser.name = data.name || data.email || '';
    currentUser.university = SCHOOL_DOMAIN_TO_NAME[data.schoolDomain] || data.schoolDomain || '';
    if (data.picture) currentUser.avatarUrl = data.picture;
    currentUser.loaded = true;
    return true;
  } catch (err) {
    if (err && (err.code === 'NOT_AUTHENTICATED' || err.status === 401 || err.status === 410)) {
      // api.js가 refresh 시도 후에도 실패하거나 유저 삭제(410)면 로그인으로
      window.location.href = '/login.html';
      return false;
    }
    console.error('[profile] failed to load user', err);
    currentUser.loadError = (err && err.message) ? err.message : String(err);
    return true; // 페이지는 렌더하되 에러 배너 표시
  }
}

/* 탭 상태 */
let profileTab = 'joined'; // 'joined' | 'created'

/* 배송/결제 현황 카운트 */
let MOCK_ORDER_STATUS = {
  paymentPending: 0,
  paidReady: 0,
  shipping: 0,
  delivered: 0,
};

async function loadOrderStatusCounts() {
  try {
    var data = await window.api.get('/orders/status-counts', { silentAuthFail: true });
    if (data) {
      MOCK_ORDER_STATUS = data;
    }
  } catch (e) { /* 실패 시 0으로 유지 */ }
}

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
  const displayName = currentUser.loaded
    ? currentUser.name
    : (currentUser.loadError ? '정보를 불러오지 못했습니다' : '불러오는 중…');
  const userName = esc(displayName);
  const userAvatar = esc(currentUser.avatarUrl);
  const userUni = esc(currentUser.university);
  const userDept = esc(currentUser.department);
  const metaLine = currentUser.loaded
    ? [userUni, userDept].filter(Boolean).join(' · ')
    : '';
  const errorBanner = currentUser.loadError
    ? `<div style="background:#fef2f2;color:#991b1b;padding:10px 16px;font-size:13px;border-bottom:1px solid #fecaca;">프로필 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요. (${esc(currentUser.loadError)})</div>`
    : '';

  main.innerHTML = `
    ${errorBanner}
    <!-- 유저 프로필 정보 -->
    <section id="profileInfo" style="padding:24px 20px;text-align:center;border-bottom:8px solid #f5f5f5;">
      <div style="position:relative;display:inline-block;">
        <img id="profileAvatar" src="${userAvatar}" alt="${userName}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;margin-bottom:12px;">
        <button onclick="openProfileEdit()" style="position:absolute;bottom:10px;right:-4px;width:24px;height:24px;border-radius:50%;background:#2563eb;border:2px solid #fff;cursor:pointer;display:flex;align-items:center;justify-content:center;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
      <div style="font-size:18px;font-weight:700;color:#1a1a1a;">${userName}</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:4px;">${metaLine}</div>
    </section>

    <!-- 배송/결제 현황 -->
    <section id="orderStatus" style="padding:20px;border-bottom:8px solid #f5f5f5;">
      <div style="font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:16px;">배송/결제 현황</div>
      <div style="display:flex;justify-content:space-around;text-align:center;">
        <div style="flex:1;">
          <div style="font-size:20px;font-weight:700;color:#2563eb;">${esc(MOCK_ORDER_STATUS.paymentPending)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:4px;">결제 대기</div>
        </div>
        <div style="flex:1;">
          <div style="font-size:20px;font-weight:700;color:#2563eb;">${esc(MOCK_ORDER_STATUS.paidReady)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:4px;">결제 완료<br>배송 준비</div>
        </div>
        <div style="flex:1;">
          <div style="font-size:20px;font-weight:700;color:#2563eb;">${esc(MOCK_ORDER_STATUS.shipping)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:4px;">배송 중</div>
        </div>
        <div style="flex:1;">
          <div style="font-size:20px;font-weight:700;color:#2563eb;">${esc(MOCK_ORDER_STATUS.delivered)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:4px;">배송 완료</div>
        </div>
      </div>
    </section>

    <!-- 카테고리 메뉴 (아코디언) -->
    <section style="border-bottom:8px solid #f5f5f5;">
      <div id="profileTabContent" style="display:none;"></div>
    </section>
`;

  // 하단 메뉴 리스트 — 아코디언 방식
  const menuSection = document.createElement('section');
  menuSection.id = 'profileMenu';
  menuSection.style.cssText = 'padding:0;';

  const menuItems = [
    { id: 'accordion-joined', label: '참여한 펀딩', type: 'accordion', content: 'joined' },
    { id: 'accordion-liked', label: '찜한 굿즈 아이디어', type: 'accordion', content: 'liked' },
    { label: '결제 수단 관리', href: '/payment-manage.html' },
    { label: '배송지 관리', href: '/address-manage.html' },
    { label: '1:1 문의', href: '/support.html' },
    { label: '공지사항', href: '/notice.html' },
    { label: '설정', href: '/settings.html' },
    { label: '로그아웃', href: '#', onclick: 'handleLogout()', isLogout: true },
  ];

  menuSection.innerHTML = menuItems.map(function(item) {
    if (item.type === 'accordion') {
      return '<div style="border-bottom:1px solid #f5f5f5;">' +
        '<a href="#" onclick="toggleAccordion(\'' + item.id + '\'); return false;" style="display:flex;align-items:center;padding:14px 20px;text-decoration:none;color:#1a1a1a;">' +
          '<span style="font-size:14px;font-weight:500;flex:1;">' + esc(item.label) + '</span>' +
          '<svg id="' + item.id + '-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="2" style="transition:transform 0.2s;"><path d="M6 9l6 6 6-6"/></svg>' +
        '</a>' +
        '<div id="' + item.id + '-content" style="display:none;background:#fafafa;"></div>' +
      '</div>';
    }
    var color = item.isLogout ? '#ef4444' : '#1a1a1a';
    var onclickAttr = item.onclick ? ' onclick="' + item.onclick + '; return false;"' : '';
    return '<a href="' + esc(item.href || '#') + '"' + onclickAttr + ' style="display:flex;align-items:center;padding:14px 20px;text-decoration:none;color:' + color + ';border-bottom:1px solid #f5f5f5;">' +
      '<span style="font-size:14px;font-weight:500;flex:1;">' + esc(item.label) + '</span>' +
      (item.isLogout ? '' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>') +
    '</a>';
  }).join('');

  main.appendChild(menuSection);

  renderProfileTabContent();
}

(async function init() {
  // loadCurrentUser 가 false 면 401/410 으로 인한 redirect 진행 중 — 깜빡임 방지를 위해 렌더 스킵
  const shouldRender = await loadCurrentUser();
  if (shouldRender) {
    await loadOrderStatusCounts();
    renderProfile();
  }
})();
