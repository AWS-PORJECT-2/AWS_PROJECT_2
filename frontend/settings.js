/**
 * 설정 — 탭(프로필/계정/결제수단/배송지/알림).
 * 프로필: 닉네임·실명·전화·프로필사진 수정(PATCH /api/me).
 * 계정: 이메일 표시 + 회원 탈퇴(DELETE /api/me, 진행중 펀드/주문 있으면 차단).
 * 결제수단: 현재 무통장입금 안내. 배송지: 관리 페이지 링크(배송지 없으면 후원 불가 안내). 알림: 토글.
 */
(function () {
  const esc = window.escapeHTML || ((v) => String(v == null ? '' : v));
  let me = null;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try { me = await window.api.get('/auth/me'); }
    catch (e) { return; } // 401 → api 래퍼가 로그인으로
    bindTabs();
    renderProfile();
    renderAccount();
    renderPayment();
    renderAddress();
    renderNoti();
  }

  function bindTabs() {
    const tabs = document.querySelectorAll('.set-tab');
    const panes = { profile: 'setProfile', account: 'setAccount', payment: 'setPayment', address: 'setAddress', noti: 'setNoti' };
    function activate(tab) {
      Object.keys(panes).forEach((k) => { document.getElementById(panes[k]).style.display = k === tab ? '' : 'none'; });
      tabs.forEach((b) => {
        const on = b.dataset.tab === tab;
        b.style.cssText = 'padding:9px 16px;border-radius:10px;border:none;background:' + (on ? '#8b5cf6' : '#f3f4f6') +
          ';color:' + (on ? '#fff' : '#6b7280') + ';font-size:14px;font-weight:700;cursor:pointer;';
      });
    }
    tabs.forEach((b) => b.addEventListener('click', () => activate(b.dataset.tab)));
    activate('profile');
  }

  // ===== 프로필 =====
  function renderProfile() {
    const pane = document.getElementById('setProfile');
    const pic = (me && me.picture) || '';
    pane.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
        <div style="width:84px;height:84px;border-radius:50%;overflow:hidden;background:#ede9fe;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
          ${pic ? `<img src="${esc(pic)}" alt="프로필" style="width:100%;height:100%;object-fit:cover;">` : '<span style="color:#a78bfa;font-size:28px;font-weight:800;">' + esc(((me && (me.nickname || me.name)) || 'U').slice(0,1)) + '</span>'}
        </div>
        <div>
          <button type="button" id="btnPic" style="padding:9px 14px;border:1.5px solid #e5e7eb;border-radius:10px;background:#fff;font-size:13px;font-weight:600;color:#4b5563;cursor:pointer;">사진 변경</button>
          <input id="picInput" type="file" accept="image/*" hidden>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;max-width:420px;">
        ${field('닉네임', 'sNickname', (me && me.nickname) || (me && me.name) || '')}
        ${field('실명', 'sRealName', (me && me.realName) || '')}
        ${field('휴대폰', 'sPhone', (me && me.phone) || '')}
        <button type="button" id="btnSaveProfile" style="margin-top:6px;padding:13px;border:none;border-radius:12px;background:#8b5cf6;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">저장</button>
        <p id="profMsg" style="font-size:13px;margin:0;"></p>
      </div>`;

    document.getElementById('btnPic').addEventListener('click', () => document.getElementById('picInput').click());
    document.getElementById('picInput').addEventListener('change', onPicSelected);
    document.getElementById('btnSaveProfile').addEventListener('click', saveProfile);
  }

  function field(label, id, value) {
    return `<label style="display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;color:#374151;">${esc(label)}
      <input id="${id}" type="text" value="${esc(value)}" style="padding:11px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:15px;"></label>`;
  }

  function onPicSelected(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { alert('이미지는 3MB 이하만 가능합니다.'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await window.api.patch('/me', { picture: reader.result });
        me = Object.assign(me || {}, res);
        renderProfile();
      } catch (err) { alert('사진 변경 실패: ' + ((err && err.message) || '')); }
    };
    reader.readAsDataURL(f);
  }

  async function saveProfile() {
    const msg = document.getElementById('profMsg');
    const nickname = document.getElementById('sNickname').value.trim();
    if (!nickname) { msg.style.color = '#ef4444'; msg.textContent = '닉네임을 입력해 주세요.'; return; }
    const btn = document.getElementById('btnSaveProfile');
    btn.disabled = true; btn.textContent = '저장 중…';
    try {
      const res = await window.api.patch('/me', {
        nickname: nickname,
        realName: document.getElementById('sRealName').value.trim(),
        phone: document.getElementById('sPhone').value.trim(),
      });
      me = Object.assign(me || {}, res);
      msg.style.color = '#16a34a'; msg.textContent = '저장되었습니다.';
    } catch (err) {
      msg.style.color = '#ef4444'; msg.textContent = (err && err.message) || '저장 실패';
    } finally {
      btn.disabled = false; btn.textContent = '저장';
    }
  }

  // ===== 계정 =====
  function renderAccount() {
    const pane = document.getElementById('setAccount');
    pane.innerHTML = `
      <div style="max-width:480px;">
        <div style="padding:16px;border:1px solid #eee;border-radius:12px;margin-bottom:20px;">
          <div style="font-size:13px;color:#9ca3af;">이메일</div>
          <div style="font-size:15px;font-weight:600;color:#1a1a1a;margin-top:4px;">${esc((me && me.email) || '-')}</div>
        </div>
        <button type="button" id="btnLogout" style="width:100%;padding:13px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;color:#4b5563;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:24px;">로그아웃</button>
        <div style="border-top:1px solid #f0f0f0;padding-top:20px;">
          <h3 style="font-size:15px;font-weight:700;color:#ef4444;margin:0 0 6px;">회원 탈퇴</h3>
          <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0 0 12px;">탈퇴 시 계정·배송지·후원 내역이 삭제되며 되돌릴 수 없습니다. 진행 중인 펀드·주문이 있으면 탈퇴가 제한됩니다.</p>
          <button type="button" id="btnDelete" style="padding:11px 18px;border:1.5px solid #fecaca;border-radius:10px;background:#fef2f2;color:#ef4444;font-size:14px;font-weight:700;cursor:pointer;">회원 탈퇴</button>
        </div>
      </div>`;
    document.getElementById('btnLogout').addEventListener('click', () => {
      if (typeof window.handleLogout === 'function') window.handleLogout();
      else { fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => location.href = '/main.html'); }
    });
    document.getElementById('btnDelete').addEventListener('click', onDeleteAccount);
  }

  async function onDeleteAccount() {
    if (!confirm('정말 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    const typed = prompt('탈퇴를 확인하려면 "탈퇴"를 입력해 주세요.');
    if (typed !== '탈퇴') return;
    try {
      await window.api.del('/me');
      alert('탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.');
      location.href = '/landing.html';
    } catch (err) {
      alert((err && err.message) || '탈퇴 처리에 실패했습니다.');
    }
  }

  // ===== 결제수단 =====
  function renderPayment() {
    document.getElementById('setPayment').innerHTML = `
      <div style="max-width:480px;padding:16px;border:1px solid #eee;border-radius:12px;">
        <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:6px;">무통장입금(계좌이체)</div>
        <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0;">현재 후원은 무통장입금으로 진행됩니다. 후원 시 안내되는 계좌로 입금 후 입금자명을 제출하면 관리자 확인 후 후원이 확정됩니다. 카드결제는 준비 중입니다.</p>
      </div>`;
  }

  // ===== 배송지 =====
  function renderAddress() {
    document.getElementById('setAddress').innerHTML = `
      <div style="max-width:480px;">
        <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 14px;">후원(펀딩 참여)을 하려면 배송지가 등록되어 있어야 합니다. 배송지를 추가·관리하세요.</p>
        <a href="/addresses.html" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#8b5cf6;color:#fff;font-size:14px;font-weight:700;text-decoration:none;">배송지 관리로 이동</a>
      </div>`;
  }

  // ===== 알림 =====
  function renderNoti() {
    const on = localStorage.getItem('pushEnabled') !== '0';
    document.getElementById('setNoti').innerHTML = `
      <div style="max-width:480px;display:flex;align-items:center;justify-content:space-between;padding:16px;border:1px solid #eee;border-radius:12px;">
        <div>
          <div style="font-size:15px;font-weight:700;color:#1a1a1a;">푸시 알림</div>
          <div style="font-size:13px;color:#9ca3af;margin-top:2px;">달성·결제·배송 알림 받기</div>
        </div>
        <button type="button" id="notiToggle" aria-pressed="${on}" style="width:52px;height:30px;border-radius:999px;border:none;cursor:pointer;background:${on ? '#8b5cf6' : '#d1d5db'};position:relative;transition:background .15s;">
          <span style="position:absolute;top:3px;left:${on ? '25px' : '3px'};width:24px;height:24px;border-radius:50%;background:#fff;transition:left .15s;"></span>
        </button>
      </div>`;
    document.getElementById('notiToggle').addEventListener('click', function () {
      const cur = localStorage.getItem('pushEnabled') !== '0';
      localStorage.setItem('pushEnabled', cur ? '0' : '1');
      renderNoti();
    });
  }
})();
