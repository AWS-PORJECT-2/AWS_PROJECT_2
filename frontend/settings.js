/**
 * 설정 (와디즈 설정 — 세로 리스트형, 부록2 §설정).
 *
 * 레이아웃(와디즈 그대로):
 *   카드 중앙 아바타(연필 편집 배지) + 행 리스트
 *     닉네임 / 이메일 / 국가·지역
 *     [구분]
 *     비밀번호 설정 / 알림 설정 / 전화번호 설정 / 생일 정보 / 친구 관리
 *     [구분]
 *     SNS 계정 연동
 *   각 행 = 라벨(작은 회색) + 값(굵게) + 우측 ">" / 인라인 편집 / 토글.
 *
 * API 로직은 기존을 보존하고 UI만 와디즈 리스트형으로 재배치한다.
 *  - 닉네임/전화번호 수정: PATCH /api/me  (nickname / phone)
 *  - 프로필 사진 변경: PATCH /api/me  (picture)
 *  - 알림 설정: 행 클릭 → 토글 시트(localStorage push/펀딩/배송/마케팅)
 *  - 로그아웃: window.handleLogout (main.js)
 *  - 회원 탈퇴: DELETE /api/me
 *  - 백엔드 없는 항목(국가·지역/비밀번호/생일/친구 관리/SNS) = 행은 그리되 클릭 시 "준비 중".
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

  /* ---------- 인라인 SVG 아이콘(stroke=currentColor, 이모지 금지) ---------- */
  const ICON = {
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try { me = await window.api.get('/auth/me'); }
    catch (e) { return; } // 401 → api 래퍼가 로그인으로 보냄
    renderCard();
    renderAccount();
  }

  /* ===== 중앙 아바타(연필 편집 배지) ===== */
  function renderAvatar() {
    const wrap = h('div', { class: 'set-avwrap' });
    const avatar = h('div', { class: 'set-avatar' });
    const pic = (me && me.picture) || '';
    if (pic) {
      const img = h('img', { alt: '프로필 사진' });
      img.src = pic;
      img.addEventListener('error', () => {
        img.remove();
        avatar.appendChild(avatarInitial());
      });
      avatar.appendChild(img);
    } else {
      avatar.appendChild(avatarInitial());
    }

    // 연필 편집 배지 — 클릭 시 파일 선택 → PATCH /me { picture }
    const editBadge = h('button', { type: 'button', class: 'set-avatar__edit', 'aria-label': '프로필 사진 변경' });
    editBadge.innerHTML = ICON.pencil;
    const picInput = h('input', { type: 'file', accept: 'image/*', hidden: 'hidden' });
    editBadge.addEventListener('click', () => picInput.click());
    picInput.addEventListener('change', onPicSelected);

    avatar.appendChild(editBadge);
    wrap.append(avatar, picInput);

    const name = (me && (me.nickname || me.name)) || '회원';
    wrap.appendChild(h('p', { class: 'set-avwrap__name' }, name));
    if (me && me.email) wrap.appendChild(h('p', { class: 'set-avwrap__email' }, me.email));
    return wrap;
  }

  function avatarInitial() {
    const initial = (((me && (me.nickname || me.name)) || 'U') + '').slice(0, 1);
    return h('span', { class: 'set-avatar__initial' }, initial);
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
        renderCard();
      } catch (err) { alert('사진 변경 실패: ' + ((err && err.message) || '')); }
    };
    reader.readAsDataURL(f);
  }

  /* ===== 행 빌더 — 라벨(작은 회색) + 값(굵게) + 우측 ">"/토글/인라인 ===== */
  /**
   * @param {string} label  좌측 라벨(작은 회색)
   * @param {string} value  값(굵게). 빈값이면 opts.empty 권장.
   * @param {object} opts
   *   - empty:boolean      값 없음(회색 톤 + 안내 문구)
   *   - chevron:boolean    우측 ">" 표시(클릭형 행)
   *   - disabled:boolean   준비 중(흐림 + 클릭 시 토스트)
   *   - rightNode:Node     우측 커스텀 노드(토글/배지 등). chevron 대체.
   *   - onClick:fn(row)    행 클릭 핸들러
   */
  function buildRow(label, value, opts) {
    opts = opts || {};
    const clickable = !!(opts.onClick || opts.chevron) && !opts.disabled;
    const row = h('div', {
      class: 'set-row'
        + (clickable ? ' is-clickable' : '')
        + (opts.disabled ? ' is-disabled' : ''),
    });

    const text = h('div', { class: 'set-row__text' });
    text.appendChild(h('span', { class: 'set-row__label' }, label));
    const valEl = h('span', { class: 'set-row__value' + (opts.empty ? ' is-empty' : '') });
    valEl.textContent = value;
    text.appendChild(valEl);
    row.appendChild(text);

    const right = h('div', { class: 'set-row__right' });
    if (opts.rightNode) {
      right.appendChild(opts.rightNode);
    } else if (opts.disabled) {
      right.appendChild(h('span', { class: 'set-row__soon' }, '준비 중'));
    } else if (opts.chevron) {
      const chev = h('span', { class: 'set-row__chevron', 'aria-hidden': 'true' });
      chev.innerHTML = ICON.chevron;
      right.appendChild(chev);
    }
    row.appendChild(right);

    if (opts.disabled) {
      row.addEventListener('click', () => toast('준비 중인 기능입니다.'));
    } else if (typeof opts.onClick === 'function') {
      row.addEventListener('click', (e) => {
        // 인라인 편집/토글이 이미 열려있으면 행 자체 클릭 무시
        if (e.target.closest('.set-edit') || e.target.closest('.set-row__right .set-toggle')) return;
        opts.onClick(row, valEl);
      });
    }
    return row;
  }

  function group(...rows) {
    return h('div', { class: 'set-group' }, ...rows.filter(Boolean));
  }

  /* ===== 메인 카드(아바타 + 세로 리스트) ===== */
  function renderCard() {
    const card = document.getElementById('setCard');
    if (!card) return;
    card.replaceChildren();

    card.appendChild(renderAvatar());

    const nickname = (me && me.nickname) || (me && me.name) || '';
    const email = (me && me.email) || '';
    const phone = (me && me.phone) || '';

    // ── 그룹1: 닉네임 / 이메일 / 국가·지역 ─────────────────────────
    const g1 = group(
      // 닉네임 — PATCH /me { nickname } (인라인 편집)
      buildRow('닉네임', nickname || '등록된 닉네임이 없어요', {
        empty: !nickname,
        chevron: true,
        onClick: (row, valEl) => openInlineEdit(row, valEl, {
          value: nickname, placeholder: '닉네임', field: 'nickname', required: true, type: 'text',
        }),
      }),
      // 이메일 — 변경 불가(로그인 계정), 인증 배지
      (function emailRow() {
        const verified = !!email && /@kookmin\.ac\.kr$/i.test(email);
        const badge = h('span', { class: 'dt-badge ' + (verified ? 'dt-badge--success' : 'dt-badge--danger') },
          verified ? '인증됨' : '미인증');
        return buildRow('이메일', email || '-', { rightNode: badge });
      })(),
      // 국가·지역 — 백엔드 미지원. 행은 그리되 클릭 시 준비 중.
      buildRow('국가·지역', '대한민국', { disabled: true })
    );
    card.appendChild(g1);

    // ── 구분선 ───────────────────────────────────────────────────
    card.appendChild(h('div', { class: 'set-divider' }));

    // ── 그룹2: 비밀번호 / 알림 / 전화번호 / 생일 / 친구 관리 ──────────
    const g2 = group(
      // 비밀번호 설정 — 소셜 로그인(별도 비밀번호 없음). 준비 중.
      buildRow('비밀번호 설정', '구글 로그인 사용 중', { disabled: true }),
      // 알림 설정 — 토글 시트(localStorage)
      buildRow('알림 설정', notiSummary(), {
        chevron: true,
        onClick: (row) => openNotiSheet(row),
      }),
      // 전화번호 설정 — PATCH /me { phone } (인라인 편집)
      buildRow('전화번호 설정', phone || '등록된 전화번호가 없어요', {
        empty: !phone,
        chevron: true,
        onClick: (row, valEl) => openInlineEdit(row, valEl, {
          value: phone, placeholder: '휴대폰 번호 (예: 010-1234-5678)', field: 'phone', required: false, type: 'tel',
        }),
      }),
      // 생일 정보 — 백엔드 미지원. 준비 중.
      buildRow('생일 정보', '등록된 생일 정보가 없어요', { empty: true, disabled: true }),
      // 친구 관리 — 백엔드 미지원. 준비 중.
      buildRow('친구 관리', '준비 중인 기능이에요', { empty: true, disabled: true })
    );
    card.appendChild(g2);

    // ── 구분선 ───────────────────────────────────────────────────
    card.appendChild(h('div', { class: 'set-divider' }));

    // ── 그룹3: SNS 계정 연동 ─────────────────────────────────────
    const googleBadge = h('span', { class: 'dt-badge dt-badge--open' }, '연동중');
    const g3 = group(
      buildRow('SNS 계정 연동', 'Google 계정', { rightNode: googleBadge })
    );
    card.appendChild(g3);
  }

  /* ===== 인라인 편집 — 행 펼쳐서 입력 폼, 저장 시 PATCH /me ===== */
  function openInlineEdit(row, valEl, cfg) {
    if (row.querySelector('.set-edit')) return;
    row.classList.add('is-editing');

    const wrap = h('div', { class: 'set-edit' });
    const input = h('input', { class: 'dt-input', type: cfg.type || 'text', placeholder: cfg.placeholder || '' });
    input.value = cfg.value || '';
    const msg = h('p', { class: 'set-msg' });
    const saveBtn = h('button', { type: 'button', class: 'dt-btn dt-btn--dark', style: 'height:42px;' }, '저장');
    const cancelBtn = h('button', { type: 'button', class: 'dt-btn dt-btn--ghost', style: 'height:42px;' }, '취소');
    const inputRow = h('div', { class: 'set-edit__row' }, input);
    const btns = h('div', { class: 'set-edit__btns' }, saveBtn, cancelBtn);
    wrap.append(inputRow, btns, msg);
    row.appendChild(wrap);

    function cleanup() { wrap.remove(); row.classList.remove('is-editing'); }
    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); cleanup(); });
    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const v = input.value.trim();
      if (cfg.required && !v) { msg.className = 'set-msg set-msg--err'; msg.textContent = '값을 입력해 주세요.'; return; }
      saveBtn.disabled = true; saveBtn.textContent = '저장 중…';
      try {
        const body = {}; body[cfg.field] = v;
        const res = await window.api.patch('/me', body);
        me = Object.assign(me || {}, res);
        cleanup();
        renderCard();
      } catch (err) {
        msg.className = 'set-msg set-msg--err';
        msg.textContent = (err && err.message) || '저장에 실패했습니다.';
        saveBtn.disabled = false; saveBtn.textContent = '저장';
      }
    });
    input.focus();
  }

  /* ===== 알림 설정 — 토글 시트(localStorage) ===== */
  const NOTI_ITEMS = [
    { key: 'pushEnabled', title: '푸시 알림', desc: '달성·결제·배송 알림 받기', defaultOn: true },
    { key: 'notiFunding', title: '펀딩 소식', desc: '내가 후원한 프로젝트의 달성·업데이트 알림', defaultOn: true },
    { key: 'notiOrder', title: '결제·배송 알림', desc: '입금 확인·제작·발송 단계 알림', defaultOn: true },
    { key: 'notiMarketing', title: '마케팅·혜택 알림', desc: '이벤트·추천 프로젝트 등 마케팅 정보 수신', defaultOn: false },
  ];

  function notiOn(item) {
    const stored = localStorage.getItem(item.key);
    return stored == null ? item.defaultOn : (stored !== '0');
  }

  /** 알림 행 우측 요약("3개 켜짐") */
  function notiSummary() {
    const on = NOTI_ITEMS.filter(notiOn).length;
    return on + '개 켜짐';
  }

  /** 알림 설정 시트 — 행 아래로 펼쳐지는 토글 목록 */
  function openNotiSheet(row) {
    const existing = row.querySelector('.set-noti');
    if (existing) { existing.remove(); row.classList.remove('is-editing'); return; }
    row.classList.add('is-editing');

    const sheet = h('div', { class: 'set-noti' });
    NOTI_ITEMS.forEach((item) => {
      const line = h('div', { class: 'set-noti__row' });
      const left = h('div', { class: 'set-noti__text' });
      left.appendChild(h('span', { class: 'set-noti__title' }, item.title));
      left.appendChild(h('span', { class: 'set-noti__desc' }, item.desc));
      line.appendChild(left);

      const on = notiOn(item);
      const toggle = h('button', { type: 'button', class: 'set-toggle', 'aria-pressed': String(on), 'aria-label': item.title });
      toggle.appendChild(h('span', { class: 'set-toggle__knob' }));
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const cur = toggle.getAttribute('aria-pressed') === 'true';
        const next = !cur;
        localStorage.setItem(item.key, next ? '1' : '0');
        toggle.setAttribute('aria-pressed', String(next));
        // 행 우측 요약 갱신
        const valEl = row.querySelector('.set-row__value');
        if (valEl) valEl.textContent = notiSummary();
      });
      line.appendChild(toggle);
      sheet.appendChild(line);
    });
    row.appendChild(sheet);
  }

  /* ===== 하단 계정 액션 — 로그아웃 / 회원 탈퇴 (기존 API 보존) ===== */
  function renderAccount() {
    const pane = document.getElementById('setAccount');
    if (!pane) return;
    pane.replaceChildren();

    // 로그아웃
    const logoutBtn = h('button', { type: 'button', class: 'set-account__logout' });
    const lic = h('span', { class: 'set-account__logout-ic', 'aria-hidden': 'true' });
    lic.innerHTML = ICON.logout;
    logoutBtn.append(lic, h('span', {}, '로그아웃'));
    logoutBtn.addEventListener('click', () => {
      if (typeof window.handleLogout === 'function') window.handleLogout();
      else { fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => { location.href = '/main.html'; }); }
    });
    pane.appendChild(logoutBtn);

    // 회원 탈퇴
    const delBtn = h('button', { type: 'button', class: 'set-account__withdraw' }, '회원 탈퇴');
    delBtn.addEventListener('click', onDeleteAccount);
    pane.appendChild(delBtn);
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

  /* ===== 간단 토스트(준비 중 안내) ===== */
  let _toastTimer = null;
  function toast(text) {
    let t = document.querySelector('.set-toast');
    if (!t) { t = h('div', { class: 'set-toast' }); document.body.appendChild(t); }
    t.textContent = text;
    t.classList.add('is-show');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove('is-show'), 1800);
  }
})();
