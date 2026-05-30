/**
 * 설정 (스펙 §3.5) — 탭(프로필/계정/결제수단/배송지/알림) + 행 UI.
 *
 * API 로직은 기존을 그대로 보존하고 UI만 탭/행 구조로 재배치한다.
 *  - 프로필/계정 수정: PATCH /api/me  (nickname / realName / phone / picture)
 *  - 회원 탈퇴: DELETE /api/me
 *  - 배송지: GET/POST/PATCH/DELETE /api/addresses  (window.api)
 *  - 결제수단: GET /api/payment-methods (없으면 빈상태)
 *  - 알림: localStorage pushEnabled 토글
 *
 * XSS: DOM 생성 + textContent 로 사용자 데이터 처리(innerHTML 에 사용자값 직접 보간 금지).
 */
(function () {
  const elf = window.el; // main.js 의 DOM 헬퍼(전역) — 없으면 폴백
  let me = null;

  /* ---------- DOM 헬퍼 (main.js el 재사용, 폴백 포함) ---------- */
  function h(tag, props, ...children) {
    if (typeof elf === 'function') return elf(tag, props || {}, ...children);
    const node = document.createElement(tag);
    const p = props || {};
    for (const k of Object.keys(p)) {
      const v = p[k];
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'onClick') node.addEventListener('click', v);
      else if (k === 'style') node.style.cssText = v;
      else node.setAttribute(k, v);
    }
    children.flat().forEach((c) => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try { me = await window.api.get('/auth/me'); }
    catch (e) { return; } // 401 → api 래퍼가 로그인으로 보냄
    bindTabs();
    renderProfile();
    renderAccount();
    renderPayment();
    renderAddress();
    renderNoti();

    // ?tab= 쿼리로 진입 시 해당 탭 활성화
    try {
      const t = new URLSearchParams(location.search).get('tab');
      if (t && document.querySelector('.set-tab[data-tab="' + t + '"]')) activateTab(t);
    } catch (_) { /* ignore */ }
  }

  /* ===== 탭 ===== */
  const PANES = { profile: 'setProfile', account: 'setAccount', payment: 'setPayment', address: 'setAddress', noti: 'setNoti' };

  function activateTab(tab) {
    Object.keys(PANES).forEach((k) => { document.getElementById(PANES[k]).hidden = (k !== tab); });
    document.querySelectorAll('.set-tab').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tab === tab);
    });
  }
  function bindTabs() {
    document.querySelectorAll('.set-tab').forEach((b) => {
      b.addEventListener('click', () => activateTab(b.dataset.tab));
    });
    activateTab('profile');
  }

  /* ===== 행 빌더(라벨 굵게 + 값/빈문구 + 우측 변경 pill) ===== */
  function buildRow(label, valueNode, opts) {
    opts = opts || {};
    const row = h('div', { class: 'set-row' });
    row.appendChild(h('div', { class: 'set-row__label' }, label));
    const valWrap = h('div', { class: 'set-row__value' + (opts.empty ? ' is-empty' : '') });
    if (typeof valueNode === 'string') valWrap.textContent = valueNode;
    else if (valueNode) valWrap.appendChild(valueNode);
    row.appendChild(valWrap);
    const action = h('div', { class: 'set-row__action' });
    if (opts.actionNode) action.appendChild(opts.actionNode);
    else {
      const btn = h('button', { type: 'button', class: 'set-pill' }, opts.btnLabel || '변경');
      if (opts.disabled) { btn.disabled = true; btn.title = opts.disabledHint || ''; }
      if (typeof opts.onChange === 'function') btn.addEventListener('click', () => opts.onChange(row, valWrap, btn));
      action.appendChild(btn);
    }
    row.appendChild(action);
    return row;
  }

  /* ===== 프로필 탭 ===== */
  function renderProfile() {
    const pane = document.getElementById('setProfile');
    pane.replaceChildren();

    const layout = h('div', { class: 'set-profile' });
    const rows = h('div', { class: 'set-rows' });

    // 프로필 사진
    const pic = (me && me.picture) || '';
    const avatar = h('div', { class: 'set-avatar' });
    if (pic) {
      const img = h('img', { alt: '프로필' });
      img.src = pic;
      avatar.appendChild(img);
    } else {
      const initial = (((me && (me.nickname || me.name)) || 'U') + '').slice(0, 1);
      avatar.appendChild(h('span', { class: 'set-avatar__initial' }, initial));
    }
    const picBtn = h('button', { type: 'button', class: 'set-pill' }, '변경');
    const picInput = h('input', { type: 'file', accept: 'image/*', hidden: 'hidden' });
    picBtn.addEventListener('click', () => picInput.click());
    picInput.addEventListener('change', onPicSelected);
    const picAction = h('div', { class: 'set-row__action' }, picBtn, picInput);
    rows.appendChild(buildRow('프로필 사진', avatar, { actionNode: picAction }));

    // 이름(닉네임 — PATCH 가능)
    const nameVal = (me && me.nickname) || (me && me.name) || '';
    rows.appendChild(buildRow('이름', nameVal || '등록된 이름이 없어요', {
      empty: !nameVal,
      onChange: (row, valWrap, btn) => openInlineEdit(row, valWrap, btn, {
        value: nameVal, placeholder: '이름(닉네임)', field: 'nickname', required: true,
      }),
    }));

    // 사용자이름(URL) — 백엔드 미지원: 빈상태 + 준비중
    rows.appendChild(buildRow('사용자이름', '아직 등록할 수 없어요', {
      empty: true, disabled: true, disabledHint: '준비 중인 기능입니다',
    }));

    // 소개 — 백엔드 미지원
    rows.appendChild(buildRow('소개', '등록된 소개가 없어요', {
      empty: true, disabled: true, disabledHint: '준비 중인 기능입니다',
    }));

    // 웹사이트 — 백엔드 미지원
    rows.appendChild(buildRow('웹사이트', '등록된 웹사이트가 없어요', {
      empty: true, disabled: true, disabledHint: '준비 중인 기능입니다',
    }));

    layout.appendChild(rows);

    // 안내 카드
    const aside = h('aside', { class: 'set-aside' });
    aside.appendChild(h('h2', { class: 'set-aside__title' }, '어떤 정보가 프로필에 공개되나요?'));
    aside.appendChild(h('p', { class: 'set-aside__text' },
      '프로필 사진과 이름은 내가 개설하거나 후원한 프로젝트에 공개돼요. 이메일·연락처·배송지 등 민감한 정보는 공개되지 않습니다.'));
    layout.appendChild(aside);

    pane.appendChild(layout);
  }

  /** 인라인 편집기 열기 — 행의 값/버튼을 입력 폼으로 교체, 저장 시 PATCH /me */
  function openInlineEdit(row, valWrap, btn, cfg) {
    if (row.querySelector('.set-edit')) return;
    btn.style.display = 'none';
    valWrap.style.display = 'none';

    const wrap = h('div', { class: 'set-edit' });
    const input = h('input', { class: 'dt-input', type: cfg.type || 'text', placeholder: cfg.placeholder || '' });
    input.value = cfg.value || '';
    const msg = h('p', { class: 'set-msg' });
    const saveBtn = h('button', { type: 'button', class: 'dt-btn dt-btn--dark', style: 'height:42px;' }, '저장');
    const cancelBtn = h('button', { type: 'button', class: 'dt-btn dt-btn--ghost', style: 'height:42px;' }, '취소');
    const rowEl = h('div', { class: 'set-edit__row' }, input);
    const btns = h('div', { class: 'set-edit__btns' }, saveBtn, cancelBtn);
    wrap.append(rowEl, btns, msg);
    row.querySelector('.set-row__value').after(wrap);

    function cleanup() { wrap.remove(); valWrap.style.display = ''; btn.style.display = ''; }
    cancelBtn.addEventListener('click', cleanup);
    saveBtn.addEventListener('click', async () => {
      const v = input.value.trim();
      if (cfg.required && !v) { msg.className = 'set-msg set-msg--err'; msg.textContent = '값을 입력해 주세요.'; return; }
      saveBtn.disabled = true; saveBtn.textContent = '저장 중…';
      try {
        const body = {}; body[cfg.field] = v;
        const res = await window.api.patch('/me', body);
        me = Object.assign(me || {}, res);
        cleanup();
        renderProfile();
        renderAccount();
      } catch (err) {
        msg.className = 'set-msg set-msg--err';
        msg.textContent = (err && err.message) || '저장에 실패했습니다.';
        saveBtn.disabled = false; saveBtn.textContent = '저장';
      }
    });
    input.focus();
  }

  /** 프로필 사진 선택 → PATCH /me { picture } (기존 로직 보존) */
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

  /* ===== 계정 탭 ===== */
  function renderAccount() {
    const pane = document.getElementById('setAccount');
    pane.replaceChildren();
    const wrap = h('div', { class: 'set-single' });

    // 이메일 (학교 도메인 = 인증된 메일로 간주, 그 외엔 미인증 빨강 표기)
    const email = (me && me.email) || '';
    const verified = !!email && /@kookmin\.ac\.kr$/i.test(email);
    const emailBlock = h('div', { class: 'set-block' });
    const emailTop = h('div', { class: 'set-block__top' });
    const emailLeft = h('div', {});
    emailLeft.appendChild(h('div', { class: 'set-block__label' }, '이메일'));
    emailLeft.appendChild(h('div', { class: 'set-block__value' }, email || '-'));
    if (email && !verified) {
      emailLeft.appendChild(h('div', { class: 'set-block__value is-danger', style: 'margin-top:2px;' }, '미인증 이메일'));
    }
    emailTop.appendChild(emailLeft);
    emailBlock.appendChild(emailTop);
    wrap.appendChild(emailBlock);

    // 비밀번호 (소셜 로그인 — 별도 비밀번호 없음)
    const pwBlock = h('div', { class: 'set-block' });
    const pwTop = h('div', { class: 'set-block__top' });
    const pwLeft = h('div', {});
    pwLeft.appendChild(h('div', { class: 'set-block__label' }, '비밀번호'));
    pwLeft.appendChild(h('div', { class: 'set-block__value' }, '소셜 로그인 사용 중'));
    pwLeft.appendChild(h('div', { class: 'set-block__sub' }, '구글 계정으로 로그인하므로 별도 비밀번호가 없습니다.'));
    pwTop.appendChild(pwLeft);
    pwBlock.appendChild(pwTop);
    wrap.appendChild(pwBlock);

    // 연락처 (PATCH 가능)
    const phone = (me && me.phone) || '';
    const phoneBlock = h('div', { class: 'set-block' });
    const phoneTop = h('div', { class: 'set-block__top' });
    const phoneLeft = h('div', {});
    phoneLeft.appendChild(h('div', { class: 'set-block__label' }, '연락처'));
    const phoneVal = h('div', { class: 'set-block__value' + (phone ? '' : '') }, phone || '등록된 연락처가 없어요');
    if (!phone) phoneVal.style.color = 'var(--c-text-faint)';
    phoneLeft.appendChild(phoneVal);
    phoneTop.appendChild(phoneLeft);
    const phoneBtn = h('button', { type: 'button', class: 'set-pill' }, '변경');
    phoneBtn.addEventListener('click', () => openAccountPhoneEdit(phoneBlock, phone));
    phoneTop.appendChild(phoneBtn);
    phoneBlock.appendChild(phoneTop);
    wrap.appendChild(phoneBlock);

    // 소셜 계정 연동 (구글 연동중)
    const socialBlock = h('div', { class: 'set-block' });
    const socialTop = h('div', { class: 'set-block__top' });
    const socialLeft = h('div', {});
    socialLeft.appendChild(h('div', { class: 'set-block__label' }, '소셜 계정 연동'));
    const socialVal = h('div', { class: 'set-block__value' });
    socialVal.appendChild(document.createTextNode('Google '));
    socialVal.appendChild(h('span', { class: 'dt-badge dt-badge--success' }, '연동중'));
    socialLeft.appendChild(socialVal);
    socialTop.appendChild(socialLeft);
    socialBlock.appendChild(socialTop);
    wrap.appendChild(socialBlock);

    // 로그아웃
    const logoutBtn = h('button', { type: 'button', class: 'dt-btn dt-btn--outline dt-btn--block', style: 'margin:8px 0 4px;' }, '로그아웃');
    logoutBtn.addEventListener('click', () => {
      if (typeof window.handleLogout === 'function') window.handleLogout();
      else { fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => { location.href = '/main.html'; }); }
    });
    wrap.appendChild(logoutBtn);

    // 회원 탈퇴
    const dz = h('div', { class: 'set-danger-zone' });
    dz.appendChild(h('h3', { class: 'set-danger-zone__title' }, '회원 탈퇴'));
    dz.appendChild(h('p', { class: 'set-danger-zone__text' },
      '탈퇴 시 계정·배송지·후원 내역이 삭제되며 되돌릴 수 없습니다. 진행 중인 펀드·주문이 있으면 탈퇴가 제한됩니다.'));
    const delBtn = h('button', { type: 'button', class: 'dt-btn dt-btn--danger' }, '회원 탈퇴');
    delBtn.addEventListener('click', onDeleteAccount);
    dz.appendChild(delBtn);
    wrap.appendChild(dz);

    pane.appendChild(wrap);
  }

  /** 연락처 인라인 편집 — PATCH /me { phone } */
  function openAccountPhoneEdit(block, current) {
    if (block.querySelector('.set-edit')) return;
    const top = block.querySelector('.set-block__top');
    top.style.display = 'none';

    const wrap = h('div', { class: 'set-edit' });
    const input = h('input', { class: 'dt-input', type: 'tel', placeholder: '휴대폰 번호 (예: 010-1234-5678)' });
    input.value = current || '';
    const msg = h('p', { class: 'set-msg' });
    const saveBtn = h('button', { type: 'button', class: 'dt-btn dt-btn--dark', style: 'height:42px;' }, '저장');
    const cancelBtn = h('button', { type: 'button', class: 'dt-btn dt-btn--ghost', style: 'height:42px;' }, '취소');
    wrap.append(h('div', { class: 'set-edit__row' }, input), h('div', { class: 'set-edit__btns' }, saveBtn, cancelBtn), msg);
    block.appendChild(wrap);

    function cleanup() { wrap.remove(); top.style.display = ''; }
    cancelBtn.addEventListener('click', cleanup);
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true; saveBtn.textContent = '저장 중…';
      try {
        const res = await window.api.patch('/me', { phone: input.value.trim() });
        me = Object.assign(me || {}, res);
        cleanup();
        renderAccount();
      } catch (err) {
        msg.className = 'set-msg set-msg--err';
        msg.textContent = (err && err.message) || '저장에 실패했습니다.';
        saveBtn.disabled = false; saveBtn.textContent = '저장';
      }
    });
    input.focus();
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

  /* ===== 결제수단 탭 ===== */
  async function renderPayment() {
    const pane = document.getElementById('setPayment');
    pane.replaceChildren();
    const wrap = h('div', { class: 'set-single' });
    pane.appendChild(wrap);

    // 무통장입금 안내(현행 결제 방식)
    const info = h('div', { class: 'set-block' });
    info.appendChild(h('div', { class: 'set-block__value' }, '무통장입금(계좌이체)'));
    info.appendChild(h('p', { class: 'set-block__sub' },
      '현재 후원은 무통장입금으로 진행됩니다. 후원 시 안내되는 계좌로 입금 후 입금자명을 제출하면 관리자 확인 후 후원이 확정됩니다.'));
    wrap.appendChild(info);

    // 등록된 카드/계좌 목록 (없으면 빈상태)
    const listHead = h('div', { class: 'set-list-head' });
    listHead.appendChild(h('h2', { class: 'set-block__value', style: 'margin:0;' }, '등록된 결제수단'));
    wrap.appendChild(listHead);

    const listBox = h('div', {});
    wrap.appendChild(listBox);

    let methods = [];
    try {
      const r = await window.api.get('/payment-methods', { silentAuthFail: true });
      methods = Array.isArray(r) ? r : (r && r.items) || [];
    } catch (_) { methods = []; }

    if (!methods.length) {
      const empty = h('div', { class: 'set-empty' });
      const img = h('img', { alt: '' });
      img.src = '/assets/empty-backings.png';
      img.addEventListener('error', () => img.remove());
      empty.appendChild(img);
      empty.appendChild(h('p', { class: 'set-empty__text' }, '등록된 카드·계좌가 없어요. 카드 결제는 준비 중입니다.'));
      listBox.appendChild(empty);
      return;
    }

    methods.forEach((m) => {
      const card = h('div', { class: 'set-block' });
      const top = h('div', { class: 'set-block__top' });
      const left = h('div', {});
      const name = (m.cardName || channelLabel(m.channelType) || '결제수단')
        + (m.cardLastFour ? ' ****' + m.cardLastFour : '');
      const nameVal = h('div', { class: 'set-block__value' }, name);
      if (m.isDefault) nameVal.appendChild(h('span', { class: 'dt-badge dt-badge--open', style: 'margin-left:8px;' }, '기본'));
      left.appendChild(nameVal);
      top.appendChild(left);
      card.appendChild(top);
      listBox.appendChild(card);
    });
  }

  function channelLabel(t) {
    return ({ TOSSPAY: '토스페이', KAKAOPAY: '카카오페이', NAVERPAY: '네이버페이', CARD_DIRECT: '카드' })[t] || '';
  }

  /* ===== 배송지 탭 ===== */
  function renderAddress() {
    const pane = document.getElementById('setAddress');
    pane.replaceChildren();
    const wrap = h('div', { class: 'set-single' });

    const head = h('div', { class: 'set-list-head' });
    head.appendChild(h('span', { class: 'set-list-head__count', id: 'addrCount' }, ''));
    const addBtn = h('button', { type: 'button', class: 'dt-btn dt-btn--outline', style: 'height:40px;' }, '배송지 추가');
    addBtn.addEventListener('click', () => openAddrModal());
    head.appendChild(addBtn);
    wrap.appendChild(head);

    const list = h('div', { id: 'addrList' });
    wrap.appendChild(list);
    pane.appendChild(wrap);

    loadAddresses();
  }

  async function loadAddresses() {
    const list = document.getElementById('addrList');
    const count = document.getElementById('addrCount');
    if (!list) return;
    list.replaceChildren();

    let items = [];
    try {
      const r = await window.api.get('/addresses');
      items = Array.isArray(r) ? r : (r && r.items) || [];
    } catch (err) {
      if (err && err.status === 401) return;
      const e = h('div', { class: 'set-empty' });
      e.appendChild(h('p', { class: 'set-empty__text' }, '배송지를 불러오지 못했어요.'));
      list.appendChild(e);
      return;
    }

    if (count) count.textContent = '총 ' + items.length + '개';

    if (!items.length) {
      const empty = h('div', { class: 'set-empty' });
      const img = h('img', { alt: '' });
      img.src = '/assets/empty-backings.png';
      img.addEventListener('error', () => img.remove());
      empty.appendChild(img);
      empty.appendChild(h('p', { class: 'set-empty__text' }, '등록된 배송지가 없어요. 후원하려면 배송지를 추가해 주세요.'));
      const cta = h('button', { type: 'button', class: 'dt-btn dt-btn--dark' }, '배송지 추가');
      cta.addEventListener('click', () => openAddrModal());
      empty.appendChild(cta);
      list.appendChild(empty);
      return;
    }

    items.forEach((a) => list.appendChild(renderAddrCard(a)));
  }

  function renderAddrCard(a) {
    const card = h('div', { class: 'set-addr' + (a.isDefault ? ' is-default' : '') });
    const head = h('div', { class: 'set-addr__head' });
    head.appendChild(h('span', { class: 'set-addr__label' }, a.label || '배송지'));
    if (a.isDefault) head.appendChild(h('span', { class: 'dt-badge dt-badge--open' }, '기본 배송지'));
    card.appendChild(head);

    card.appendChild(h('div', { class: 'set-addr__line' },
      (a.recipientName || '') + (a.recipientPhone ? ' · ' + a.recipientPhone : '')));
    const addrLine = '(' + (a.postalCode || '') + ') ' + (a.roadAddress || '')
      + (a.detailAddress ? ' ' + a.detailAddress : '');
    card.appendChild(h('div', { class: 'set-addr__line' }, addrLine));

    const actions = h('div', { class: 'set-addr__actions' });
    if (!a.isDefault) {
      const setDef = h('button', { type: 'button', class: 'set-link-btn' }, '기본으로 설정');
      setDef.addEventListener('click', () => setDefaultAddr(a.id));
      actions.appendChild(setDef);
    }
    const del = h('button', { type: 'button', class: 'set-link-btn set-link-btn--danger' }, '삭제');
    del.addEventListener('click', () => deleteAddr(a.id, a.label));
    actions.appendChild(del);
    card.appendChild(actions);
    return card;
  }

  async function setDefaultAddr(id) {
    try { await window.api.patch('/addresses/' + encodeURIComponent(id) + '/default'); await loadAddresses(); }
    catch (err) { alert((err && err.message) || '기본 배송지 변경에 실패했습니다.'); }
  }
  async function deleteAddr(id, label) {
    if (!confirm('「' + (label || '배송지') + '」 배송지를 삭제할까요?')) return;
    try { await window.api.del('/addresses/' + encodeURIComponent(id)); await loadAddresses(); }
    catch (err) { alert((err && err.message) || '삭제에 실패했습니다.'); }
  }

  /* ===== 배송지 추가 모달 ===== */
  let _addrModal = null;
  function openAddrModal() {
    if (!_addrModal) _addrModal = buildAddrModal();
    const form = _addrModal.querySelector('form');
    form.reset();
    _addrModal.querySelector('.set-modal__msg').textContent = '';
    _addrModal.classList.add('is-open');
    const first = form.querySelector('input[name="recipientName"]');
    if (first) first.focus();
  }
  function closeAddrModal() { if (_addrModal) _addrModal.classList.remove('is-open'); }

  function buildAddrModal() {
    const modal = h('div', { class: 'set-modal' });
    const box = h('div', { class: 'set-modal__box' });

    const head = h('div', { class: 'set-modal__head' });
    head.appendChild(h('h3', { class: 'set-modal__title' }, '배송지 추가'));
    const closeBtn = h('button', { type: 'button', class: 'set-modal__close', 'aria-label': '닫기' }, '×');
    closeBtn.addEventListener('click', closeAddrModal);
    head.appendChild(closeBtn);
    box.appendChild(head);

    const form = h('form', { class: 'set-modal__form' });

    function field(labelText, name, type, placeholder) {
      const f = h('div', { class: 'set-modal__field' });
      f.appendChild(h('label', { class: 'dt-field-label' }, labelText));
      const input = h('input', { class: 'dt-input', type: type || 'text', name: name, placeholder: placeholder || '' });
      f.appendChild(input);
      return f;
    }

    form.appendChild(field('배송지 이름', 'label', 'text', '예: 우리집, 학교'));
    form.appendChild(field('받는 사람', 'recipientName', 'text', '받는 분 성함'));
    form.appendChild(field('휴대폰', 'recipientPhone', 'tel', '010-1234-5678'));
    form.appendChild(field('우편번호', 'postalCode', 'text', '예: 02707'));
    form.appendChild(field('주소', 'roadAddress', 'text', '도로명 주소'));
    form.appendChild(field('상세 주소', 'detailAddress', 'text', '동·호수 등 (선택)'));

    const defField = h('label', { class: 'set-modal__check' });
    const defInput = h('input', { type: 'checkbox', name: 'isDefault' });
    defField.appendChild(defInput);
    defField.appendChild(h('span', {}, '기본 배송지로 설정'));
    form.appendChild(defField);

    const agreeField = h('label', { class: 'set-modal__check' });
    const agreeInput = h('input', { type: 'checkbox', name: 'agree' });
    agreeField.appendChild(agreeInput);
    agreeField.appendChild(h('span', { class: 'set-modal__agree' },
      '배송을 위해 입력한 개인정보(이름·연락처·주소)의 수집·이용에 동의합니다.'));
    form.appendChild(agreeField);

    const msg = h('p', { class: 'set-modal__msg' });
    form.appendChild(msg);

    const submit = h('button', { type: 'submit', class: 'dt-btn dt-btn--dark dt-btn--block' }, '등록 완료');
    form.appendChild(submit);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.className = 'set-modal__msg';
      const payload = {
        label: form.label.value.trim(),
        recipientName: form.recipientName.value.trim(),
        recipientPhone: form.recipientPhone.value.trim(),
        postalCode: form.postalCode.value.trim(),
        roadAddress: form.roadAddress.value.trim(),
        detailAddress: form.detailAddress.value.trim() || null,
      };
      if (!payload.label || !payload.recipientName || !payload.recipientPhone || !payload.postalCode || !payload.roadAddress) {
        msg.classList.add('set-msg--err'); msg.textContent = '필수 항목(배송지 이름·받는 사람·휴대폰·우편번호·주소)을 모두 입력해 주세요.';
        return;
      }
      if (!agreeInput.checked) {
        msg.classList.add('set-msg--err'); msg.textContent = '개인정보 수집·이용에 동의해 주세요.';
        return;
      }
      submit.disabled = true; submit.textContent = '등록 중…';
      try {
        const created = await window.api.post('/addresses', payload);
        if (defInput.checked && created && created.id) {
          try { await window.api.patch('/addresses/' + encodeURIComponent(created.id) + '/default'); } catch (_) { /* 비치명적 */ }
        }
        closeAddrModal();
        await loadAddresses();
      } catch (err) {
        msg.classList.add('set-msg--err'); msg.textContent = (err && err.message) || '등록에 실패했습니다.';
      } finally {
        submit.disabled = false; submit.textContent = '등록 완료';
      }
    });

    box.appendChild(form);
    modal.appendChild(box);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeAddrModal(); });
    document.body.appendChild(modal);
    return modal;
  }

  /* ===== 알림 탭 ===== */
  const NOTI_ITEMS = [
    { key: 'pushEnabled', title: '푸시 알림', desc: '달성·결제·배송 알림 받기', defaultOn: true },
    { key: 'notiFunding', title: '펀딩 소식', desc: '내가 후원한 프로젝트의 달성·업데이트 알림', defaultOn: true },
    { key: 'notiOrder', title: '결제·배송 알림', desc: '입금 확인·제작·발송 단계 알림', defaultOn: true },
    { key: 'notiMarketing', title: '마케팅·혜택 알림', desc: '이벤트·추천 프로젝트 등 마케팅 정보 수신', defaultOn: false },
  ];

  function renderNoti() {
    const pane = document.getElementById('setNoti');
    pane.replaceChildren();
    const wrap = h('div', { class: 'set-single' });

    NOTI_ITEMS.forEach((item) => {
      const block = h('div', { class: 'set-block' });
      const rowEl = h('div', { class: 'set-toggle-row' });
      const left = h('div', {});
      left.appendChild(h('div', { class: 'set-block__value' }, item.title));
      left.appendChild(h('div', { class: 'set-block__sub' }, item.desc));
      rowEl.appendChild(left);

      const stored = localStorage.getItem(item.key);
      const on = stored == null ? item.defaultOn : (stored !== '0');
      const toggle = h('button', { type: 'button', class: 'set-toggle', 'aria-pressed': String(on), 'aria-label': item.title });
      toggle.appendChild(h('span', { class: 'set-toggle__knob' }));
      toggle.addEventListener('click', () => {
        const cur = toggle.getAttribute('aria-pressed') === 'true';
        const next = !cur;
        localStorage.setItem(item.key, next ? '1' : '0');
        toggle.setAttribute('aria-pressed', String(next));
      });
      rowEl.appendChild(toggle);
      block.appendChild(rowEl);
      wrap.appendChild(block);
    });

    pane.appendChild(wrap);
  }
})();
