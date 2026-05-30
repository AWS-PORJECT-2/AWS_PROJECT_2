/**
 * 프로필(마이페이지) — 텀블벅 충실도 스펙 §3.4 재구축.
 *
 * 레이아웃: 공통 Header()는 main.js(App, data-page="sub")가 #app에 자동 삽입.
 *           공통 푸터는 renderGlobalFooter()가 자동 append. 여기서 직접 추가하지 않는다.
 *
 * 보존: /api/auth/me 로드, /me/funds·/me/backings 목록, 삭제 요청 POST,
 *       배송조회 모달(/me/orders, /orders/:id/tracking), 좋아요(찜) 목록.
 *       응답 필드명·엔드포인트는 그대로 유지. UI/탭/레이아웃만 재구축.
 *
 * XSS: 사용자 데이터는 textContent 또는 escapeHTML 사용. innerHTML에 사용자값 직접 주입 금지.
 */
if (typeof window.escapeHTML !== 'function') {
  window.escapeHTML = function (v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
}

/* DOM 헬퍼 — main.js의 el()이 로드돼 있으면 그걸 쓰고, 아니면 동일한 폴백을 사용.
 * (profile.js는 main.js보다 먼저 로드되지만, init()이 await 이후 실행돼 시점상 안전.
 *  그래도 안전하게 폴백 정의.) */
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

/* ===== 예약 취소 함수 (전역, 보존) ===== */
function cancelReservation(productId) {
  if (!confirm('정말로 이 펀딩 참여(예약)를 취소하시겠습니까?')) return;
  if (typeof setReserved === 'function') {
    setReserved(productId, false);
  }
  alert('예약이 정상적으로 취소되었습니다.');
  switchProfileTab('backings');
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

/* 사용자 정보 — /api/auth/me 로 채워짐. (보존: 필드명/엔드포인트 동일)
 * loadError 채워지면 "정보를 불러오지 못했습니다" 배너 표시. 가짜 신원 노출 금지. */
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
    currentUser.loaded = true;
    return true;
  } catch (err) {
    console.error('[profile] failed to load user', err);
    currentUser.loadError = (err && err.message) ? err.message : String(err);
    return true; // 페이지는 렌더하되 에러 배너 표시
  }
}

/* 탭 상태 — 스펙 §3.4: 프로필(소개) / 후원한 프로젝트 / 개설한 프로젝트 / 팔로워 / 팔로잉 */
const PROFILE_TABS = [
  { key: 'intro',     label: '프로필' },
  { key: 'backings',  label: '후원한 프로젝트' },
  { key: 'funds',     label: '개설한 프로젝트' },
  { key: 'followers', label: '팔로워' },
  { key: 'following', label: '팔로잉' },
];
let profileTab = 'intro';

/* URL ?tab= 매핑 (헤더/드롭다운에서 진입하는 기존 쿼리 호환) */
function initialTabFromQuery() {
  try {
    const t = new URLSearchParams(location.search).get('tab');
    const map = {
      intro: 'intro', profile: 'intro',
      backings: 'backings', joined: 'backings', backed: 'backings',
      funds: 'funds', created: 'funds',
      likes: 'backings', liked: 'backings', // 찜은 후원 탭 영역에 통합 노출
      followers: 'followers', following: 'following', follow: 'following',
    };
    if (t && map[t]) return map[t];
  } catch (_) { /* ignore */ }
  return 'intro';
}

function switchProfileTab(tab) {
  profileTab = tab;
  renderProfileTabs();
  renderProfileTabContent();
}

function renderProfileTabs() {
  const bar = document.getElementById('profileTabs');
  if (!bar) return;
  bar.querySelectorAll('.dt-prof-tab').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === profileTab);
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
  const box = pEl('div', { class: 'dt-prof-empty' });
  if (imgName) {
    const img = pEl('img', { class: 'dt-prof-empty__img', src: '/assets/' + imgName, alt: '' });
    img.addEventListener('error', () => { img.remove(); });
    box.appendChild(img);
  }
  box.appendChild(pEl('p', { class: 'dt-prof-empty__title' }, title));
  if (sub) box.appendChild(pEl('p', { class: 'dt-prof-empty__sub' }, sub));
  if (cta) box.appendChild(pEl('a', { class: 'dt-btn dt-btn--outline', href: cta.href }, cta.label));
  return box;
}

/* 프로젝트 그리드 — main.js ProjectCard() 재사용. 없으면 간단 카드 폴백. */
function projectGrid(items) {
  const grid = pEl('div', { class: 'dt-prof-grid' });
  items.forEach((p) => {
    if (typeof window.ProjectCard === 'function') {
      grid.appendChild(window.ProjectCard(p));
    } else {
      const card = pEl('a', { class: 'dt-pcard', href: '/detail.html?id=' + encodeURIComponent(p.id) });
      const thumb = pEl('div', { class: 'dt-pcard__thumb' });
      if (p.imageUrl) thumb.appendChild(pEl('img', { src: p.imageUrl, alt: p.title || '', loading: 'lazy' }));
      card.appendChild(thumb);
      const body = pEl('div', { class: 'dt-pcard__body' });
      body.appendChild(pEl('h3', { class: 'dt-pcard__title' }, p.title || ''));
      card.appendChild(body);
      grid.appendChild(card);
    }
  });
  return grid;
}

function renderProfileTabContent() {
  const container = document.getElementById('profileTabContent');
  if (!container) return;

  if (profileTab === 'intro') {
    renderIntroTab(container);
    return;
  }
  if (profileTab === 'backings') {
    container.replaceChildren(pEl('div', { class: 'dt-prof-loading' }, '불러오는 중…'));
    loadMyBackings(container);
    return;
  }
  if (profileTab === 'funds') {
    container.replaceChildren(pEl('div', { class: 'dt-prof-loading' }, '불러오는 중…'));
    loadMyFunds(container);
    return;
  }
  if (profileTab === 'followers') {
    container.replaceChildren(emptyState('empty-feed.png', '아직 팔로워가 없어요', '프로젝트를 개설하고 후원자와 소통해 보세요.'));
    return;
  }
  if (profileTab === 'following') {
    container.replaceChildren(emptyState('empty-feed.png', '팔로우한 창작자가 없어요', '관심 있는 창작자를 팔로우하면 새 소식을 받을 수 있어요.'));
    return;
  }
}

/* 프로필(소개) 탭 — 소개 없으면 빈상태 */
function renderIntroTab(container) {
  container.innerHTML = '';
  const card = pEl('div', { class: 'dt-prof-introcard' });
  card.appendChild(pEl('h3', { class: 'dt-prof-introcard__h' }, '소개'));
  if (currentUser.bio && String(currentUser.bio).trim()) {
    const p = pEl('p', { class: 'dt-prof-introcard__body' });
    p.textContent = currentUser.bio; // 사용자 데이터 — textContent로 XSS 방지
    card.appendChild(p);
  } else {
    const empty = pEl('p', { class: 'dt-prof-introcard__empty' }, '등록된 소개가 없습니다.');
    card.appendChild(empty);
    card.appendChild(pEl('a', { class: 'dt-btn dt-btn--outline dt-prof-introcard__cta', href: '/settings.html' }, '프로필 편집'));
  }
  container.appendChild(card);
}

/* 개설한 프로젝트 — /me/funds (보존). 응답 필드명 그대로(items, id, title, imageUrl, status, achievementRate, finalPrice) */
async function loadMyFunds(container) {
  const esc = window.escapeHTML;
  try {
    const res = await window.api.get('/me/funds', { silentAuthFail: true });
    const items = (res && res.items) || [];
    currentUser.createdFundingCount = items.length;
    updateStat('created', items.length);
    if (!items.length) {
      container.replaceChildren(emptyState('empty-funds.png', '개설한 프로젝트가 없어요', '아이디어를 굿즈로 만들어 후원을 받아보세요.', { href: '/fund-create.html', label: '프로젝트 올리기' }));
      return;
    }
    container.innerHTML = '';
    const list = pEl('div', { class: 'dt-prof-rows' });
    items.forEach((f) => {
      const row = pEl('div', { class: 'dt-prof-row' });
      const link = pEl('a', { class: 'dt-prof-row__main', href: 'detail.html?id=' + encodeURIComponent(f.id) });
      const thumb = pEl('div', { class: 'dt-prof-row__thumb' });
      if (f.imageUrl) {
        const img = pEl('img', { src: f.imageUrl, alt: f.title || '', loading: 'lazy' });
        img.addEventListener('error', () => { img.remove(); });
        thumb.appendChild(img);
      }
      link.appendChild(thumb);
      const info = pEl('div', { class: 'dt-prof-row__info' });
      const titleRow = pEl('div', { class: 'dt-prof-row__titlerow' });
      titleRow.appendChild(pEl('span', { class: 'dt-prof-row__title' }, f.title || ''));
      titleRow.appendChild(makeStatusBadge(FUND_STATUS_BADGE, f.status));
      info.appendChild(titleRow);
      const meta = pEl('div', { class: 'dt-prof-row__meta' });
      const rate = pEl('span', { class: 'dt-prof-row__rate' }, (f.achievementRate || 0) + '% 달성');
      meta.appendChild(rate);
      meta.appendChild(pEl('span', { class: 'dt-prof-row__sub' }, ' · ' + Number(f.finalPrice || 0).toLocaleString('ko-KR') + '원~'));
      info.appendChild(meta);
      link.appendChild(info);
      row.appendChild(link);
      // 삭제 요청 — 취소/반려가 아니면 노출 (보존)
      if (f.status !== 'cancelled' && f.status !== 'rejected') {
        const del = pEl('button', { class: 'dt-prof-row__del', type: 'button' }, '삭제 요청');
        del.addEventListener('click', () => requestFundDelete(f.id));
        row.appendChild(del);
      }
      list.appendChild(row);
    });
    container.appendChild(list);
  } catch (e) {
    container.replaceChildren(emptyState('empty-funds.png', '개설한 프로젝트가 없어요', '아이디어를 굿즈로 만들어 후원을 받아보세요.', { href: '/fund-create.html', label: '프로젝트 올리기' }));
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

/* 후원한 프로젝트 — /me/backings (보존). 필드: items, fundId, fundTitle, fundImageUrl, rewardTitle, amount, depositorName, status */
async function loadMyBackings(container) {
  const esc = window.escapeHTML;
  try {
    const res = await window.api.get('/me/backings', { silentAuthFail: true });
    const items = (res && res.items) || [];
    currentUser.joinedFundingCount = items.length;
    updateStat('backed', items.length);
    if (!items.length) {
      container.replaceChildren(emptyState('empty-backings.png', '후원한 프로젝트가 없어요', '마음에 드는 프로젝트를 찾아 첫 후원을 시작해 보세요.', { href: '/feed.html', label: '프로젝트 둘러보기' }));
      return;
    }
    container.innerHTML = '';
    const list = pEl('div', { class: 'dt-prof-rows' });
    items.forEach((o) => {
      const row = pEl('div', { class: 'dt-prof-row' });
      const link = pEl('a', { class: 'dt-prof-row__main', href: 'detail.html?id=' + encodeURIComponent(o.fundId) });
      const thumb = pEl('div', { class: 'dt-prof-row__thumb' });
      if (o.fundImageUrl) {
        const img = pEl('img', { src: o.fundImageUrl, alt: o.fundTitle || '', loading: 'lazy' });
        img.addEventListener('error', () => { img.remove(); });
        thumb.appendChild(img);
      }
      link.appendChild(thumb);
      const info = pEl('div', { class: 'dt-prof-row__info' });
      const titleRow = pEl('div', { class: 'dt-prof-row__titlerow' });
      titleRow.appendChild(pEl('span', { class: 'dt-prof-row__title' }, o.fundTitle || ''));
      titleRow.appendChild(makeStatusBadge(BACKING_STATUS_BADGE, o.status));
      info.appendChild(titleRow);
      const subText = (o.rewardTitle ? o.rewardTitle + ' · ' : '') +
        Number(o.amount || 0).toLocaleString('ko-KR') + '원' +
        (o.depositorName ? ' · 입금자 ' + o.depositorName : '');
      info.appendChild(pEl('div', { class: 'dt-prof-row__meta' }, pEl('span', { class: 'dt-prof-row__sub' }, subText)));
      link.appendChild(info);
      row.appendChild(link);
      list.appendChild(row);
    });
    container.appendChild(list);
  } catch (e) {
    container.replaceChildren(emptyState('empty-backings.png', '후원한 프로젝트가 없어요', '마음에 드는 프로젝트를 찾아 첫 후원을 시작해 보세요.', { href: '/feed.html', label: '프로젝트 둘러보기' }));
  }
}

/* 스탯 값 갱신 — 값 없으면 "-" */
function updateStat(key, value) {
  const node = document.querySelector('.dt-prof-stat[data-stat="' + key + '"] .dt-prof-stat__num');
  if (node) node.textContent = (value == null) ? '-' : Number(value).toLocaleString('ko-KR');
}

function statVal(v) {
  return (v == null) ? '-' : Number(v).toLocaleString('ko-KR');
}

/* ===== 메인 렌더 ===== */
function renderProfile() {
  const main = document.getElementById('profileMain');
  if (!main) return;
  main.innerHTML = '';

  const wrap = pEl('div', { class: 'dt-wrap dt-prof' });

  // 에러 배너
  if (currentUser.loadError) {
    const banner = pEl('div', { class: 'dt-prof-errbanner' });
    banner.textContent = '프로필 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요. (' + currentUser.loadError + ')';
    wrap.appendChild(banner);
  }

  /* 상단: 아바타 + 이름 + 스탯 + 프로필 편집 */
  const head = pEl('div', { class: 'dt-prof-head' });

  const avatarBox = pEl('div', { class: 'dt-prof-avatar' });
  if (currentUser.avatarUrl) {
    const img = pEl('img', { src: currentUser.avatarUrl, alt: currentUser.name || '프로필' });
    img.addEventListener('error', () => { img.remove(); avatarBox.classList.add('is-ghost'); avatarBox.innerHTML = GHOST_SVG; });
    avatarBox.appendChild(img);
  } else {
    avatarBox.classList.add('is-ghost');
    avatarBox.innerHTML = GHOST_SVG;
  }

  const headInfo = pEl('div', { class: 'dt-prof-head__info' });
  const displayName = currentUser.loaded
    ? (currentUser.name || '회원')
    : (currentUser.loadError ? '정보를 불러오지 못했습니다' : '불러오는 중…');
  const nameRow = pEl('div', { class: 'dt-prof-head__namerow' });
  nameRow.appendChild(pEl('h1', { class: 'dt-prof-name' }, displayName));
  headInfo.appendChild(nameRow);
  if (currentUser.loaded && currentUser.university) {
    headInfo.appendChild(pEl('p', { class: 'dt-prof-uni' }, currentUser.university));
  }

  // 스탯: 팔로잉 / 후원수 / 개설수 — 값 없으면 "-"
  const stats = pEl('div', { class: 'dt-prof-stats' });
  const statDefs = [
    { key: 'following', label: '팔로잉', value: currentUser.followingCount },
    { key: 'backed',    label: '후원수', value: currentUser.joinedFundingCount },
    { key: 'created',   label: '개설수', value: currentUser.createdFundingCount },
  ];
  statDefs.forEach((s) => {
    const stat = pEl('div', { class: 'dt-prof-stat', 'data-stat': s.key });
    stat.appendChild(pEl('span', { class: 'dt-prof-stat__num' }, statVal(s.value)));
    stat.appendChild(pEl('span', { class: 'dt-prof-stat__label' }, s.label));
    stats.appendChild(stat);
  });
  headInfo.appendChild(stats);

  const editBtn = pEl('a', { class: 'dt-btn dt-btn--outline dt-prof-edit', href: '/settings.html' }, '프로필 편집');

  head.appendChild(avatarBox);
  head.appendChild(headInfo);
  head.appendChild(editBtn);
  wrap.appendChild(head);

  /* 탭바 */
  const tabs = pEl('nav', { class: 'dt-prof-tabs', id: 'profileTabs', 'aria-label': '프로필 탭' });
  PROFILE_TABS.forEach((t) => {
    const btn = pEl('button', {
      class: 'dt-prof-tab' + (t.key === profileTab ? ' is-active' : ''),
      type: 'button',
      'data-tab': t.key,
    }, t.label);
    btn.addEventListener('click', () => switchProfileTab(t.key));
    tabs.appendChild(btn);
  });
  wrap.appendChild(tabs);

  /* 탭 콘텐츠 컨테이너 */
  wrap.appendChild(pEl('div', { class: 'dt-prof-content', id: 'profileTabContent' }));

  main.appendChild(wrap);

  renderProfileTabContent();
}

const GHOST_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

(async function init() {
  profileTab = initialTabFromQuery();
  // loadCurrentUser 가 false 면 401/410 redirect 진행 중 — 깜빡임 방지 위해 렌더 스킵
  const shouldRender = await loadCurrentUser();
  if (shouldRender) {
    renderProfile();
    // 백엔드 상품 로드 완료 시 탭 내용 갱신
    window.addEventListener('mockproducts:updated', function () {
      if (typeof renderProfileTabContent === 'function') renderProfileTabContent();
    });
  }
})();
