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

/* ===== 배송조회 모달 (PR#19) ===== */
async function openTrackingModal() {
  var existing = document.getElementById('trackingModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'trackingModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:700;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML =
    '<div onclick="closeTrackingModal()" style="position:absolute;inset:0;background:rgba(0,0,0,0.4);"></div>' +
    '<div style="position:relative;background:#fff;border-radius:16px;padding:24px;width:90%;max-width:400px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.15);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
        '<h3 style="font-size:17px;font-weight:700;color:#1a1a1a;">배송조회</h3>' +
        '<button onclick="closeTrackingModal()" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:20px;">×</button>' +
      '</div>' +
      '<div id="trackingContent" style="color:#6b7280;font-size:14px;text-align:center;padding:20px;">불러오는 중...</div>' +
    '</div>';
  document.body.appendChild(modal);

  try {
    var orders = await window.api.get('/me/orders', { silentAuthFail: true });
    var container = document.getElementById('trackingContent');
    if (!container) return;
    if (!orders || orders.length === 0) {
      container.innerHTML = '<p style="color:#9ca3af;">주문 내역이 없습니다</p>';
      return;
    }
    var shippingOrders = orders.filter(function (o) {
      return o.status === 'shipping' || o.status === 'shipping_ready' || o.status === 'delivered';
    });
    if (shippingOrders.length === 0) {
      container.innerHTML = '<p style="color:#9ca3af;">배송 중인 주문이 없습니다</p>';
      return;
    }
    container.innerHTML = '';
    shippingOrders.forEach(function (order) {
      var statusText = { shipping_ready: '배송 준비', shipping: '배송 중', delivered: '배송 완료' };
      var statusColor = { shipping_ready: '#f97316', shipping: '#8b5cf6', delivered: '#16a34a' };
      var card = document.createElement('div');
      card.style.cssText = 'padding:12px;border:1px solid #f0f0f0;border-radius:10px;margin-bottom:8px;text-align:left;';
      var header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
      var idSpan = document.createElement('span');
      idSpan.style.cssText = 'font-size:13px;font-weight:600;color:#1a1a1a;';
      idSpan.textContent = '주문 #' + String(order.id).slice(0, 8);
      var statusSpan = document.createElement('span');
      statusSpan.style.cssText = 'font-size:12px;font-weight:600;color:' + (statusColor[order.status] || '#6b7280') + ';';
      statusSpan.textContent = statusText[order.status] || order.status;
      header.appendChild(idSpan);
      header.appendChild(statusSpan);
      card.appendChild(header);
      var amountDiv = document.createElement('div');
      amountDiv.style.cssText = 'font-size:12px;color:#9ca3af;margin-top:4px;';
      amountDiv.textContent = (order.amount != null ? order.amount.toLocaleString() : '0') + '원';
      card.appendChild(amountDiv);
      if (order.trackingNumber) {
        var btn = document.createElement('button');
        btn.style.cssText = 'margin-top:8px;width:100%;padding:8px;border:1px solid #8b5cf6;border-radius:8px;background:#fff;color:#8b5cf6;font-size:13px;font-weight:600;cursor:pointer;';
        btn.textContent = '택배 추적';
        btn.addEventListener('click', function () { viewTracking(order.id); });
        card.appendChild(btn);
      } else {
        var noTrack = document.createElement('div');
        noTrack.style.cssText = 'margin-top:8px;font-size:12px;color:#9ca3af;';
        noTrack.textContent = '운송장 미등록';
        card.appendChild(noTrack);
      }
      container.appendChild(card);
    });
  } catch (e) {
    var errContainer = document.getElementById('trackingContent');
    if (errContainer) errContainer.innerHTML = '<p style="color:#ef4444;">주문 정보를 불러올 수 없습니다</p>';
  }
}

function closeTrackingModal() {
  var modal = document.getElementById('trackingModal');
  if (modal) modal.remove();
}

async function viewTracking(orderId) {
  try {
    var data = await window.api.get('/orders/' + orderId + '/tracking');
    var container = document.getElementById('trackingContent');
    if (!container) return;
    var html = '<div style="text-align:left;">' +
      '<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f0f0f0;">' +
        '<div style="font-size:14px;font-weight:600;color:#1a1a1a;">현재 상태: ' + window.escapeHTML(data.status) + '</div>' +
        '<div style="font-size:12px;color:#9ca3af;margin-top:2px;">운송장: ' + window.escapeHTML(data.trackingNumber) + '</div>' +
      '</div>';
    if (data.events && data.events.length > 0) {
      html += data.events.map(function (ev) {
        return '<div style="padding:8px 0;border-bottom:1px solid #f9fafb;">' +
          '<div style="font-size:13px;font-weight:500;color:#1a1a1a;">' + window.escapeHTML(ev.description || ev.status) + '</div>' +
          '<div style="font-size:11px;color:#9ca3af;margin-top:2px;">' + window.escapeHTML(ev.location) + ' · ' + window.escapeHTML(ev.time) + '</div>' +
        '</div>';
      }).join('');
    } else {
      html += '<p style="color:#9ca3af;font-size:13px;">추적 정보가 아직 없습니다</p>';
    }
    html += '</div>';
    container.innerHTML = html;
  } catch (e) {
    alert('배송 추적 실패: ' + (e.message || ''));
  }
}

/* 사용자 정보 — /api/auth/me 로 채워짐.
 * loadError 가 채워지면 renderProfile 이 "정보를 불러오지 못했습니다" 배너를 띄운다.
 * 절대로 "게스트" 같은 가짜 신원을 사용자에게 노출하지 않는다.
 */
const SCHOOL_DOMAIN_TO_NAME = {
  'kookmin.ac.kr': '국민대학교',
};
const currentUser = {
  userId: null,
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
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.status === 401 || res.status === 410) {
      window.location.href = '/login.html';
      return false; // 호출자에게 "더 진행하지 마라" 신호
    }
    if (!res.ok) {
      throw new Error('failed to load /api/auth/me: HTTP ' + res.status);
    }
    const data = await res.json();
    currentUser.userId = data.userId || null;
    currentUser.name = data.name || data.email || '';
    currentUser.university = SCHOOL_DOMAIN_TO_NAME[data.schoolDomain] || data.schoolDomain || '';
    if (data.picture) currentUser.avatarUrl = data.picture;
    currentUser.loaded = true;
    return true;
  } catch (err) {
    console.error('[profile] failed to load user', err);
    currentUser.loadError = (err && err.message) ? err.message : String(err);
    return true; // 페이지는 렌더하되 에러 배너 표시
  }
}

/* 탭 상태 */
let profileTab = 'liked'; // 'liked' | 'joined' | 'created'

/* 배송/결제 현황 카운트 — /api/orders/status-counts 에서 채움 (PR#19 방식) */
let MOCK_ORDER_STATUS = {
  paymentPending: 0,
  paidReady: 0,
  shipping: 0,
  delivered: 0,
};

async function loadOrderStatusCounts() {
  try {
    const data = await window.api.get('/orders/status-counts', { silentAuthFail: true });
    if (data) MOCK_ORDER_STATUS = data;
  } catch (e) { /* 실패 시 0 유지 */ }
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
      btn.style.borderBottom = '2px solid #8b5cf6';
      btn.style.color = '#8b5cf6';
    } else {
      btn.style.borderBottom = '2px solid transparent';
      btn.style.color = '#9ca3af';
    }
  });
}

const FUND_STATUS_LABEL = {
  pending: ['심사 중', '#92400e', '#fef3c7'],
  rejected: ['반려됨', '#9ca3af', '#f3f4f6'],
  open: ['모집 중', '#7c3aed', '#f3f0fe'],
  achieved: ['달성', '#16a34a', '#dcfce7'],
  executing: ['제작 중', '#2563eb', '#eff6ff'],
  completed: ['완료', '#16a34a', '#dcfce7'],
  failed: ['무산', '#9ca3af', '#f3f4f6'],
  cancelled: ['취소', '#9ca3af', '#f3f4f6'],
};
const BACKING_STATUS_LABEL = {
  awaiting_deposit: ['입금 대기', '#92400e', '#fef3c7'],
  confirmed: ['후원 확정', '#16a34a', '#dcfce7'],
  cancelled: ['취소', '#9ca3af', '#f3f4f6'],
};

function statusBadge(map, status) {
  const esc = window.escapeHTML;
  const m = map[status] || [status, '#6b7280', '#f3f4f6'];
  return `<span style="display:inline-block;padding:3px 9px;border-radius:7px;font-size:11px;font-weight:700;color:${m[1]};background:${m[2]};">${esc(m[0])}</span>`;
}

function rowItemHtml(opts) {
  const esc = window.escapeHTML;
  const id = encodeURIComponent(opts.id);
  return `
    <a href="detail.html?id=${id}" style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid #f0f0f0;text-decoration:none;color:inherit;">
      <div style="width:64px;height:64px;border-radius:10px;overflow:hidden;flex-shrink:0;background:#f3f4f6;">
        ${opts.imageUrl ? `<img src="${esc(opts.imageUrl)}" alt="${esc(opts.title)}" style="width:100%;height:100%;object-fit:cover;">` : ''}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(opts.title)}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">${opts.sub || ''}</div>
      </div>
      ${opts.badge || ''}
    </a>`;
}

function renderEmpty(container, label) {
  const esc = window.escapeHTML;
  container.innerHTML = `<div style="text-align:center;padding:48px 20px;color:#9ca3af;"><p style="font-size:14px;">${esc(label)}이 아직 없습니다</p></div>`;
}

function renderProfileTabContent() {
  const container = document.getElementById('profileTabContent');
  if (!container) return;

  if (profileTab === 'liked') {
    const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS)) ? MOCK_PRODUCTS : [];
    const items = products.filter((p) => p.isLiked === true);
    if (items.length === 0) { renderEmpty(container, '찜한 상품'); return; }
    container.innerHTML = items.map((item) => {
      const rate = (typeof calcAchievementRate === 'function') ? calcAchievementRate(item) : 0;
      return rowItemHtml({ id: item.id, title: item.title, imageUrl: item.imageUrl, sub: (item.priceText || '') + ' · ' + rate + '% 달성' });
    }).join('');
    return;
  }

  // joined(내 후원)·created(내 펀드)는 서버 실데이터
  container.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;">불러오는 중…</div>';
  if (profileTab === 'joined') {
    loadMyBackings(container);
  } else {
    loadMyFunds(container);
  }
}

async function loadMyFunds(container) {
  const esc = window.escapeHTML;
  try {
    const res = await window.api.get('/me/funds', { silentAuthFail: true });
    const items = (res && res.items) || [];
    currentUser.createdFundingCount = items.length;
    if (!items.length) { renderEmpty(container, '제작한 펀딩'); return; }
    container.innerHTML = '';
    items.forEach((f) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid #f0f0f0;';
      const link = document.createElement('a');
      link.href = 'detail.html?id=' + encodeURIComponent(f.id);
      link.style.cssText = 'display:flex;gap:12px;flex:1;min-width:0;text-decoration:none;color:inherit;';
      link.innerHTML = `
        <div style="width:64px;height:64px;border-radius:10px;overflow:hidden;flex-shrink:0;background:#f3f4f6;">
          ${f.imageUrl ? `<img src="${esc(f.imageUrl)}" alt="${esc(f.title)}" style="width:100%;height:100%;object-fit:cover;">` : ''}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.title)} ${statusBadge(FUND_STATUS_LABEL, f.status)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:4px;">${f.achievementRate || 0}% 달성 · ${Number(f.finalPrice || 0).toLocaleString('ko-KR')}원~</div>
        </div>`;
      row.appendChild(link);
      // 삭제 요청 — 취소/반려 상태가 아니면 노출
      if (f.status !== 'cancelled' && f.status !== 'rejected') {
        const del = document.createElement('button');
        del.type = 'button'; del.textContent = '삭제 요청';
        del.style.cssText = 'background:#fef2f2;color:#ef4444;border:1px solid #fecaca;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;';
        del.addEventListener('click', () => requestFundDelete(f.id));
        row.appendChild(del);
      }
      container.appendChild(row);
    });
  } catch (e) {
    renderEmpty(container, '제작한 펀딩');
  }
}

async function requestFundDelete(fundId) {
  const reason = prompt('삭제 요청 사유를 입력해 주세요 (관리자가 검토 후 삭제·환불 처리합니다):', '');
  if (reason === null) return;
  try {
    await window.api.post('/me/funds/' + encodeURIComponent(fundId) + '/delete-request', { reason: reason });
    alert('삭제 요청이 접수되었습니다. 관리자 확인 후 처리됩니다.');
  } catch (e) {
    alert('삭제 요청 실패: ' + ((e && e.message) || ''));
  }
}

async function loadMyBackings(container) {
  try {
    const res = await window.api.get('/me/backings', { silentAuthFail: true });
    const items = (res && res.items) || [];
    currentUser.joinedFundingCount = items.length;
    if (!items.length) { renderEmpty(container, '참여한 펀딩'); return; }
    container.innerHTML = items.map((o) => rowItemHtml({
      id: o.fundId, title: o.fundTitle, imageUrl: o.fundImageUrl,
      sub: o.rewardTitle + ' · ' + Number(o.amount || 0).toLocaleString('ko-KR') + '원' +
        (o.depositorName ? ' · 입금자 ' + window.escapeHTML(o.depositorName) : ''),
      badge: statusBadge(BACKING_STATUS_LABEL, o.status),
    })).join('');
  } catch (e) {
    renderEmpty(container, '참여한 펀딩');
  }
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
      <img src="${userAvatar}" alt="${userName}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;margin-bottom:12px;">
      <div style="font-size:18px;font-weight:700;color:#1a1a1a;">${userName}</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:4px;">${metaLine}</div>
    </section>

    <!-- 내 프로젝트 관리 -->
    <section id="projectManage" style="padding:16px 20px;border-bottom:8px solid #f5f5f5;">
      <div style="display:flex;gap:10px;">
        <button onclick="switchProfileTab('liked');document.getElementById('profileTabContent').scrollIntoView({behavior:'smooth'})" style="flex:1;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-size:14px;font-weight:600;color:#1a1a1a;cursor:pointer;display:flex;align-items:center;justify-content:center;">
          나의 활동
        </button>
        <button onclick="switchProfileTab('created');document.getElementById('profileTabContent').scrollIntoView({behavior:'smooth'})" style="flex:1;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-size:14px;font-weight:600;color:#1a1a1a;cursor:pointer;display:flex;align-items:center;justify-content:center;">
          프로젝트 관리
        </button>
      </div>
    </section>

    <!-- 탭: 참여한 펀딩 / 제작한 펀딩 -->
    <section style="border-bottom:8px solid #f5f5f5;">
      <div style="display:flex;border-bottom:1px solid #f0f0f0;">
        <button id="tabLiked" onclick="switchProfileTab('liked')" style="flex:1;padding:14px 0;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid #8b5cf6;color:#8b5cf6;">좋아요</button>
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
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div style="font-size:16px;font-weight:700;color:#1a1a1a;">배송/결제 현황</div>
      <button onclick="openTrackingModal()" style="font-size:13px;color:#8b5cf6;font-weight:600;background:none;border:none;cursor:pointer;">배송조회 →</button>
    </div>
    <div style="display:flex;justify-content:space-around;text-align:center;">
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:#8b5cf6;">${esc(MOCK_ORDER_STATUS.paymentPending)}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">결제 대기</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:#8b5cf6;">${esc(MOCK_ORDER_STATUS.paidReady)}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">결제 완료<br>배송 준비</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:#8b5cf6;">${esc(MOCK_ORDER_STATUS.shipping)}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">배송 중</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;color:#8b5cf6;">${esc(MOCK_ORDER_STATUS.delivered)}</div>
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
    <a href="${esc(item.href)}" ${item.onclick ? 'onclick="' + item.onclick + '; return false;"' : ''} style="display:flex;align-items:center;padding:14px 20px;text-decoration:none;color:#1a1a1a;border-bottom:1px solid #f5f5f5;">
      <span style="font-size:14px;font-weight:500;flex:1;">${esc(item.label)}</span>
    </a>
  `
    )
    .join('');

  main.appendChild(menuSection);

  renderProfileTabContent();
}

(async function init() {
  // loadCurrentUser 가 false 면 401/410 으로 인한 redirect 진행 중 — 깜빡임 방지를 위해 렌더 스킵
  const shouldRender = await loadCurrentUser();
  if (shouldRender) {
    await loadOrderStatusCounts(); // 배송/결제 현황 카운트 채운 뒤 렌더 (PR#19)
    renderProfile();
    // mock-data 의 백엔드 상품 로드가 끝나면 탭 내용(좋아요/참여/제작) 갱신
    window.addEventListener('mockproducts:updated', function () {
      if (typeof renderProfileTabContent === 'function') renderProfileTabContent();
    });
  }
})();
