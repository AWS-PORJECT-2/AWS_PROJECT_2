/* =====================================================================
 * DOOTHING — 공용 펀딩 참여(체크아웃) 모듈. window.WZCheckout.start(fundId).
 * 상세 페이지 없이 릴스 피드 등 어디서든 GET DROP → 기존 펀딩 참여 흐름 실행.
 * 기존 백엔드 그대로 사용: GET /groupbuys/:id, GET /addresses, POST /funds/:id/back.
 * ===================================================================== */
(function () {
  const W = window.WZ;
  if (!W) return;

  let busy = false;

  function money(n) { return (Math.max(0, Math.floor(Number(n) || 0))).toLocaleString() + '원'; }

  /* 다크 모달 셸 */
  function modal(title) {
    const overlay = W.el('div', { class: 'dt-co', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '펀딩 참여' });
    const box = W.el('div', { class: 'dt-co__box' });
    const head = W.el('div', { class: 'dt-co__head' });
    head.append(W.el('strong', {}, title || ''), (function () {
      const x = W.el('button', { class: 'dt-co__close', type: 'button', 'aria-label': '닫기' }, '×');
      x.addEventListener('click', () => overlay.remove());
      return x;
    })());
    box.appendChild(head);
    const body = W.el('div', { class: 'dt-co__body' });
    box.appendChild(body);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    return { overlay, body };
  }

  function loginRedirect() {
    location.href = '/login.html?return=' + encodeURIComponent(location.pathname + location.search);
  }

  /* 진입점 — fundId 로 참여 흐름 시작 */
  async function start(fundId, preload) {
    if (busy) return;
    if (!fundId) { alert('드롭 정보를 찾을 수 없어요.'); return; }
    busy = true;
    try {
      // 1) 펀드 상세 조회(리워드/제목/가격)
      let f = preload || null;
      if (!f) {
        try { f = await window.api.get('/groupbuys/' + encodeURIComponent(fundId), { silentAuthFail: true }); }
        catch (e) { alert('드롭 정보를 불러오지 못했어요.'); return; }
      }
      const tiers = Array.isArray(f.rewardTiers) ? f.rewardTiers : [];
      if (!tiers.length) { alert('참여 가능한 리워드가 없어요.'); return; }

      // 2) 리워드 선택 — 1개면 자동, 여러 개면 선택 모달
      let tier;
      if (tiers.length === 1) tier = tiers[0];
      else { tier = await pickTier(f, tiers); if (!tier) return; }

      // 3) 배송지 확인
      let addrs;
      try {
        const r = await window.api.get('/addresses');
        addrs = Array.isArray(r) ? r : (r && r.items) || [];
      } catch (e) {
        if (e && e.status === 401) { loginRedirect(); return; }
        alert('배송지 조회에 실패했어요.'); return;
      }
      if (!addrs.length) {
        if (confirm('참여하려면 배송지가 필요해요. 배송지를 등록할까요?')) location.href = '/addresses.html';
        return;
      }
      const def = addrs.find((a) => a.isDefault) || addrs[0];

      // 4) 참여(back) — 기존 엔드포인트
      const tierId = (tier.id != null) ? tier.id : tiers.indexOf(tier);
      let res;
      try {
        res = await window.api.post('/funds/' + encodeURIComponent(f.id || fundId) + '/back', {
          rewardTierId: tierId, addressId: def.id,
        });
      } catch (e) {
        if (e && e.status === 401) { loginRedirect(); return; }
        const code = (e && (e.code || (e.data && e.data.error))) || '';
        if (code === 'PAYMENT_METHOD_REQUIRED') { if (confirm('결제수단 등록이 필요해요. 등록하러 갈까요?')) location.href = '/settings.html#payment'; return; }
        if (code === 'ALREADY_BACKED') { alert('이미 이 드롭에 참여 중이에요.'); return; }
        if (code === 'NOT_OPEN') { alert('방금 마감된 드롭이에요.'); return; }
        alert('참여에 실패했어요: ' + ((e && e.message) || '알 수 없는 오류'));
        return;
      }

      // 5) 완료 모달
      showDone(f, tier, def);
    } finally {
      busy = false;
    }
  }

  /* 리워드 선택 모달 (여러 개일 때) */
  function pickTier(f, tiers) {
    return new Promise((resolve) => {
      const m = modal('리워드 선택');
      let chosen = null;
      tiers.forEach((t) => {
        const row = W.el('button', { class: 'dt-co__tier', type: 'button' });
        row.append(
          W.el('div', { class: 'dt-co__tier-name' }, t.title || '리워드'),
          W.el('div', { class: 'dt-co__tier-price' }, money(t.price))
        );
        if (t.description) row.appendChild(W.el('div', { class: 'dt-co__tier-desc' }, t.description));
        row.addEventListener('click', () => { chosen = t; m.overlay.remove(); resolve(t); });
        m.body.appendChild(row);
      });
      m.overlay.addEventListener('click', (e) => { if (e.target === m.overlay && !chosen) resolve(null); });
    });
  }

  /* 완료 모달 */
  function showDone(f, tier, addr) {
    const m = modal('참여 완료');
    const img = f.coverImageUrl || (Array.isArray(f.images) && f.images[0]) || '';
    if (img) m.body.appendChild(W.el('div', { class: 'dt-co__cover' }, W.el('img', { src: img, alt: '' })));
    m.body.appendChild(W.el('p', { class: 'dt-co__ttl' }, f.title || ''));
    const info = W.el('div', { class: 'dt-co__info' });
    info.append(
      row('리워드', tier.title || '리워드'),
      row('금액', money(tier.price)),
      row('배송지', (addr.recipient || addr.name || '') + ' · ' + (addr.address || addr.roadAddress || ''))
    );
    m.body.appendChild(info);
    m.body.appendChild(W.el('p', { class: 'dt-co__note' }, '예약이 완료됐어요. 마감일에 목표를 달성하면 결제가 진행됩니다. 마감 전에는 마이페이지에서 취소할 수 있어요.'));
    const go = W.el('button', { class: 'dt-co__cta', type: 'button' }, '내 참여 내역 보기');
    go.addEventListener('click', () => { location.href = '/profile.html#backings'; });
    m.body.appendChild(go);
    function row(k, v) { const d = W.el('div', { class: 'dt-co__inforow' }); d.append(W.el('span', {}, k), W.el('b', {}, v)); return d; }
  }

  window.WZCheckout = { start };
})();
