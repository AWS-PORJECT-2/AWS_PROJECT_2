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

/* ===== 로그아웃 (서버 인증 쿠키 기반) ===== */
async function handleLogout() {
  if (!confirm('정말 로그아웃 하시겠습니까?')) return;

  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('logout failed: ' + response.status);
    }

    localStorage.removeItem('user_info');
    localStorage.removeItem('isPushEnabled');
    window.location.href = '/login.html';
  } catch (error) {
    console.error('로그아웃 중 오류 발생:', error);
    alert('로그아웃에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }
}

/* ===== 초기화 ===== */
document.addEventListener('DOMContentLoaded', () => {
  initPushToggle();
});
