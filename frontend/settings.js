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
    // httpOnly 쿠키 인증 시스템에 맞는 서버 로그아웃 요청
    const API_BASE = window.location.hostname === 'localhost'
      ? 'http://localhost:3000/api'
      : 'https://api.doothing.app/api';

    const response = await fetch(API_BASE + '/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // httpOnly 쿠키 전송 필수
    });

    if (response.ok) {
      // 서버 로그아웃 성공 — 로컬 UI 잔여 데이터 청소
      localStorage.removeItem('user_info');
      localStorage.removeItem('isPushEnabled');

      alert('로그아웃 되었습니다.');
      window.location.href = 'index.html';
    } else {
      throw new Error('서버 응답 오류: ' + response.status);
    }
  } catch (error) {
    console.error('로그아웃 중 오류 발생:', error);

    // 서버 미연결(개발 환경) 시 로컬 처리 fallback
    localStorage.removeItem('user_info');
    localStorage.removeItem('isPushEnabled');

    alert('로그아웃 되었습니다.');
    window.location.href = 'index.html';
  }
}

/* ===== 초기화 ===== */
document.addEventListener('DOMContentLoaded', () => {
  initPushToggle();
});
