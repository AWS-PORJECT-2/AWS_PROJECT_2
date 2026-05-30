/**
 * 마이페이지 — 와디즈 마이페이지 레이아웃으로 재구축 (부록2 "프로필").
 *
 * 레이아웃(와디즈 마이):
 *   공통 Header()는 main.js(App, data-page="sub")가 #app에 자동 삽입.
 *   공통 푸터는 renderGlobalFooter()가 자동 append. 여기서 직접 추가하지 않는다.
 *
 *   [좌상단 아바타+이름+"설정" 버튼]
 *   ┌ 좌측 사이드바 ─────┐ ┌ 메인 ──────────────────────────────┐
 *   │ 최근 본            │ │ "OOO님, 안녕하세요" 인사            │
 *   │ 팔로잉             │ │ 스탯 카드 행                         │
 *   │ 간편결제 설정      │ │   펀딩+개수 / 후원 / 찜 / 알림        │
 *   │ 문의내역           │ │   포인트 / 쿠폰 (없으면 0)           │
 *   │ 프로젝트 만들기    │ │ "OOO님이 최근에 봤어요" 카드         │
 *   │ 설정               │ │   (localStorage recentFunds)         │
 *   │ …                  │ │ 안내 배너                            │
 *   └────────────────────┘ └──────────────────────────────────────┘
 *   모바일: 사이드바를 상단 가로 스크롤 칩으로.
 *
 * 보존: /api/auth/me 로드, /me/funds·/me/backings 목록(탭/패널 전환),
 *       삭제 요청 POST, 배송조회 모달(/me/orders, /orders/:id/tracking), 좋아요(찜) 카운트.
 *       응답 필드명·엔드포인트는 그대로 유지. UI/레이아웃만 와디즈형으로 재구축.
 *
 * 색: 토큰만 사용(var(--c-primary-*)). 하드코딩 hex/이모지 금지. 아이콘은 인라인 SVG(stroke=currentColor).
 * XSS: 사용자 데이터는 textContent. innerHTML에 사용자값 직접 주입 금지.
 */
if (typeof window.escapeHTML !== 'function') {
  window.escapeHTML = function (v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
}

/* DOM 헬퍼 — main.js의 el()이 로드돼 있으면 그걸 쓰고, 아니면 동일한 폴백을 사용. */
function pEl(tag, props, ...children) {
  if (typeof window.el === 'function') return window.el(tag, props, ...children);
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'onClick') node.addEventListener('click', v);
    else if (k === 'style') node.style.cssText = v;
    else if (k === 'href' || k === 'src' || k === 'alt' || k === 'aria-label') node.setAttribute(k, v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  }
  return node;
}

/* 인라인 SVG 아이콘 — stroke=currentColor 만 사용(이모지 금지) */
const PF_ICON = {
  recent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  following: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  pay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  inquiry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  create: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  backings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/><path d="M12 7v13"/><path d="M12 7S10.5 3 8 3a2 2 0 0 0 0 4z"/><path d="M12 7s1.5-4 4-4a2 2 0 0 1 0 4z"/></svg>',
  delivery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="13" height="11" rx="1"/><path d="M14 9h4l3 3v5h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  // 스탯 카드 아이콘
  st_fund: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>',
  st_back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  st_like: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
  st_bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  st_point: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-1.2 2-2.5 2.5v1"/><path d="M12 16h.01"/></svg>',
  st_coupon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z"/><path d="M9 7v10" stroke-dasharray="2 2"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
};

/* ===== 예약 취소 함수 (전역, 보존) ===== */
function cancelReservation(productId) {
  if (!confirm('정말로 이 펀딩 참여(예약)를 취소하시겠습니까?')) return;
  if (typeof setReserved === 'function') {
    setReserved(productId, false);
  }
  alert('예약이 정상적으로 취소되었습니다.');
  openProfilePanel('backings');
}

/* ===== 배송조회 모달 (보존, PR#19) ===== */
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
    var ordersResp = await window.api.get('/me/orders', { silentAuthFail: true });
    var orders = Array.isArray(ordersResp) ? ordersResp : ((ordersResp && ordersResp.orders) || []);
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

/* 사용자 정보 — /api/auth/me 로 채워짐. (보존: 필드명/엔드포인트 동일) */
const SCHOOL_DOMAIN_TO_NAME = {
  'kookmin.ac.kr': '국민대학교',
};
const currentUser = {
  userId: null,
  name: '',
  university: '',
  department: '',
  bio: '',
  avatarUrl: '',
  joinedFundingCount: null,
  createdFundingCount: null,
  followingCount: null,
  likedCount: null,
  notiCount: null,
  pointBalance: null,
  couponCount: null,
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
    currentUser.bio = data.bio || data.intro || data.about || '';
    if (data.picture) currentUser.avatarUrl = data.picture;
    if (data.avatarUrl) currentUser.avatarUrl = data.avatarUrl;
    // 포인트/쿠폰: 서버 값 있으면 사용, 없으면 0 (UI는 항상 노출)
    if (data.pointBalance != null) currentUser.pointBalance = Number(data.pointBalance);
    if (data.couponCount != null) currentUser.couponCount = Number(data.couponCount);
    currentUser.loaded = true;
    return true;
  } catch (err) {
    console.error('[profile] failed to load user', err);
    currentUser.loadError = (err && err.message) ? err.message : String(err);
    return true; // 페이지는 렌더하되 에러 배너 표시
  }
}

/* localStorage 기반 찜(좋아요) 개수 — liked_<id> === '1' 인 항목 카운트 (보존된 클라 상태) */
function countLikedLocal() {
  try {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^liked_/.test(k) && !/^liked_delta_/.test(k) && localStorage.getItem(k) === '1') n++;
    }
    return n;
  } catch (_) { return 0; }
}

/* recentFunds — detail.js가 { id, title, imageUrl } 형태로 저장. 마이페이지 "최근에 봤어요"에서 사용 */
function readRecentFunds() {
  try {
    const l = JSON.parse(localStorage.getItem('recentFunds') || '[]');
    return Array.isArray(l) ? l : [];
  } catch (_) { return []; }
}

/* ===== 좌측 사이드바 메뉴 정의 (와디즈 마이) =====
 * action: 'panel'(우측 메인에 패널 전환) | 'link'(이동) | 'soon'(준비 중·비활성)
 */
const SIDE_MENU = [
  { key: 'recent',    label: '최근 본 프로젝트', icon: 'recent',    action: 'panel' },
  { key: 'following', label: '팔로잉',           icon: 'following', action: 'panel' },
  { key: 'backings',  label: '후원한 프로젝트',  icon: 'backings',  action: 'panel' },
  { key: 'funds',     label: '개설한 프로젝트',  icon: 'create',    action: 'panel' },
  { key: 'pay',       label: '간편결제 설정',    icon: 'pay',       action: 'soon' },
  { key: 'delivery',  label: '배송조회',         icon: 'delivery',  action: 'tracking' },
  { key: 'inquiry',   label: '문의내역',         icon: 'inquiry',   action: 'soon' },
  { key: 'createNew', label: '프로젝트 만들기',  icon: 'create',    action: 'link', href: '/fund-create.html' },
  { key: 'settings',  label: '설정',             icon: 'settings',  action: 'link', href: '/settings.html' },
];

let activePanel = 'home'; // 'home' | 'recent' | 'following' | 'backings' | 'funds'

/* URL ?tab= 매핑 (헤더/드롭다운에서 진입하는 기존 쿼리 호환) */
function initialPanelFromQuery() {
  try {
    const t = new URLSearchParams(location.search).get('tab');
    const map = {
      backings: 'backings', joined: 'backings', backed: 'backings',
      funds: 'funds', created: 'funds',
      likes: 'recent', liked: 'recent',
      followers: 'following', following: 'following', follow: 'following',
      recent: 'recent',
    };
    if (t && map[t]) return map[t];
  } catch (_) { /* ignore */ }
  return 'home';
}

/* 패널 전환 (사이드바 클릭 시 우측 메인 영역 갱신) */
function openProfilePanel(panel) {
  activePanel = panel;
  highlightSidebar();
  renderPanel();
  // 메인 영역으로 스크롤(모바일에서 칩 클릭 시)
  if (window.innerWidth <= 1023) {
    const main = document.getElementById('pfPanel');
    if (main && typeof main.scrollIntoView === 'function') main.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function highlightSidebar() {
  document.querySelectorAll('.dt-my-sidelink').forEach((a) => {
    a.classList.toggle('is-active', a.dataset.panel === activePanel);
  });
}

/* 펀드/후원 상태 배지 — 토큰 클래스 사용 */
const FUND_STATUS_BADGE = {
  pending:   ['심사 중',  'dt-badge--ending'],
  rejected:  ['반려됨',   'dt-badge--proxy'],
  open:      ['모집 중',  'dt-badge--open'],
  achieved:  ['달성',     'dt-badge--success'],
  executing: ['제작 중',  'dt-badge--cat'],
  completed: ['완료',     'dt-badge--success'],
  failed:    ['무산',     'dt-badge--proxy'],
  cancelled: ['취소',     'dt-badge--proxy'],
};
const BACKING_STATUS_BADGE = {
  awaiting_deposit: ['입금 대기',  'dt-badge--ending'],
  confirmed:        ['후원 확정',  'dt-badge--success'],
  cancelled:        ['취소',       'dt-badge--proxy'],
};

function makeStatusBadge(map, status) {
  const m = map[status];
  const span = pEl('span', { class: 'dt-badge ' + (m ? m[1] : 'dt-badge--proxy') });
  span.textContent = m ? m[0] : String(status || '');
  return span;
}

/* 빈상태 — empty-*.png 일러스트 + 안내문 (+옵션 CTA) */
function emptyState(imgName, title, sub, cta) {
  const box = pEl('div', { class: 'dt-my-empty' });
  if (imgName) {
    const img = pEl('img', { class: 'dt-my-empty__img', src: '/assets/' + imgName, alt: '' });
    img.addEventListener('error', () => { img.remove(); });
    box.appendChild(img);
  }
  box.appendChild(pEl('p', { class: 'dt-my-empty__title' }, title));
  if (sub) box.appendChild(pEl('p', { class: 'dt-my-empty__sub' }, sub));
  if (cta) box.appendChild(pEl('a', { class: 'dt-btn dt-btn--outline', href: cta.href }, cta.label));
  return box;
}

/* ===== "최근에 봤어요" 카드 (홈 패널 + 전용 패널 공용) — ProjectCard 재사용 시도, 폴백 카드 ===== */
function recentCardsGrid(list) {
  const grid = pEl('div', { class: 'dt-my-pgrid' });
  const products = Array.isArray(window.MOCK_PRODUCTS) ? window.MOCK_PRODUCTS : null;
  list.forEach((it) => {
    // 공개 목록에 살아있으면 ProjectCard(달성률 등 메타 포함) 재사용
    let full = null;
    if (products) full = products.find((p) => String(p.id) === String(it.id));
    if (full && typeof window.ProjectCard === 'function') {
      grid.appendChild(window.ProjectCard(full));
      return;
    }
    // 폴백: recentFunds 저장 형태({id,title,imageUrl})로 간단 카드
    const card = pEl('a', { class: 'dt-pcard', href: '/detail.html?id=' + encodeURIComponent(it.id) });
    const thumb = pEl('div', { class: 'dt-pcard__thumb' });
    if (it.imageUrl) {
      const img = pEl('img', { src: it.imageUrl, alt: it.title || '', loading: 'lazy' });
      img.addEventListener('error', () => { img.remove(); });
      thumb.appendChild(img);
    }
    card.appendChild(thumb);
    const body = pEl('div', { class: 'dt-pcard__body' });
    body.appendChild(pEl('h3', { class: 'dt-pcard__title' }, it.title || ''));
    card.appendChild(body);
    grid.appendChild(card);
  });
  return grid;
}

/* 최근 본 섹션(홈/전용 공용) */
function recentSection(container, full) {
  let list = readRecentFunds();
  // 공개 목록 로드됐으면 존재하는 펀드만 (삭제/비공개 정리)
  const products = Array.isArray(window.MOCK_PRODUCTS) ? window.MOCK_PRODUCTS : null;
  if (products) {
    const ids = new Set(products.map((p) => String(p.id)));
    const filtered = list.filter((it) => ids.has(String(it.id)) || true); // recentFunds는 비공개여도 표시(localStorage 단독)
    list = filtered;
  }
  const sec = pEl('section', { class: 'dt-my-sec' });
  const head = pEl('div', { class: 'dt-my-sec__head' });
  const name = currentUser.name || '회원';
  const titleText = name + '님이 최근에 봤어요';
  head.appendChild(pEl('h2', { class: 'dt-my-sec__title' }, titleText));
  if (!full && list.length > 0) {
    const more = pEl('button', { class: 'dt-my-sec__more', type: 'button' }, '전체보기');
    more.appendChild(spanIcon('chevron', 'dt-my-sec__more-ic'));
    more.addEventListener('click', () => openProfilePanel('recent'));
    head.appendChild(more);
  }
  sec.appendChild(head);

  if (list.length === 0) {
    sec.appendChild(emptyState('empty-feed.png', '최근 본 프로젝트가 없어요', '관심 가는 프로젝트를 둘러보면 여기에 모아드려요.', { href: '/feed.html', label: '프로젝트 둘러보기' }));
    return sec;
  }
  sec.appendChild(recentCardsGrid(full ? list : list.slice(0, 4)));
  return sec;
}

function spanIcon(key, cls) {
  const s = pEl('span', { class: cls || 'dt-my-ic' });
  s.innerHTML = PF_ICON[key] || '';
  return s;
}

/* ===== 개설한 프로젝트 — /me/funds (보존) ===== */
async function loadMyFunds(container) {
  try {
    const res = await window.api.get('/me/funds', { silentAuthFail: true });
    const items = (res && res.items) || [];
    currentUser.createdFundingCount = items.length;
    updateStat('fund', items.length);
    if (!items.length) {
      container.replaceChildren(emptyState('empty-funds.png', '개설한 프로젝트가 없어요', '아이디어를 굿즈로 만들어 후원을 받아보세요.', { href: '/fund-create.html', label: '프로젝트 만들기' }));
      return;
    }
    container.innerHTML = '';
    const list = pEl('div', { class: 'dt-my-rows' });
    items.forEach((f) => {
      const row = pEl('div', { class: 'dt-my-row' });
      const link = pEl('a', { class: 'dt-my-row__main', href: 'detail.html?id=' + encodeURIComponent(f.id) });
      const thumb = pEl('div', { class: 'dt-my-row__thumb' });
      if (f.imageUrl) {
        const img = pEl('img', { src: f.imageUrl, alt: f.title || '', loading: 'lazy' });
        img.addEventListener('error', () => { img.remove(); });
        thumb.appendChild(img);
      }
      link.appendChild(thumb);
      const info = pEl('div', { class: 'dt-my-row__info' });
      const titleRow = pEl('div', { class: 'dt-my-row__titlerow' });
      titleRow.appendChild(pEl('span', { class: 'dt-my-row__title' }, f.title || ''));
      titleRow.appendChild(makeStatusBadge(FUND_STATUS_BADGE, f.status));
      info.appendChild(titleRow);
      const meta = pEl('div', { class: 'dt-my-row__meta' });
      meta.appendChild(pEl('span', { class: 'dt-my-row__rate' }, (f.achievementRate || 0) + '% 달성'));
      meta.appendChild(pEl('span', { class: 'dt-my-row__sub' }, ' · ' + Number(f.finalPrice || 0).toLocaleString('ko-KR') + '원~'));
      info.appendChild(meta);
      link.appendChild(info);
      row.appendChild(link);
      // 삭제 요청 — 취소/반려가 아니면 노출 (보존)
      if (f.status !== 'cancelled' && f.status !== 'rejected') {
        const del = pEl('button', { class: 'dt-my-row__del', type: 'button' }, '삭제 요청');
        del.addEventListener('click', () => requestFundDelete(f.id));
        row.appendChild(del);
      }
      list.appendChild(row);
    });
    container.appendChild(list);
  } catch (e) {
    container.replaceChildren(emptyState('empty-funds.png', '개설한 프로젝트가 없어요', '아이디어를 굿즈로 만들어 후원을 받아보세요.', { href: '/fund-create.html', label: '프로젝트 만들기' }));
  }
}

/* 삭제 요청 POST (보존) */
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

/* ===== 후원한 프로젝트 — /me/backings (보존) ===== */
async function loadMyBackings(container) {
  try {
    const res = await window.api.get('/me/backings', { silentAuthFail: true });
    const items = (res && res.items) || [];
    currentUser.joinedFundingCount = items.length;
    updateStat('back', items.length);
    if (!items.length) {
      container.replaceChildren(emptyState('empty-backings.png', '후원한 프로젝트가 없어요', '마음에 드는 프로젝트를 찾아 첫 후원을 시작해 보세요.', { href: '/feed.html', label: '프로젝트 둘러보기' }));
      return;
    }
    container.innerHTML = '';
    const list = pEl('div', { class: 'dt-my-rows' });
    items.forEach((o) => {
      const row = pEl('div', { class: 'dt-my-row' });
      const link = pEl('a', { class: 'dt-my-row__main', href: 'detail.html?id=' + encodeURIComponent(o.fundId) });
      const thumb = pEl('div', { class: 'dt-my-row__thumb' });
      if (o.fundImageUrl) {
        const img = pEl('img', { src: o.fundImageUrl, alt: o.fundTitle || '', loading: 'lazy' });
        img.addEventListener('error', () => { img.remove(); });
        thumb.appendChild(img);
      }
      link.appendChild(thumb);
      const info = pEl('div', { class: 'dt-my-row__info' });
      const titleRow = pEl('div', { class: 'dt-my-row__titlerow' });
      titleRow.appendChild(pEl('span', { class: 'dt-my-row__title' }, o.fundTitle || ''));
      titleRow.appendChild(makeStatusBadge(BACKING_STATUS_BADGE, o.status));
      info.appendChild(titleRow);
      const subText = (o.rewardTitle ? o.rewardTitle + ' · ' : '') +
        Number(o.amount || 0).toLocaleString('ko-KR') + '원' +
        (o.depositorName ? ' · 입금자 ' + o.depositorName : '');
      info.appendChild(pEl('div', { class: 'dt-my-row__meta' }, pEl('span', { class: 'dt-my-row__sub' }, subText)));
      link.appendChild(info);
      row.appendChild(link);
      list.appendChild(row);
    });
    container.appendChild(list);
  } catch (e) {
    container.replaceChildren(emptyState('empty-backings.png', '후원한 프로젝트가 없어요', '마음에 드는 프로젝트를 찾아 첫 후원을 시작해 보세요.', { href: '/feed.html', label: '프로젝트 둘러보기' }));
  }
}

/* 스탯 카드 값 갱신 — 값 없으면 0 */
function updateStat(key, value) {
  const node = document.querySelector('.dt-my-stat[data-stat="' + key + '"] .dt-my-stat__num');
  if (node) node.textContent = (value == null) ? '0' : Number(value).toLocaleString('ko-KR');
}

/* 스탯 표기 — 없으면 0 */
function statVal(v) {
  return (v == null) ? '0' : Number(v).toLocaleString('ko-KR');
}

/* ===== 패널(우측 메인 콘텐츠) 렌더 ===== */
function renderPanel() {
  const panel = document.getElementById('pfPanel');
  if (!panel) return;

  if (activePanel === 'home') {
    panel.innerHTML = '';
    panel.appendChild(buildGreeting());
    panel.appendChild(buildStatRow());
    panel.appendChild(recentSection(panel, false));
    panel.appendChild(buildGuideBanner());
    return;
  }

  // 전용 패널: 상단에 "마이페이지로" 돌아가기 + 제목
  panel.innerHTML = '';
  const back = pEl('button', { class: 'dt-my-back', type: 'button' });
  back.appendChild(spanIcon('chevron', 'dt-my-back__ic'));
  back.appendChild(pEl('span', null, '마이페이지'));
  back.addEventListener('click', () => openProfilePanel('home'));
  panel.appendChild(back);

  const titleMap = {
    recent: currentUser.name ? (currentUser.name + '님이 최근에 봤어요') : '최근 본 프로젝트',
    following: '팔로잉',
    backings: '후원한 프로젝트',
    funds: '개설한 프로젝트',
  };
  panel.appendChild(pEl('h1', { class: 'dt-my-paneltitle' }, titleMap[activePanel] || '마이페이지'));

  const body = pEl('div', { class: 'dt-my-panelbody' });
  panel.appendChild(body);

  if (activePanel === 'recent') {
    body.appendChild(recentSection(body, true));
    return;
  }
  if (activePanel === 'following') {
    body.appendChild(emptyState('empty-feed.png', '팔로우한 창작자가 없어요', '관심 있는 창작자를 팔로우하면 새 소식을 받을 수 있어요.', { href: '/feed.html', label: '프로젝트 둘러보기' }));
    return;
  }
  if (activePanel === 'backings') {
    body.appendChild(pEl('div', { class: 'dt-my-loading' }, '불러오는 중…'));
    loadMyBackings(body);
    return;
  }
  if (activePanel === 'funds') {
    body.appendChild(pEl('div', { class: 'dt-my-loading' }, '불러오는 중…'));
    loadMyFunds(body);
    return;
  }
}

/* "OOO님, 안녕하세요" 인사 */
function buildGreeting() {
  const box = pEl('div', { class: 'dt-my-greet' });
  const name = currentUser.loaded
    ? (currentUser.name || '회원')
    : (currentUser.loadError ? '회원' : '');
  const h = pEl('h1', { class: 'dt-my-greet__title' });
  h.appendChild(pEl('strong', { class: 'dt-my-greet__name' }, name || '회원'));
  h.appendChild(document.createTextNode('님, 안녕하세요'));
  box.appendChild(h);
  box.appendChild(pEl('p', { class: 'dt-my-greet__sub' }, '두띵에서의 활동을 한눈에 확인하세요.'));
  return box;
}

/* 스탯 카드 행 — 펀딩+개수 / 후원 / 찜 / 알림 + 포인트 / 쿠폰 (없으면 0) */
function buildStatRow() {
  const wrap = pEl('div', { class: 'dt-my-statwrap' });

  // 활동 스탯(4개): 펀딩(개설) / 후원 / 찜 / 알림
  const acts = [
    { key: 'fund', icon: 'st_fund', label: '펀딩', value: currentUser.createdFundingCount, suffix: '개', panel: 'funds' },
    { key: 'back', icon: 'st_back', label: '후원', value: currentUser.joinedFundingCount, suffix: '건', panel: 'backings' },
    { key: 'like', icon: 'st_like', label: '찜',   value: currentUser.likedCount,          suffix: '개', panel: 'recent' },
    { key: 'noti', icon: 'st_bell', label: '알림', value: currentUser.notiCount,            suffix: '건', href: '/notice.html' },
  ];
  const row = pEl('div', { class: 'dt-my-stats' });
  acts.forEach((s) => {
    const tag = s.href ? 'a' : 'button';
    const props = { class: 'dt-my-stat', 'data-stat': s.key };
    if (s.href) props.href = s.href; else props.type = 'button';
    const card = pEl(tag, props);
    card.appendChild(spanIcon(s.icon, 'dt-my-stat__ic'));
    const txt = pEl('div', { class: 'dt-my-stat__txt' });
    const numRow = pEl('div', { class: 'dt-my-stat__numrow' });
    numRow.appendChild(pEl('span', { class: 'dt-my-stat__num' }, statVal(s.value)));
    if (s.suffix) numRow.appendChild(pEl('span', { class: 'dt-my-stat__suffix' }, s.suffix));
    txt.appendChild(numRow);
    txt.appendChild(pEl('span', { class: 'dt-my-stat__label' }, s.label));
    card.appendChild(txt);
    if (!s.href && s.panel) card.addEventListener('click', () => openProfilePanel(s.panel));
    row.appendChild(card);
  });
  wrap.appendChild(row);

  // 포인트/쿠폰 카드 행 (없으면 0)
  const wallet = pEl('div', { class: 'dt-my-wallet' });
  const walletDefs = [
    { key: 'point',  icon: 'st_point',  label: '포인트', value: currentUser.pointBalance, unit: 'P' },
    { key: 'coupon', icon: 'st_coupon', label: '쿠폰',   value: currentUser.couponCount,  unit: '장' },
  ];
  walletDefs.forEach((w) => {
    const card = pEl('div', { class: 'dt-my-walletcard', 'data-stat': w.key });
    const left = pEl('div', { class: 'dt-my-walletcard__left' });
    left.appendChild(spanIcon(w.icon, 'dt-my-walletcard__ic'));
    left.appendChild(pEl('span', { class: 'dt-my-walletcard__label' }, w.label));
    card.appendChild(left);
    const val = pEl('div', { class: 'dt-my-walletcard__val' });
    val.appendChild(pEl('span', { class: 'dt-my-walletcard__num' }, statVal(w.value)));
    val.appendChild(pEl('span', { class: 'dt-my-walletcard__unit' }, w.unit));
    card.appendChild(val);
    wallet.appendChild(card);
  });
  wrap.appendChild(wallet);

  return wrap;
}

/* 안내 배너 — 펀딩 안전/이용 안내(정적, 데이터 없어도 노출) */
function buildGuideBanner() {
  const banner = pEl('a', { class: 'dt-my-banner', href: '/support.html' });
  const ic = pEl('span', { class: 'dt-my-banner__ic' });
  ic.innerHTML = PF_ICON.st_back;
  banner.appendChild(ic);
  const txt = pEl('div', { class: 'dt-my-banner__txt' });
  txt.appendChild(pEl('strong', { class: 'dt-my-banner__title' }, '두띵 펀딩이 처음이신가요?'));
  txt.appendChild(pEl('span', { class: 'dt-my-banner__sub' }, '후원 절차와 환불 정책을 미리 확인해 보세요.'));
  banner.appendChild(txt);
  banner.appendChild(spanIcon('chevron', 'dt-my-banner__chev'));
  return banner;
}

/* ===== 메인 렌더 (와디즈 마이: 사이드바 + 메인) ===== */
function renderProfile() {
  const main = document.getElementById('profileMain');
  if (!main) return;
  main.innerHTML = '';

  const wrap = pEl('div', { class: 'dt-wrap dt-my' });

  // 에러 배너
  if (currentUser.loadError) {
    const banner = pEl('div', { class: 'dt-my-errbanner' });
    banner.textContent = '프로필 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요. (' + currentUser.loadError + ')';
    wrap.appendChild(banner);
  }

  // 좌상단: 아바타 + 이름 + "설정" 버튼 (와디즈 마이 헤더)
  const profileHead = pEl('div', { class: 'dt-my-id' });
  const avatarBox = pEl('div', { class: 'dt-my-avatar' });
  if (currentUser.avatarUrl) {
    const img = pEl('img', { src: currentUser.avatarUrl, alt: currentUser.name || '프로필' });
    img.addEventListener('error', () => { img.remove(); avatarBox.classList.add('is-ghost'); avatarBox.innerHTML = GHOST_SVG; });
    avatarBox.appendChild(img);
  } else {
    avatarBox.classList.add('is-ghost');
    avatarBox.innerHTML = GHOST_SVG;
  }
  const idInfo = pEl('div', { class: 'dt-my-id__info' });
  const displayName = currentUser.loaded
    ? (currentUser.name || '회원')
    : (currentUser.loadError ? '정보를 불러오지 못했습니다' : '불러오는 중…');
  idInfo.appendChild(pEl('p', { class: 'dt-my-id__name' }, displayName));
  if (currentUser.loaded && currentUser.university) {
    idInfo.appendChild(pEl('p', { class: 'dt-my-id__uni' }, currentUser.university));
  }
  const settingsBtn = pEl('a', { class: 'dt-btn dt-btn--outline dt-my-id__set', href: '/settings.html' }, '설정');
  profileHead.appendChild(avatarBox);
  profileHead.appendChild(idInfo);
  profileHead.appendChild(settingsBtn);
  wrap.appendChild(profileHead);

  // 2단: 사이드바 + 메인 패널
  const layout = pEl('div', { class: 'dt-my-layout' });

  const aside = pEl('aside', { class: 'dt-my-sidebar', 'aria-label': '마이페이지 메뉴' });
  const nav = pEl('nav', { class: 'dt-my-sidenav' });
  SIDE_MENU.forEach((m) => {
    let node;
    if (m.action === 'link') {
      node = pEl('a', { class: 'dt-my-sidelink', href: m.href, 'data-panel': m.key });
    } else if (m.action === 'soon') {
      node = pEl('button', { class: 'dt-my-sidelink is-disabled', type: 'button', 'data-panel': m.key, disabled: 'disabled', 'aria-disabled': 'true' });
    } else {
      node = pEl('button', { class: 'dt-my-sidelink', type: 'button', 'data-panel': m.key });
    }
    node.appendChild(spanIcon(m.icon, 'dt-my-sidelink__ic'));
    node.appendChild(pEl('span', { class: 'dt-my-sidelink__label' }, m.label));
    if (m.action === 'soon') {
      node.appendChild(pEl('span', { class: 'dt-badge dt-badge--proxy dt-my-sidelink__soon' }, '준비 중'));
    }
    if (m.action === 'panel') {
      node.addEventListener('click', () => openProfilePanel(m.key));
    } else if (m.action === 'tracking') {
      node.addEventListener('click', () => { if (typeof openTrackingModal === 'function') openTrackingModal(); });
    }
    nav.appendChild(node);
  });
  aside.appendChild(nav);
  layout.appendChild(aside);

  const panel = pEl('div', { class: 'dt-my-main', id: 'pfPanel' });
  layout.appendChild(panel);

  wrap.appendChild(layout);
  main.appendChild(wrap);

  // 클라 상태(찜 개수)는 즉시 반영, 서버 카운트는 패널 로드 시 갱신
  currentUser.likedCount = countLikedLocal();

  highlightSidebar();
  renderPanel();

  // 백그라운드: 개설/후원 개수를 미리 가져와 홈 스탯 카드에 반영(패널 안 열어도 숫자 표시)
  prefetchCounts();
}

/* 홈 스탯 카드 숫자 선반영 — /me/funds·/me/backings 개수만 조용히 조회 */
async function prefetchCounts() {
  try {
    const f = await window.api.get('/me/funds', { silentAuthFail: true });
    currentUser.createdFundingCount = ((f && f.items) || []).length;
    updateStat('fund', currentUser.createdFundingCount);
  } catch (_) { updateStat('fund', 0); }
  try {
    const b = await window.api.get('/me/backings', { silentAuthFail: true });
    currentUser.joinedFundingCount = ((b && b.items) || []).length;
    updateStat('back', currentUser.joinedFundingCount);
  } catch (_) { updateStat('back', 0); }
}

const GHOST_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

(async function init() {
  activePanel = initialPanelFromQuery();
  // loadCurrentUser 가 false 면 401/410 redirect 진행 중 — 깜빡임 방지 위해 렌더 스킵
  const shouldRender = await loadCurrentUser();
  if (shouldRender) {
    renderProfile();
    // 백엔드 상품 로드 완료 시 최근본/카드 갱신
    window.addEventListener('mockproducts:updated', function () {
      if (activePanel === 'home' || activePanel === 'recent') renderPanel();
    });
  }
})();
