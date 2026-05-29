/**
 * 프로필 드롭다운 메뉴 — 모든 페이지 공통.
 * topbar-right 안의 톱니바퀴 + 프로필 링크를 드롭다운으로 교체.
 * 사용: <script src="profile-menu.js"></script> 를 api.js 뒤에 추가.
 */
(function () {
  var topbarRight = document.querySelector('.topbar-right');
  if (!topbarRight) return;

  // 기존 프로필 링크 제거 (설정 버튼은 유지)
  var profileLink = topbarRight.querySelector('a.topbar-profile');
  if (profileLink) profileLink.remove();
  // 이미 드롭다운이 있으면 중복 생성 방지
  if (topbarRight.querySelector('.topbar-profile-wrapper')) return;

  var wrapper = document.createElement('div');
  wrapper.className = 'topbar-profile-wrapper';
  wrapper.style.position = 'relative';
  wrapper.innerHTML =
    '<button class="topbar-profile" id="profileMenuBtn" aria-label="프로필 메뉴" style="background:none;border:none;cursor:pointer;padding:0;">' +
      '<img id="profileMenuAvatar" src="/default-avatar.svg" alt="프로필" class="topbar-avatar" onerror="this.style.background=\'#e5e7eb\';this.removeAttribute(\'src\')">' +
    '</button>' +
    '<div class="profile-dropdown" id="profileDropdown" style="display:none;position:absolute;top:44px;right:0;width:220px;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);z-index:1000;padding:8px 0;border:1px solid #f0f0f0;">' +
      '<a href="/profile.html" class="profile-dropdown-item">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '<span>마이페이지</span>' +
      '</a>' +
      '<a href="/payment-manage.html" class="profile-dropdown-item">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>' +
        '<span>결제 수단 관리</span>' +
      '</a>' +
      '<a href="/address-manage.html" class="profile-dropdown-item">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        '<span>배송지 관리</span>' +
      '</a>' +
      '<a href="/notice.html" class="profile-dropdown-item">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>' +
        '<span>공지사항</span>' +
      '</a>' +
      '<a href="/settings.html" class="profile-dropdown-item">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' +
        '<span>설정</span>' +
      '</a>' +
      '<div style="border-top:1px solid #f0f0f0;margin:4px 0;"></div>' +
      '<button class="profile-dropdown-item" id="profileLogoutBtn" style="width:100%;background:none;border:none;cursor:pointer;color:#ef4444;">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
        '<span>로그아웃</span>' +
      '</button>' +
    '</div>';

  topbarRight.appendChild(wrapper);

  var btn = document.getElementById('profileMenuBtn');
  var dropdown = document.getElementById('profileDropdown');

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', function () {
    dropdown.style.display = 'none';
  });
  dropdown.addEventListener('click', function (e) { e.stopPropagation(); });

  var logoutBtn = document.getElementById('profileLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function () {
      try { await window.api.post('/auth/logout'); } catch (e) {}
      window.location.href = '/login.html';
    });
  }

  // 로그인 사용자의 실제 프로필 사진 반영 (하드코딩 이미지 대신). 실패해도 기본 아바타 유지.
  (function loadAvatar() {
    var avatar = document.getElementById('profileMenuAvatar');
    if (!avatar || !window.api) return;
    window.api.get('/auth/me', { silentAuthFail: true })
      .then(function (me) { if (me && me.picture) avatar.src = me.picture; })
      .catch(function () {});
  })();
})();
