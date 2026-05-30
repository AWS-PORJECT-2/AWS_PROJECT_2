/**
 * 첫 로그인 온보딩 — 닉네임(필수)·실명·전화 수집 → PATCH /api/me → 메인.
 * 미로그인 시 api 래퍼가 로그인으로 보냄. 이미 온보딩 완료면 메인으로.
 */
(function () {
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    let me;
    try { me = await window.api.get('/auth/me'); }
    catch (e) { return; } // 401 → 로그인으로 (api 래퍼)
    if (me && me.onboarded) { window.location.href = '/main.html'; return; }
    // 기존 값 프리필
    if (me) {
      if (me.nickname) document.getElementById('obNickname').value = me.nickname;
      else if (me.name) document.getElementById('obNickname').value = me.name;
      if (me.realName) document.getElementById('obRealName').value = me.realName;
      if (me.phone) document.getElementById('obPhone').value = me.phone;
    }
    document.getElementById('onboardForm').addEventListener('submit', onSubmit);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const err = document.getElementById('obError');
    err.style.display = 'none';
    const nickname = document.getElementById('obNickname').value.trim();
    const realName = document.getElementById('obRealName').value.trim();
    const phone = document.getElementById('obPhone').value.trim();
    if (!nickname) { showErr('닉네임을 입력해 주세요.'); return; }

    const btn = document.getElementById('obSubmit');
    btn.disabled = true; btn.textContent = '저장 중…';
    try {
      await window.api.patch('/me', { nickname: nickname, realName: realName, phone: phone });
      window.location.href = '/main.html';
    } catch (e2) {
      btn.disabled = false; btn.textContent = '시작하기';
      showErr((e2 && e2.message) || '저장에 실패했습니다.');
    }
  }

  function showErr(msg) {
    const err = document.getElementById('obError');
    err.textContent = msg; err.style.display = 'block';
  }
})();
