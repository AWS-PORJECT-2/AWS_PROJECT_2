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

/* ===== 로그아웃 (서버 인증 쿠키 기반) =====
 * 서버 호출이 실패하면 사용자는 "로그아웃했다"고 착각한 채 자리를 떠날 수 있다 — 공용 PC 에서
 * 다음 사용자가 그 계정을 그대로 쓰게 되는 보안 사고. 그래서 서버 실패 시에도 사용자에게
 * 상태를 명시적으로 알리고, 동의 시 클라이언트 측 자격증명을 즉시 정리한 뒤 로그인 화면으로
 * 강제 이동시킨다. (httpOnly 쿠키는 JS 로 직접 못 지워도 max-age=0 으로 덮어쓰기 시도.)
 */
async function handleLogout() {
  if (!confirm('정말 로그아웃 하시겠습니까?')) return;

  let serverOk = false;
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    serverOk = response.ok;
    if (!serverOk) {
      console.error('서버 로그아웃 실패: HTTP ' + response.status);
    }
  } catch (error) {
    console.error('서버 로그아웃 네트워크 오류:', error);
  }

  if (serverOk) {
    localStorage.removeItem('user_info');
    localStorage.removeItem('isPushEnabled');
    window.location.href = '/login.html';
    return;
  }

  const force = confirm(
    '서버와 통신에 실패해 로그아웃이 완료되지 않았을 수 있습니다.\n' +
    '이 기기의 자격증명을 강제로 정리하고 로그인 화면으로 이동할까요?\n' +
    '(다른 기기/탭의 세션은 만료되지 않을 수 있습니다.)'
  );
  if (!force) return;

  document.cookie = 'accessToken=; Max-Age=0; Path=/; SameSite=Lax';
  document.cookie = 'refreshToken=; Max-Age=0; Path=/api/auth; SameSite=Lax';
  localStorage.removeItem('user_info');
  localStorage.removeItem('isPushEnabled');
  window.location.href = '/login.html';
}

/* ===== 초기화 ===== */
document.addEventListener('DOMContentLoaded', () => {
  initPushToggle();
});
