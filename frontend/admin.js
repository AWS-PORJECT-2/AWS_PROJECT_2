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
        ['funds', 'deposits', 'deletes', 'users'].forEach(function (v) {
          var el = document.getElementById('view' + v.charAt(0).toUpperCase() + v.slice(1));
          if (el) el.style.display = currentView === v ? '' : 'none';
        });
        renderViews();
        if (currentView === 'funds') load();
        else if (currentView === 'deposits') loadDeposits();
        else if (currentView === 'deletes') loadDeleteRequests();
        else if (currentView === 'users') loadUsers();
      });
    });
    var us = document.getElementById('userSearch');
    if (us) us.addEventListener('input', function () { loadUsers(us.value.trim()); });
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

    if (f.delegated) {
      var dBadge = document.createElement('span');
      dBadge.textContent = '대리';
      dBadge.style.cssText = 'padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700;color:#7c3aed;background:#f3f0fe;align-self:center;';
      actions.appendChild(dBadge);
      actions.appendChild(actionBtn('리워드 설정', '#fff', '#7c3aed', function () { setRewards(f.id); }, '#c4b5fd'));
    }
    if (f.status === 'pending') {
      actions.appendChild(actionBtn('검토', '#fff', '#4b5563', function () { openReviewModal(f.id); }, '#e5e7eb'));
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

  // 대리 펀드 리워드 설정 — '선물명:금액:수량(선택)' 줄바꿈 입력 파싱 → POST
  async function setRewards(id) {
    var raw = prompt('리워드를 한 줄에 하나씩 입력하세요.\n형식: 선물명:금액:수량(선택)\n예)\n네이비 과잠:39000:50\n로고 키링:5000', '');
    if (raw == null) return;
    var tiers = raw.split('\n').map(function (line) {
      var parts = line.split(':');
      var title = (parts[0] || '').trim();
      var price = parseInt(parts[1], 10);
      if (!title || !Number.isFinite(price)) return null;
      var t = { title: title, price: price };
      var stock = parseInt(parts[2], 10);
      if (Number.isFinite(stock) && stock >= 1) t.stockLimit = stock;
      return t;
    }).filter(Boolean);
    if (!tiers.length) { alert('유효한 리워드가 없습니다. 형식을 확인하세요.'); return; }
    try {
      await window.api.post('/admin/funds/' + encodeURIComponent(id) + '/rewards', { rewardTiers: tiers });
      alert('리워드 ' + tiers.length + '종 설정 완료. 이제 승인하면 공개됩니다.');
      load();
    } catch (e) { alert('리워드 설정 실패: ' + ((e && e.message) || '')); }
  }

  // 펀드 검토 모달 (H4) — 승인 전 내용(리워드·본문·이미지) 확인 후 승인/반려
  async function openReviewModal(id) {
    var back = document.createElement('div');
    back.style.cssText = 'position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:16px;max-width:640px;width:100%;max-height:86vh;overflow-y:auto;padding:24px;';
    box.innerHTML = '<div style="color:#9ca3af;text-align:center;padding:40px;">불러오는 중…</div>';
    back.appendChild(box);
    back.addEventListener('click', function (e) { if (e.target === back) back.remove(); });
    document.body.appendChild(back);

    var f;
    try { f = await window.api.get('/groupbuys/' + encodeURIComponent(id)); }
    catch (e) { box.innerHTML = '<div style="color:#ef4444;text-align:center;padding:40px;">불러오기 실패</div>'; return; }

    var catLabel = (typeof window.dtCategory === 'function' && window.dtCategory(f.category)) ? window.dtCategory(f.category).label : (f.category || '-');
    box.innerHTML = '';
    var head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;';
    var ht = document.createElement('div');
    var cat = document.createElement('span'); cat.className = 'dt-badge dt-badge--cat'; cat.textContent = catLabel;
    if (f.delegated) { var pb = document.createElement('span'); pb.className = 'dt-badge dt-badge--proxy'; pb.style.marginLeft = '6px'; pb.textContent = '대리'; cat.after && ht.appendChild(cat); ht.appendChild(pb); } else { ht.appendChild(cat); }
    var ttl = document.createElement('h2'); ttl.style.cssText = 'font-size:20px;font-weight:800;margin:8px 0 0;'; ttl.textContent = f.title || '';
    ht.appendChild(ttl);
    var x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', '닫기');
    x.style.cssText = 'background:none;border:none;font-size:24px;cursor:pointer;color:#9ca3af;line-height:1;';
    x.addEventListener('click', function () { back.remove(); });
    head.appendChild(ht); head.appendChild(x); box.appendChild(head);

    if (f.description) {
      var d = document.createElement('p'); d.style.cssText = 'color:#4b5563;font-size:14px;margin:0 0 16px;'; d.textContent = f.description; box.appendChild(d);
    }

    var thumb = f.tryonImageUrl || f.designImageUrl;
    if (thumb) {
      var im = document.createElement('img'); im.src = thumb; im.alt = '대표 이미지';
      im.style.cssText = 'width:100%;max-height:280px;object-fit:contain;background:#f3f4f6;border-radius:10px;margin-bottom:16px;'; box.appendChild(im);
    }

    // 리워드
    var rw = document.createElement('div'); rw.style.marginBottom = '16px';
    rw.innerHTML = '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">리워드</div>';
    var tiers = Array.isArray(f.rewardTiers) ? f.rewardTiers : [];
    if (!tiers.length) { rw.innerHTML += '<div style="color:#9ca3af;font-size:13px;">리워드 미설정' + (f.delegated ? ' (대리 — 관리자가 설정 필요)' : '') + '</div>'; }
    else tiers.forEach(function (t) {
      var r = document.createElement('div'); r.style.cssText = 'display:flex;justify-content:space-between;border:1px solid #eee;border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:13px;';
      var a = document.createElement('span'); a.textContent = t.title + (t.stockLimit ? ' (한정 ' + t.stockLimit + ')' : '');
      var b = document.createElement('span'); b.style.fontWeight = '700'; b.textContent = Number(t.price || 0).toLocaleString('ko-KR') + '원';
      r.appendChild(a); r.appendChild(b); rw.appendChild(r);
    });
    box.appendChild(rw);

    // 본문 블록
    var blocks = Array.isArray(f.contentBlocks) ? f.contentBlocks : [];
    if (blocks.length) {
      var bd = document.createElement('div'); bd.style.marginBottom = '16px';
      bd.innerHTML = '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">본문</div>';
      blocks.forEach(function (bl) {
        if (bl.type === 'text') { var p = document.createElement('p'); p.style.cssText = 'font-size:13px;color:#4b5563;white-space:pre-wrap;margin:0 0 8px;'; p.textContent = bl.value; bd.appendChild(p); }
        else if (bl.type === 'image') { var ig = document.createElement('img'); ig.src = bl.value; ig.alt = '본문 이미지'; ig.style.cssText = 'width:100%;border-radius:8px;margin-bottom:8px;'; bd.appendChild(ig); }
      });
      box.appendChild(bd);
    }

    // 액션
    var act = document.createElement('div'); act.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;position:sticky;bottom:0;background:#fff;padding-top:12px;border-top:1px solid #f0f0f0;';
    var view = document.createElement('a'); view.href = '/detail.html?id=' + encodeURIComponent(id); view.target = '_blank';
    view.textContent = '새 탭에서 보기'; view.className = 'dt-btn dt-btn--ghost'; act.appendChild(view);
    var ap = document.createElement('button'); ap.type = 'button'; ap.textContent = '승인'; ap.className = 'dt-btn dt-btn--primary';
    ap.addEventListener('click', async function () {
      try { await window.api.post('/admin/funds/' + encodeURIComponent(id) + '/approve', {}); back.remove(); load(); }
      catch (e) { alert('승인 실패: ' + ((e && e.message) || '')); }
    });
    var rj = document.createElement('button'); rj.type = 'button'; rj.textContent = '반려'; rj.className = 'dt-btn dt-btn--danger';
    rj.addEventListener('click', async function () {
      if (!confirm('이 펀드를 반려할까요?')) return;
      try { await window.api.post('/admin/funds/' + encodeURIComponent(id) + '/reject', {}); back.remove(); load(); }
      catch (e) { alert('반려 실패: ' + ((e && e.message) || '')); }
    });
    act.appendChild(ap); act.appendChild(rj);
    box.appendChild(act);
  }

  // ===== 삭제 요청 =====
  async function loadDeleteRequests() {
    var list = document.getElementById('adminDeleteList');
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;">불러오는 중…</div>';
    try {
      var res = await window.api.get('/admin/fund-delete-requests');
      var items = (res && res.items) || [];
      if (!items.length) { list.innerHTML = '<div style="padding:48px 20px;text-align:center;color:#9ca3af;">삭제 요청이 없습니다.</div>'; return; }
      list.innerHTML = '';
      items.forEach(function (f) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:16px;align-items:center;padding:16px;border:1px solid #fde68a;border-radius:14px;margin-bottom:12px;background:#fffbeb;';
        var info = document.createElement('div'); info.style.cssText = 'flex:1;min-width:0;';
        var t = document.createElement('div'); t.style.cssText = 'font-size:15px;font-weight:700;color:#1a1a1a;'; t.textContent = f.title;
        var m = document.createElement('div'); m.style.cssText = 'font-size:13px;color:#92400e;margin-top:4px;';
        m.textContent = '작성자: ' + (f.authorName || '-') + ' · 사유: ' + (f.deleteReason || '(없음)');
        info.appendChild(t); info.appendChild(m); wrap.appendChild(info);
        var btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = '삭제 처리';
        btn.style.cssText = 'padding:9px 16px;border:none;border-radius:10px;background:#ef4444;color:#fff;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;';
        btn.addEventListener('click', function () { doDelete(f.id); });
        wrap.appendChild(btn);
        list.appendChild(wrap);
      });
    } catch (e) {
      list.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;">불러오기 실패</div>';
    }
  }
  async function doDelete(id) {
    if (!confirm('이 펀드를 삭제 처리할까요? 모든 후원이 취소되고, 입금 완료 건은 환불 대상으로 안내됩니다.')) return;
    try {
      var res = await window.api.post('/admin/funds/' + encodeURIComponent(id) + '/delete', {});
      var refund = (res && res.refundable) || [];
      if (refund.length) {
        alert('삭제 완료. 환불 필요(입금완료) ' + refund.length + '건:\n' +
          refund.map(function (r) { return '· ' + (r.depositorName || r.userId) + ' / ' + Number(r.amount || 0).toLocaleString('ko-KR') + '원'; }).join('\n'));
      } else {
        alert('삭제 완료. 환불 대상(입금완료) 없음.');
      }
      loadDeleteRequests();
    } catch (e) { alert('삭제 실패: ' + ((e && e.message) || '')); }
  }

  // ===== 사용자 관리 =====
  async function loadUsers(q) {
    var list = document.getElementById('adminUserList');
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;">불러오는 중…</div>';
    try {
      var res = await window.api.get('/admin/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
      var items = (res && res.items) || [];
      if (!items.length) { list.innerHTML = '<div style="padding:48px 20px;text-align:center;color:#9ca3af;">사용자가 없습니다.</div>'; return; }
      list.innerHTML = '';
      items.forEach(function (u) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:16px;align-items:center;padding:14px 16px;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:10px;background:#fff;';
        var info = document.createElement('div'); info.style.cssText = 'flex:1;min-width:0;';
        var nm = document.createElement('div'); nm.style.cssText = 'font-size:14px;font-weight:700;color:#1a1a1a;';
        nm.textContent = (u.name || '(이름없음)') + (u.role === 'ADMIN' ? ' · 관리자' : '');
        var em = document.createElement('div'); em.style.cssText = 'font-size:13px;color:#6b7280;'; em.textContent = u.email;
        info.appendChild(nm); info.appendChild(em); wrap.appendChild(info);
        var btn = document.createElement('button');
        btn.type = 'button';
        var makeAdmin = u.role !== 'ADMIN';
        btn.textContent = makeAdmin ? '관리자 지정' : '관리자 해제';
        btn.style.cssText = 'padding:8px 14px;border:1.5px solid ' + (makeAdmin ? '#8b5cf6' : '#e5e7eb') + ';border-radius:10px;background:' + (makeAdmin ? '#f3f0fe' : '#fff') + ';color:' + (makeAdmin ? '#7c3aed' : '#6b7280') + ';font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;';
        btn.addEventListener('click', async function () {
          try {
            await window.api.post('/admin/users/' + encodeURIComponent(u.id) + '/role', { role: makeAdmin ? 'ADMIN' : 'USER' });
            loadUsers(q);
          } catch (e) { alert('변경 실패: ' + ((e && e.message) || '')); }
        });
        wrap.appendChild(btn);
        list.appendChild(wrap);
      });
    } catch (e) {
      list.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;">불러오기 실패</div>';
    }
  }
})();
