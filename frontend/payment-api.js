/**
 * 백엔드 API 헬퍼.
 * - credentials: 'include' 로 dev 쿠키 자동 전송
 * - escapeHTML 으로 XSS 방어
 * - 실패 시 throw new Error(message)
 */

const API_BASE_URL = '/api';

/* ===== XSS 방어 ===== */
function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ===== 공통 fetch 래퍼 ===== */
async function apiFetch(path, options = {}) {
  const opts = Object.assign({ credentials: 'include' }, options);
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string') {
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API_BASE_URL + path, opts);

  if (res.status === 401) {
    // 미인증 → 로그인 페이지로
    if (location.pathname !== '/' && location.pathname !== '/login-dev.html') {
      location.href = '/';
    }
    throw new Error('로그인이 필요합니다');
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }

  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || ('요청 실패 (' + res.status + ')');
    throw new Error(msg);
  }
  return data;
}

/* ===== Auth ===== */
async function getCurrentUser() {
  return apiFetch('/dev-auth/me');
}
async function logout() {
  await apiFetch('/dev-auth/logout', { method: 'POST' });
  location.href = '/';
}

/* ===== Shipping addresses ===== */
async function listAddresses() { return apiFetch('/shipping-addresses'); }
async function createAddress(payload) {
  return apiFetch('/shipping-addresses', { method: 'POST', body: payload });
}
async function updateAddress(id, payload) {
  return apiFetch('/shipping-addresses/' + encodeURIComponent(id), { method: 'PATCH', body: payload });
}
async function setDefaultAddress(id) {
  return apiFetch('/shipping-addresses/' + encodeURIComponent(id) + '/default', { method: 'PATCH' });
}
async function deleteAddress(id) {
  return apiFetch('/shipping-addresses/' + encodeURIComponent(id), { method: 'DELETE' });
}

/* ===== Orders ===== */
async function createOrder(payload) {
  return apiFetch('/payment-orders', { method: 'POST', body: payload });
}
/**
 * 입금자명만 보고 (사진 업로드 없음).
 */
async function reportPayment(orderId, depositorName) {
  return apiFetch('/payment-orders/' + encodeURIComponent(orderId) + '/report', {
    method: 'POST',
    body: { depositorName },
  });
}
async function getOrderDetail(orderId) {
  return apiFetch('/payment-orders/' + encodeURIComponent(orderId));
}
async function getMyOrders() { return apiFetch('/payment-orders'); }

/* ===== Admin ===== */
async function getPendingOrders() { return apiFetch('/admin/payment-orders/pending'); }
async function confirmPayment(orderId, memo) {
  return apiFetch('/admin/payment-orders/' + encodeURIComponent(orderId) + '/confirm', {
    method: 'PATCH',
    body: { memo: memo || '' },
  });
}

/* ===== Announcements ===== */
async function listAnnouncements(page = 1, pageSize = 20) {
  return apiFetch('/announcements?page=' + page + '&pageSize=' + pageSize);
}
async function getAnnouncement(id) {
  return apiFetch('/announcements/' + encodeURIComponent(id));
}
async function createAnnouncement(payload) {
  return apiFetch('/admin/announcements', { method: 'POST', body: payload });
}
async function updateAnnouncement(id, payload) {
  return apiFetch('/admin/announcements/' + encodeURIComponent(id), { method: 'PUT', body: payload });
}
async function deleteAnnouncement(id) {
  return apiFetch('/admin/announcements/' + encodeURIComponent(id), { method: 'DELETE' });
}

/* ===== Optional auth (no redirect on 401) ===== */
async function getCurrentUserOptional() {
  try {
    const res = await fetch(API_BASE_URL + '/dev-auth/me', { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

/* ===== Helpers ===== */
function formatPrice(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}
function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function getStatusText(s) {
  return ({
    PENDING: '입금 대기',
    WAITING_FOR_CONFIRM: '입금 확인 중',
    PAID: '결제 완료',
    CANCELLED: '취소됨',
    REFUNDED: '환불됨',
  })[s] || s;
}
function getStatusColor(s) {
  return ({
    PENDING: '#f59e0b',
    WAITING_FOR_CONFIRM: '#3b82f6',
    PAID: '#10b981',
    CANCELLED: '#6b7280',
    REFUNDED: '#ef4444',
  })[s] || '#6b7280';
}
