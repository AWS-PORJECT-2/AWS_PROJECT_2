/**
 * 설정 페이지 로직
 * - 푸시 알림 토글 (localStorage 저장)
 * - 로그아웃 처리
 */

/* ===== 푸시 알림 토글 ===== */
function initPushToggle() {
  const enabled = localStorage.getItem('isPushEnabled') === '1';
  updateToggleUI(enabled);
}

function togglePush() {
  const current = localStorage.getItem('isPushEnabled') === '1';
  const next = !current;
  localStorage.setItem('isPushEnabled', next ? '1' : '0');
  updateToggleUI(next);
}

function updateToggleUI(enabled) {
  const toggle = document.getElementById('pushToggle');
  const knob = document.getElementById('pushToggleKnob');
  if (!toggle || !knob) return;

  if (enabled) {
    toggle.style.background = '#7c3aed';
    knob.style.left = '22px';
  } else {
    toggle.style.background = '#d1d5db';
    knob.style.left = '2px';
  }

  // 접근성 상태 동기화
  toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

/* ===== 로그아웃 ===== */
function handleLogout() {
  const confirmed = confirm('정말 로그아웃 하시겠습니까?');
  if (!confirmed) return;

  // 인증 관련 데이터만 삭제 (좋아요/예약 등 유저 활동 데이터는 유지)
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_session');
  localStorage.removeItem('isPushEnabled');

  alert('로그아웃 되었습니다.');
  window.location.href = 'index.html';
}

/* ===== 초기화 ===== */
document.addEventListener('DOMContentLoaded', () => {
  initPushToggle();
});
