/**
 * 관리자 펀드 심사 페이지.
 * - /auth/me 의 role 이 ADMIN 이 아니면 접근 차단.
 * - 상태별 펀드 목록(심사대기/공개/반려) + 승인·반려.
 * 서버에서도 requireAdmin 으로 보호되므로(이중 방어), 이 화면은 편의 UI.
 */
(function () {
  var esc = window.escapeHTML || function (v) { return String(v == null ? '' : v); };
  var currentStatus = 'pending';

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    var me;
    try {
      me = await window.api.get('/auth/me');
    } catch (e) {
      window.location.href = '/login.html';
      return;
    }
    if (!me || me.role !== 'ADMIN') {
      document.getElementById('adminFundList').innerHTML =
        '<div style="padding:48px 20px;text-align:center;color:#ef4444;font-weight:600;">관리자 권한이 필요합니다.</div>';
      var tabs = document.getElementById('adminTabs');
      if (tabs) tabs.style.display = 'none';
      return;
    }

    bindViews();
    bindTabs();
    bindDepositTabs();
    load();
  }

  var currentView = 'funds';
  var currentDepositStatus = 'awaiting_deposit';

  function bindViews() {
    document.querySelectorAll('.admin-view').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentView = btn.dataset.view;
        document.getElementById('viewFunds').style.display = currentView === 'funds' ? '' : 'none';
        document.getElementById('viewDeposits').style.display = currentView === 'deposits' ? '' : 'none';
        renderViews();
        if (currentView === 'funds') load(); else loadDeposits();
      });
    });
    renderViews();
  }
  function renderViews() {
    document.querySelectorAll('.admin-view').forEach(function (btn) {
      var active = btn.dataset.view === currentView;
      btn.style.cssText = 'padding:9px 18px;border-radius:10px;border:none;background:' +
        (active ? '#8b5cf6' : '#f3f4f6') + ';color:' + (active ? '#fff' : '#6b7280') +
        ';font-size:14px;font-weight:700;cursor:pointer;';
    });
  }

  function bindDepositTabs() {
    document.querySelectorAll('.deposit-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentDepositStatus = btn.dataset.status;
        renderDepositTabs();
        loadDeposits();
      });
    });
    renderDepositTabs();
  }
  function renderDepositTabs() {
    document.querySelectorAll('.deposit-tab').forEach(function (btn) {
      var active = btn.dataset.status === currentDepositStatus;
      btn.style.cssText = 'padding:9px 18px;border-radius:20px;border:1.5px solid ' + (active ? '#8b5cf6' : '#e5e7eb') +
        ';background:' + (active ? '#f3f0fe' : '#fff') + ';color:' + (active ? '#8b5cf6' : '#6b7280') +
        ';font-size:14px;font-weight:600;cursor:pointer;';
    });
  }

  async function loadDeposits() {
    var list = document.getElementById('adminDepositList');
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;">불러오는 중…</div>';
    try {
      var res = await window.api.get('/admin/deposits?status=' + encodeURIComponent(currentDepositStatus));
      var items = (res && res.items) || [];
      if (!items.length) { list.innerHTML = '<div style="padding:48px 20px;text-align:center;color:#9ca3af;">해당 상태의 입금 건이 없습니다.</div>'; return; }
      list.innerHTML = '';
      items.forEach(function (o) { list.appendChild(depositCard(o)); });
    } catch (e) {
      list.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;">불러오기 실패: ' + esc((e && e.message) || '') + '</div>';
    }
  }

  function depositCard(o) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:16px;align-items:center;padding:16px;border:1px solid #e5e7eb;border-radius:14px;margin-bottom:12px;background:#fff;';
    var info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';
    var title = document.createElement('div');
    title.style.cssText = 'font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:4px;';
    title.textContent = o.fundTitle + ' — ' + o.rewardTitle;
    var meta = document.createElement('div');
    meta.style.cssText = 'font-size:13px;color:#6b7280;';
    meta.textContent = '후원자: ' + (o.userName || '-') + ' · 입금자명: ' + (o.depositorName || '(미입력)') +
      ' · 금액: ' + Number(o.amount || 0).toLocaleString('ko-KR') + '원';
    info.appendChild(title); info.appendChild(meta);
    wrap.appendChild(info);

    if (o.status === 'awaiting_deposit') {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = '입금 확인';
      btn.style.cssText = 'padding:9px 16px;border:none;border-radius:10px;background:#8b5cf6;color:#fff;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;';
      btn.addEventListener('click', async function () {
        if (!confirm('입금자명·금액을 대조하셨나요? 확인하면 후원이 확정됩니다.')) return;
        try {
          await window.api.post('/admin/deposits/' + encodeURIComponent(o.id) + '/confirm', {});
          loadDeposits();
        } catch (e) { alert('확인 실패: ' + ((e && e.message) || '')); }
      });
      wrap.appendChild(btn);
    } else {
      var badge = document.createElement('span');
      badge.textContent = '확인 완료';
      badge.style.cssText = 'padding:6px 12px;border-radius:8px;font-size:13px;font-weight:600;color:#16a34a;background:#dcfce7;flex-shrink:0;';
      wrap.appendChild(badge);
    }
    return wrap;
  }

  function bindTabs() {
    document.querySelectorAll('.admin-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentStatus = btn.dataset.status;
        renderTabs();
        load();
      });
    });
    renderTabs();
  }

  function renderTabs() {
    document.querySelectorAll('.admin-tab').forEach(function (btn) {
      var active = btn.dataset.status === currentStatus;
      btn.style.cssText =
        'padding:9px 18px;border-radius:20px;border:1.5px solid ' + (active ? '#8b5cf6' : '#e5e7eb') +
        ';background:' + (active ? '#f3f0fe' : '#fff') + ';color:' + (active ? '#8b5cf6' : '#6b7280') +
        ';font-size:14px;font-weight:600;cursor:pointer;';
    });
  }

  async function load() {
    var list = document.getElementById('adminFundList');
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;">불러오는 중…</div>';
    try {
      var res = await window.api.get('/admin/funds?status=' + encodeURIComponent(currentStatus));
      var items = (res && res.items) || [];
      if (items.length === 0) {
        list.innerHTML = '<div style="padding:48px 20px;text-align:center;color:#9ca3af;">해당 상태의 펀드가 없습니다.</div>';
        return;
      }
      list.innerHTML = '';
      items.forEach(function (f) { list.appendChild(card(f)); });
    } catch (e) {
      list.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;">목록을 불러오지 못했습니다: ' + esc((e && e.message) || '') + '</div>';
    }
  }

  function card(f) {
    var cat = (typeof window.dtCategory === 'function' && window.dtCategory(f.category)) ? window.dtCategory(f.category).label : (f.category || '-');
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:16px;align-items:center;padding:16px;border:1px solid #e5e7eb;border-radius:14px;margin-bottom:12px;background:#fff;';

    var thumb = document.createElement('div');
    thumb.style.cssText = 'width:72px;height:72px;border-radius:10px;overflow:hidden;flex-shrink:0;background:#f3f4f6;';
    if (f.imageUrl) {
      var img = document.createElement('img');
      img.src = f.imageUrl; img.alt = f.title || ''; img.loading = 'lazy';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      thumb.appendChild(img);
    }

    var info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';
    var title = document.createElement('div');
    title.style.cssText = 'font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:4px;';
    title.textContent = f.title || '(제목 없음)';
    var meta = document.createElement('div');
    meta.style.cssText = 'font-size:13px;color:#6b7280;';
    meta.textContent = '카테고리: ' + cat + ' · 작성자: ' + (f.authorName || '-') +
      ' · 목표 ' + (f.targetQuantity || 0) + '개 · ' + Number(f.finalPrice || 0).toLocaleString('ko-KR') + '원';
    info.appendChild(title); info.appendChild(meta);

    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-shrink:0;';

    var viewBtn = document.createElement('a');
    viewBtn.href = '/detail.html?id=' + encodeURIComponent(f.id);
    viewBtn.target = '_blank';
    viewBtn.textContent = '보기';
    viewBtn.style.cssText = 'padding:9px 14px;border:1px solid #e5e7eb;border-radius:10px;font-size:13px;font-weight:600;color:#4b5563;text-decoration:none;';
    actions.appendChild(viewBtn);

    if (f.status === 'pending') {
      actions.appendChild(actionBtn('승인', '#8b5cf6', '#fff', function () { review(f.id, 'approve', wrap); }));
      actions.appendChild(actionBtn('반려', '#fff', '#ef4444', function () { review(f.id, 'reject', wrap); }, '#ef4444'));
    } else {
      var badge = document.createElement('span');
      badge.textContent = f.status === 'open' ? '공개됨' : '반려됨';
      badge.style.cssText = 'padding:6px 12px;border-radius:8px;font-size:13px;font-weight:600;color:' +
        (f.status === 'open' ? '#16a34a' : '#9ca3af') + ';background:' + (f.status === 'open' ? '#dcfce7' : '#f3f4f6') + ';';
      actions.appendChild(badge);
    }

    wrap.appendChild(thumb); wrap.appendChild(info); wrap.appendChild(actions);
    return wrap;
  }

  function actionBtn(label, bg, color, onClick, border) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'padding:9px 16px;border:1.5px solid ' + (border || bg) + ';border-radius:10px;background:' + bg +
      ';color:' + color + ';font-size:13px;font-weight:700;cursor:pointer;';
    b.addEventListener('click', onClick);
    return b;
  }

  async function review(id, action, wrap) {
    var verb = action === 'approve' ? '승인' : '반려';
    if (!confirm('이 펀드를 ' + verb + '하시겠습니까?')) return;
    try {
      await window.api.post('/admin/funds/' + encodeURIComponent(id) + '/' + action, {});
      wrap.style.opacity = '0.5';
      load(); // 목록 갱신
    } catch (e) {
      alert(verb + ' 실패: ' + ((e && e.message) || '알 수 없는 오류'));
    }
  }
})();
