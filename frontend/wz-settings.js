/* =====================================================================
 * 두띵 — 설정 페이지 (텀블벅형 5탭: 프로필 · 계정 · 결제수단 · 배송지 · 알림).
 * 전역 WZ(wz-core.js) · window.api 사용. 데이터: GET /api/auth/me.
 *   프로필 수정 PATCH /api/me · 알림 PATCH /api/me/notifications · 탈퇴 DELETE /api/me
 *   결제수단 /api/payment-methods · 배송지 /api/addresses
 * 색은 tokens.css 변수만 사용(보라). 이모지 금지 — 아이콘은 인라인 SVG(stroke=currentColor).
 * 사용자/외부 데이터는 WZ.el 의 문자열 자식(textContent) 또는 textContent 로만 삽입(XSS 방지).
 * 한국 전용 — 국가/지역 항목 없음.
 * ===================================================================== */
(function () {
  'use strict';
  var WZ = window.WZ;
  var el = WZ.el;
  var api = window.api;
  var root = document.getElementById('wz-settings');

  /* ===== 탭 정의 (텀블벅 순서) ===== */
  var TABS = [
    { key: 'profile', hash: '#profile', label: '내 정보' },
    { key: 'account', hash: '#account', label: '계정' },
    { key: 'payment', hash: '#payment', label: '결제수단' },
    { key: 'address', hash: '#address', label: '배송지' },
    { key: 'friends', hash: '#friends', label: '친구' },
    { key: 'notification', hash: '#notification', label: '알림' },
  ];

  /* ===== 알림 토글 항목 (백엔드 notificationPrefs 키와 1:1) ===== */
  var NOTIF_ITEMS = [
    { key: 'message', label: '메시지', desc: '메이커·서포터가 보낸 메시지 알림' },
    { key: 'projectUpdate', label: '프로젝트 업데이트', desc: '후원한 프로젝트의 새 소식·진행 알림' },
    { key: 'subscribedOpen', label: '알림신청 프로젝트', desc: '알림 신청한 프로젝트가 오픈되면 알려드려요' },
    { key: 'likedDeadline', label: '좋아한 프로젝트', desc: '좋아요한 프로젝트의 마감 임박 알림' },
    { key: 'follow', label: '팔로우', desc: '나를 팔로우하는 새 소식 알림' },
    { key: 'marketing', label: '마케팅 메일', desc: '두띵 추천 프로젝트·이벤트·혜택 소식' },
  ];

  /* ===== 은행 목록 (한국) ===== */
  var BANKS = ['국민은행', '신한은행', '우리은행', '하나은행', '농협은행', '기업은행', '카카오뱅크', '토스뱅크', '케이뱅크', 'SC제일은행', '대구은행', '부산은행', '광주은행', '전북은행', '경남은행', '제주은행', '수협은행', '새마을금고', '신협', '우체국'];

  /* ===== 인라인 SVG (stroke/fill=currentColor 기반) ===== */
  var SVG = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M4 10h16M5 10V8l7-4 7 4v2M6 10v11M10 10v11M14 10v11M18 10v11"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    google: '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.6-.05-1.2-.16-1.8H12v3.4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.1z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="#EA4335" d="M12 6.6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 8.3 9.4 6.6 12 6.6z"/></svg>',
  };

  /* ===== 상태 ===== */
  var state = { me: null, activeTab: 'profile', methods: null, addresses: null };

  /* =====================================================================
   * 유틸: 숫자만 + 자동 하이픈
   * ===================================================================== */
  function digitsOnly(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

  // 휴대폰: 010-XXXX-XXXX (그 외 길이별 하이픈 일반 번호도 처리)
  function formatPhone(raw) {
    var d = digitsOnly(raw).slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 7) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length < 11) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7, 11);
  }
  // 카드번호 4-4-4-4
  function formatCard(raw) {
    var d = digitsOnly(raw).slice(0, 16);
    return (d.match(/.{1,4}/g) || []).join('-');
  }
  // 입력 즉시 포맷 적용 (캐럿은 끝으로)
  function bindFormatter(input, fmt) {
    input.addEventListener('input', function () {
      var v = fmt(input.value);
      if (v !== input.value) input.value = v;
    });
  }

  /* =====================================================================
   * 토스트
   * ===================================================================== */
  var toastNode;
  function toast(msg) {
    if (!toastNode) { toastNode = el('div', { class: 'wzs-toast' }); document.body.appendChild(toastNode); }
    toastNode.textContent = msg;
    toastNode.classList.add('is-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastNode.classList.remove('is-show'); }, 2200);
  }

  /* =====================================================================
   * 모달 (제목 + 본문 노드 + 푸터 버튼)
   *   opts: { title, body(node), primaryLabel, onPrimary(returns false to keep open), wide }
   * 반환: { close(), back(elem), primaryBtn }
   * ===================================================================== */
  function openModal(opts) {
    var back = el('div', { class: 'wzs-modal-back' });
    var modal = el('div', { class: 'wzs-modal' + (opts.wide ? ' wzs-modal--wide' : '') });
    var head = el('div', { class: 'wzs-modal__head' },
      el('h2', { class: 'wzs-modal__title' }, opts.title || ''),
      (function () {
        var b = el('button', { class: 'wzs-modal__close', type: 'button', 'aria-label': '닫기', html: SVG.close });
        b.addEventListener('click', close);
        return b;
      })());
    var body = el('div', { class: 'wzs-modal__body' }, opts.body);
    modal.append(head, body);

    var primaryBtn = null;
    if (opts.primaryLabel) {
      var foot = el('div', { class: 'wzs-modal__foot' });
      var cancel = el('button', { class: 'wz-btn wz-btn--ghost', type: 'button' }, '취소');
      cancel.addEventListener('click', close);
      primaryBtn = el('button', { class: 'wz-btn wz-btn--primary', type: 'button' }, opts.primaryLabel);
      primaryBtn.addEventListener('click', function () {
        var r = opts.onPrimary ? opts.onPrimary() : true;
        if (r === false) return;
        if (r && typeof r.then === 'function') return; // async handler closes itself
        close();
      });
      foot.append(cancel, primaryBtn);
      modal.appendChild(foot);
    }

    back.appendChild(modal);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { back.classList.add('is-open'); });

    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    function close() {
      back.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      setTimeout(function () { back.remove(); }, 200);
    }
    return { close: close, back: back, primaryBtn: primaryBtn };
  }

  /* =====================================================================
   * 폼 필드 헬퍼
   * ===================================================================== */
  function field(opts) {
    // opts: { label, required, control(node), hint }
    var f = el('div', { class: 'wzs-fld' });
    if (opts.label) {
      var lab = el('label', { class: 'wzs-fld__label' }, opts.label);
      if (opts.required) lab.appendChild(el('span', { class: 'req' }, '*'));
      f.appendChild(lab);
    }
    f.appendChild(opts.control);
    var err = el('div', { class: 'wzs-fld__err' });
    f.appendChild(err);
    f._err = err;
    f.fail = function (msg) { err.textContent = msg; err.classList.add('is-show'); };
    f.clear = function () { err.textContent = ''; err.classList.remove('is-show'); };
    return f;
  }
  function input(attrs) { return el('input', Object.assign({ class: 'wzs-input', type: 'text', autocomplete: 'off' }, attrs || {})); }
  function select(options, attrs) {
    var s = el('select', Object.assign({ class: 'wzs-select' }, attrs || {}));
    (options || []).forEach(function (o) {
      var opt = el('option', { value: o.value }, o.label);
      s.appendChild(opt);
    });
    return s;
  }

  /* =====================================================================
   * 토글 위젯
   * ===================================================================== */
  function toggle(on, onChange) {
    var t = el('button', { class: 'wzs-toggle' + (on ? ' is-on' : ''), type: 'button', role: 'switch', 'aria-checked': String(!!on) },
      el('span', { class: 'wzs-toggle__track' }), el('span', { class: 'wzs-toggle__knob' }));
    t.addEventListener('click', function () {
      if (t.hasAttribute('disabled')) return;
      var next = !t.classList.contains('is-on');
      t.classList.toggle('is-on', next);
      t.setAttribute('aria-checked', String(next));
      onChange(next, t);
    });
    return t;
  }

  /* =====================================================================
   * 행 헬퍼 (라벨 + 값 + 우측 액션)
   * ===================================================================== */
  function settingRow(opts) {
    // opts: { label, labelBadge, value, valueMuted, actionNode }
    var r = el('div', { class: 'wzs-row' });
    var main = el('div', { class: 'wzs-row__main' });
    var label = el('div', { class: 'wzs-row__label' }, opts.label);
    if (opts.labelBadge) label.appendChild(opts.labelBadge);
    main.appendChild(label);
    if (opts.value != null) {
      var v = el('div', { class: 'wzs-row__value' + (opts.valueMuted ? ' wzs-row__value--muted' : '') });
      v.textContent = opts.value;
      main.appendChild(v);
    }
    r.appendChild(main);
    if (opts.actionNode) r.appendChild(el('div', { class: 'wzs-row__action' }, opts.actionNode));
    return r;
  }
  function miniBtn(label, onClick, cls) {
    var b = el('button', { class: 'wzs-mini' + (cls ? ' ' + cls : ''), type: 'button' }, label);
    b.addEventListener('click', onClick);
    return b;
  }

  /* =====================================================================
   * 개인정보 동의 — WZConsent.requirePrivacy() 우선, 없으면 모달 체크박스 fallback.
   *   returns Promise<boolean>
   * ===================================================================== */
  function requirePrivacy() {
    if (window.WZConsent && typeof window.WZConsent.requirePrivacy === 'function') {
      try {
        var r = window.WZConsent.requirePrivacy();
        return (r && typeof r.then === 'function') ? r : Promise.resolve(!!r);
      } catch (_) { /* fall through */ }
    }
    return Promise.resolve(null); // null = 인라인 체크박스로 처리(모달 내부)
  }

  /* =====================================================================
   * 프로필 갱신 공통 (PATCH /api/me) — 성공 시 state.me 갱신 + 헤더 토스트
   * ===================================================================== */
  function patchMe(patch) {
    return api.patch('/me', patch).then(function (updated) {
      if (updated) state.me = Object.assign({}, state.me, updated);
      else state.me = Object.assign({}, state.me, patch);
      return state.me;
    });
  }

  /* =====================================================================
   * 탭 1: 프로필
   * ===================================================================== */
  function renderProfile(panel) {
    var me = state.me;
    panel.appendChild(el('p', { class: 'wzs-sec__desc' }, '프로필 정보는 메이커·서포터 페이지에 표시됩니다.'));
    var list = el('div', { class: 'wzs-list' });

    /* 프로필 사진 */
    var avatar = el('div', { class: 'wzs-avatar' });
    if (me.picture) {
      var img = el('img', { src: me.picture, alt: '프로필 사진' });
      img.addEventListener('error', function () { img.remove(); avatar.innerHTML = SVG.user; });
      avatar.appendChild(img);
    } else { avatar.innerHTML = SVG.user; }
    enablePictureDrop(avatar);
    var picRow = el('div', { class: 'wzs-row' },
      avatar,
      el('div', { class: 'wzs-row__main' }, el('div', { class: 'wzs-row__label' }, '프로필 사진'), el('div', { class: 'wzs-row__sub' }, '클릭 또는 사진을 끌어다 놓아 변경')),
      el('div', { class: 'wzs-row__action' }, miniBtn('변경', pickPicture)));
    list.appendChild(picRow);

    /* 이름 */
    list.appendChild(editableRow({
      label: '이름', field: 'name', value: me.name || '', placeholder: '이름 입력',
      validate: function (v) { if (!v) return '이름을 입력해 주세요'; if (v.length > 40) return '이름은 40자 이하입니다'; return null; },
      successMsg: '이름이 변경되었습니다',
    }));

    /* 닉네임 (프로필 주소 = slug). 한글 허용. */
    list.appendChild(editableRow({
      label: '닉네임', field: 'slug',
      value: me.slug || '', displayValue: me.slug ? ('@' + me.slug) : '미설정',
      placeholder: '예: 김국민', prefix: '@', lower: true,
      validate: function (v) {
        if (!v) return '닉네임을 입력해 주세요';
        if (!/^[가-힣a-z0-9](?:[가-힣a-z0-9-]{0,48}[가-힣a-z0-9])?$/.test(v)) return '한글/영문/숫자/하이픈, 2~50자 (양끝은 한글·영문·숫자)';
        return null;
      },
      successMsg: '닉네임이 변경되었습니다',
    }));

    /* 소개 */
    list.appendChild(editableRow({
      label: '소개', field: 'intro', value: me.intro || '', displayValue: me.intro || '미설정',
      placeholder: '나와 내 프로젝트를 소개해 주세요', multiline: true, maxlength: 500,
      validate: function (v) { if (v.length > 500) return '소개는 500자 이하입니다'; return null; },
      successMsg: '소개가 변경되었습니다',
    }));

    /* 웹사이트 */
    list.appendChild(editableRow({
      label: '웹사이트', field: 'website', value: me.website || '', displayValue: me.website || '미설정',
      placeholder: 'https://example.com',
      validate: function (v) { if (v && !/^https?:\/\//.test(v)) return 'http(s):// 로 시작하는 주소여야 합니다'; if (v.length > 255) return '주소가 너무 깁니다'; return null; },
      successMsg: '웹사이트가 변경되었습니다',
    }));

    panel.appendChild(list);
  }

  // 인라인 편집 행 — 변경 클릭 시 모달로 편집 -> PATCH /api/me
  function editableRow(opts) {
    var displayValue = opts.displayValue != null ? opts.displayValue : (opts.value || '미설정');
    var muted = !opts.value;
    var row = settingRow({
      label: opts.label,
      value: displayValue,
      valueMuted: muted,
      actionNode: miniBtn(opts.value ? '변경' : '등록', function () { openEdit(); }),
    });

    function openEdit() {
      var ctrl;
      if (opts.multiline) {
        ctrl = el('textarea', { class: 'wzs-input', placeholder: opts.placeholder || '', maxlength: String(opts.maxlength || 500) });
        ctrl.value = opts.value || '';
      } else {
        var attrs = { placeholder: opts.placeholder || '', value: opts.value || '' };
        if (opts.maxlength) attrs.maxlength = String(opts.maxlength);
        ctrl = input(attrs);
        if (opts.lower) ctrl.addEventListener('input', function () { var p = ctrl.value; ctrl.value = p.toLowerCase(); });
      }
      var controlNode = opts.prefix
        ? el('div', { class: 'wzs-fld__row' }, el('span', { class: 'wzs-inline__prefix' }, opts.prefix), ctrl)
        : ctrl;
      var f = field({ label: null, control: controlNode });

      var m = openModal({
        title: opts.label,
        body: f,
        primaryLabel: '저장',
        onPrimary: function () {
          var v = ctrl.value.trim();
          if (opts.lower) v = v.toLowerCase();
          var err = opts.validate ? opts.validate(v) : null;
          if (err) { f.fail(err); return false; }
          f.clear();
          m.primaryBtn.disabled = true; m.primaryBtn.textContent = '저장 중...';
          var patch = {}; patch[opts.field] = v;
          patchMe(patch).then(function () {
            m.close(); rerenderPanel(); toast(opts.successMsg || '저장되었습니다');
          }).catch(function (e) {
            m.primaryBtn.disabled = false; m.primaryBtn.textContent = '저장';
            f.fail((e && e.message) || '저장에 실패했습니다');
          });
          return false; // we manage closing
        },
      });
      setTimeout(function () { ctrl.focus(); }, 60);
    }
    return row;
  }

  // 프로필 사진 파일 처리 -> data URL -> PATCH /api/me {picture}
  function applyPictureFile(fi) {
    if (!fi) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(fi.type)) { toast('PNG·JPG·WEBP 이미지만 가능합니다'); return; }
    if (fi.size > 3 * 1024 * 1024) { toast('이미지는 3MB 이하만 가능합니다'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      toast('업로드 중...');
      patchMe({ picture: String(reader.result || '') })
        .then(function () { rerenderPanel(); toast('프로필 사진이 변경되었습니다'); })
        .catch(function (e) { toast((e && e.message) || '사진 변경에 실패했습니다'); });
    };
    reader.onerror = function () { toast('이미지를 읽지 못했습니다'); };
    reader.readAsDataURL(fi);
  }
  function pickPicture() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/png,image/jpeg,image/webp';
    inp.addEventListener('change', function () { applyPictureFile(inp.files && inp.files[0]); });
    inp.click();
  }
  // 아바타에 드래그앤드롭 + 클릭 업로드 부착
  function enablePictureDrop(avatar) {
    if (!avatar) return;
    avatar.classList.add('wzs-avatar--drop');
    avatar.addEventListener('click', pickPicture);
    avatar.addEventListener('dragover', function (e) { e.preventDefault(); avatar.classList.add('is-drag'); });
    avatar.addEventListener('dragleave', function (e) { e.preventDefault(); avatar.classList.remove('is-drag'); });
    avatar.addEventListener('drop', function (e) {
      e.preventDefault(); avatar.classList.remove('is-drag');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) applyPictureFile(f);
    });
  }

  /* =====================================================================
   * 탭 2: 계정
   * ===================================================================== */
  function renderAccount(panel) {
    var me = state.me;
    var email = me.email || '';
    var isKookmin = /@kookmin\.ac\.kr$/i.test(email);
    var list = el('div', { class: 'wzs-list' });

    /* 이메일 */
    var emailBadge = isKookmin
      ? el('span', { class: 'wzs-badge wzs-badge--verified' }, el('span', { html: SVG.check, style: 'display:inline-flex;width:12px;height:12px' }), '인증됨')
      : null;
    list.appendChild(settingRow({ label: '이메일', labelBadge: emailBadge, value: email || '미설정', valueMuted: !email }));

    /* 비밀번호 (OAuth 안내) */
    list.appendChild(settingRow({
      label: '비밀번호',
      value: '구글 계정으로 로그인 중입니다. 비밀번호는 구글에서 관리됩니다.',
      valueMuted: true,
    }));

    /* 연락처 (phone) */
    list.appendChild(editablePhoneRow());

    /* 구글 계정 연동 */
    var snsIc = el('div', { class: 'wzs-sns__ic', html: SVG.google });
    list.appendChild(el('div', { class: 'wzs-row' },
      snsIc,
      el('div', { class: 'wzs-row__main' }, el('div', { class: 'wzs-row__label' }, '구글 계정 연동')),
      el('div', { class: 'wzs-row__action' },
        el('span', { class: 'wzs-badge wzs-badge--connected' },
          el('span', { html: SVG.check, style: 'display:inline-flex;width:12px;height:12px' }), '연동 중'))));

    panel.appendChild(list);

    /* 회원 탈퇴 */
    var danger = el('div', { class: 'wzs-danger' },
      el('div', { class: 'wzs-danger__title' }, '회원 탈퇴'),
      el('div', { class: 'wzs-danger__desc' }, '탈퇴하면 계정과 관련 정보가 삭제되며 되돌릴 수 없습니다. 진행 중인 펀딩·주문이 있으면 탈퇴가 제한됩니다.'),
      miniBtn('회원 탈퇴', confirmWithdraw, 'wzs-mini--danger'));
    panel.appendChild(danger);
  }

  // 연락처 행 — 모달 편집(숫자만 + 자동 하이픈)
  function editablePhoneRow() {
    var me = state.me;
    var has = !!me.phone;
    var row = settingRow({
      label: '연락처',
      value: has ? me.phone : '등록된 연락처가 없습니다',
      valueMuted: !has,
      actionNode: miniBtn(has ? '변경' : '등록', openEdit),
    });
    function openEdit() {
      var ctrl = input({ type: 'tel', inputmode: 'numeric', placeholder: '010-1234-5678', value: me.phone || '' });
      bindFormatter(ctrl, formatPhone);
      var f = field({ control: ctrl });
      var m = openModal({
        title: '연락처', body: f, primaryLabel: '저장',
        onPrimary: function () {
          var v = ctrl.value.trim();
          if (v && digitsOnly(v).length < 9) { f.fail('전화번호 형식이 올바르지 않습니다'); return false; }
          f.clear();
          m.primaryBtn.disabled = true; m.primaryBtn.textContent = '저장 중...';
          patchMe({ phone: v }).then(function () {
            m.close(); rerenderPanel(); toast('연락처가 변경되었습니다');
          }).catch(function (e) {
            m.primaryBtn.disabled = false; m.primaryBtn.textContent = '저장';
            f.fail((e && e.message) || '저장에 실패했습니다');
          });
          return false;
        },
      });
      setTimeout(function () { ctrl.focus(); }, 60);
    }
    return row;
  }

  function confirmWithdraw() {
    var body = el('div', {},
      el('p', { style: 'font-size:14px;color:var(--c-text-sub);line-height:1.7;margin:0' },
        '정말 탈퇴하시겠어요? 계정과 프로필·결제수단·배송지 정보가 모두 삭제되며 되돌릴 수 없습니다.'));
    // 에러 안내 영역은 단 한 곳만 둔다(재시도해도 메시지가 중복으로 쌓이지 않도록).
    var errBox = el('div', { class: 'wzs-withdraw-err', style: 'display:none;margin-top:14px' });
    body.appendChild(errBox);

    // 에러를 errBox 안에 1개 블록으로만 표시. action: {label, view} 면 마이페이지 패널로 유도 버튼 추가.
    function showError(msg, action) {
      errBox.replaceChildren();
      errBox.style.display = '';
      errBox.appendChild(el('p', { class: 'wzs-fld__err is-show', style: 'margin:0' }, msg));
      if (action) {
        var go = el('a', {
          class: 'wzs-mini', style: 'display:inline-flex;margin-top:10px;text-decoration:none',
          href: '/profile.html#' + action.view,
        }, action.label);
        errBox.appendChild(go);
      }
    }
    function clearError() { errBox.replaceChildren(); errBox.style.display = 'none'; }

    var m = openModal({
      title: '회원 탈퇴', body: body, primaryLabel: '탈퇴하기',
      onPrimary: function () {
        clearError();
        m.primaryBtn.disabled = true; m.primaryBtn.textContent = '처리 중...';
        api.del('/me').then(function () {
          m.close(); toast('탈퇴가 완료되었습니다');
          setTimeout(function () { location.href = '/main.html'; }, 1000);
        }).catch(function (e) {
          m.primaryBtn.disabled = false; m.primaryBtn.textContent = '탈퇴하기';
          var code = e && e.code;
          if (e && e.status === 409 && code === 'HAS_FUNDS') {
            // 개설한 프로젝트가 남아 있음 → 먼저 삭제 요청하도록 안내 + 개설 프로젝트로 유도
            showError('개설한 프로젝트가 있어 바로 탈퇴할 수 없어요. 먼저 프로젝트 삭제를 요청해 주세요. 처리되면 탈퇴할 수 있어요.',
              { label: '개설한 프로젝트 보기', view: 'funds' });
          } else if (e && e.status === 409 && code === 'HAS_ORDERS') {
            // 참여 중인 펀딩이 남아 있음 → 먼저 취소하도록 안내 + 후원 프로젝트로 유도
            showError('참여 중인 펀딩이 있어 바로 탈퇴할 수 없어요. 펀딩을 먼저 취소한 뒤 탈퇴해 주세요.',
              { label: '후원한 프로젝트 보기', view: 'backings' });
          } else if (e && e.status === 409) {
            // HAS_ACTIVITY 등 그 외 409(안전 메시지)
            showError((e && e.message) || '진행 중인 활동이 있어 탈퇴할 수 없어요. 활동을 정리한 뒤 다시 시도해 주세요.');
          } else {
            showError((e && e.message) || '탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
          }
        });
        return false;
      },
    });
    if (m.primaryBtn) m.primaryBtn.classList.add('wz-btn--primary');
  }

  /* =====================================================================
   * 탭 3: 결제수단
   * ===================================================================== */
  function renderPayment(panel) {
    // 무통장입금 모델 — 카드/계좌 간편결제 등록은 현재 잠금. 안내만 표시한다.
    panel.appendChild(el('p', { class: 'wzs-sec__desc' }, '결제수단'));
    var notice = el('div', {});
    notice.style.cssText = 'margin:4px 0 0;padding:18px;border:1px solid var(--c-border,#E5E7EB);background:var(--c-bg-soft,#F8F7FB);border-radius:12px;line-height:1.7;';
    notice.appendChild(el('div', { style: 'display:flex;align-items:center;gap:7px;font-size:15px;font-weight:800;color:var(--c-text);margin-bottom:6px' }, '🏦 현재 무통장 입금만 지원해요'));
    notice.appendChild(el('p', { style: 'font-size:13.5px;color:var(--c-text-sub);margin:0' },
      '카드·계좌 간편결제 등록은 준비 중이에요. 펀딩은 무통장 입금으로 진행됩니다 — 후원하면 먼저 예약만 되고, 펀딩이 목표를 달성하면 입금 안내(계좌·금액)를 알림으로 보내드려요. 안내받은 계좌로 입금하시면 관리자 확인 후 참여가 확정됩니다.'));
    panel.appendChild(notice);
    return; // 이하 카드 등록 UI 는 잠금(미실행)

    /* eslint-disable no-unreachable */
    var listWrap = el('div', { class: 'wzs-cards' });
    panel.appendChild(listWrap);

    var addBtn = el('button', { class: 'wzs-add', type: 'button' }, el('span', { html: SVG.plus }), '결제수단 추가');
    addBtn.addEventListener('click', openAddPayment);
    panel.appendChild(addBtn);
    var fromGate = false;

    function renderList() {
      listWrap.innerHTML = '';
      var items = state.methods || [];
      if (!items.length) {
        var empty = el('div', { class: 'wzs-empty' }, '등록된 결제수단이 없습니다. 위 “결제수단 추가”로 카드나 계좌를 등록하세요.');
        listWrap.appendChild(empty);
        // 게이트 유입이고 결제수단이 0개면 추가 폼을 한 번 자동으로 띄워 등록을 바로 유도.
        if (fromGate && !renderPayment._gateOpened) {
          renderPayment._gateOpened = true;
          setTimeout(openAddPayment, 120);
        }
        return;
      }
      items.forEach(function (pm) { listWrap.appendChild(paymentCard(pm)); });
    }

    if (state.methods == null) {
      listWrap.appendChild(el('div', { class: 'wzs-loading' }, '불러오는 중...'));
      api.get('/payment-methods').then(function (rows) {
        state.methods = Array.isArray(rows) ? rows : [];
        renderList();
      }).catch(function () {
        state.methods = [];
        listWrap.innerHTML = '';
        listWrap.appendChild(el('div', { class: 'wzs-empty' }, '결제수단을 불러오지 못했습니다.'));
      });
    } else {
      renderList();
    }

    function paymentCard(pm) {
      var isCard = pm.channelType === 'CARD_DIRECT';
      var card = el('div', { class: 'wzs-card' + (pm.isDefault ? ' is-default' : '') });
      var ic = el('div', { class: 'wzs-card__ic ' + (isCard ? 'wzs-card__ic--card' : 'wzs-card__ic--bank'), html: isCard ? SVG.card : SVG.bank });
      var body = el('div', { class: 'wzs-card__body' });
      var title = el('div', { class: 'wzs-card__title' });
      title.appendChild(document.createTextNode(pm.cardName || (isCard ? '카드' : '계좌이체')));
      if (pm.isDefault) title.appendChild(el('span', { class: 'wzs-badge wzs-badge--default' }, '기본'));
      body.appendChild(title);
      if (isCard && pm.cardLastFour) {
        var line = el('div', { class: 'wzs-card__line' });
        line.textContent = '•••• •••• •••• ' + pm.cardLastFour;
        body.appendChild(line);
      } else if (!isCard) {
        body.appendChild(el('div', { class: 'wzs-card__line' }, '계좌이체'));
      }
      var actions = el('div', { class: 'wzs-card__actions' });
      if (!pm.isDefault) actions.appendChild(miniBtn('기본으로 설정', function () { setDefaultPayment(pm.id); }, 'wzs-mini--ghost'));
      actions.appendChild(miniBtn('삭제', function () { deletePayment(pm); }, 'wzs-mini--danger'));
      body.appendChild(actions);
      card.append(ic, body);
      return card;
    }

    function setDefaultPayment(id) {
      api.patch('/payment-methods/' + encodeURIComponent(id) + '/default').then(function () {
        return api.get('/payment-methods');
      }).then(function (rows) {
        state.methods = Array.isArray(rows) ? rows : [];
        renderList(); toast('기본 결제수단이 변경되었습니다');
      }).catch(function (e) { toast((e && e.message) || '변경에 실패했습니다'); });
    }

    function deletePayment(pm) {
      var body = el('p', { style: 'font-size:14px;color:var(--c-text-sub);line-height:1.6;margin:0' });
      body.textContent = (pm.cardName || '이 결제수단') + '을(를) 삭제할까요?';
      var m = openModal({
        title: '결제수단 삭제', body: body, primaryLabel: '삭제',
        onPrimary: function () {
          m.primaryBtn.disabled = true; m.primaryBtn.textContent = '삭제 중...';
          api.del('/payment-methods/' + encodeURIComponent(pm.id)).then(function () {
            return api.get('/payment-methods');
          }).then(function (rows) {
            state.methods = Array.isArray(rows) ? rows : [];
            m.close(); renderList(); toast('결제수단이 삭제되었습니다');
          }).catch(function (e) {
            m.primaryBtn.disabled = false; m.primaryBtn.textContent = '삭제';
            toast((e && e.message) || '삭제에 실패했습니다');
          });
          return false;
        },
      });
    }

    function openAddPayment() {
      // 1단계: 카드 / 계좌 선택
      var choices = el('div', { class: 'wzs-choices' });
      var cardChoice = el('button', { class: 'wzs-choice', type: 'button' },
        el('span', { class: 'wzs-choice__ic wzs-card__ic--card', html: SVG.card }),
        el('span', {}, el('span', { class: 'wzs-choice__t' }, '카드 간편결제'), el('span', { class: 'wzs-choice__s' }, '신용·체크카드 등록')),
        el('span', { class: 'wzs-choice__chev', html: SVG.chevron }));
      var bankChoice = el('button', { class: 'wzs-choice', type: 'button' },
        el('span', { class: 'wzs-choice__ic wzs-card__ic--bank', html: SVG.bank }),
        el('span', {}, el('span', { class: 'wzs-choice__t' }, '계좌이체'), el('span', { class: 'wzs-choice__s' }, '은행 계좌 등록')),
        el('span', { class: 'wzs-choice__chev', html: SVG.chevron }));
      choices.append(cardChoice, bankChoice);
      var m1 = openModal({ title: '결제수단 추가', body: choices });
      cardChoice.addEventListener('click', function () { m1.close(); openCardForm(); });
      bankChoice.addEventListener('click', function () { m1.close(); openBankForm(); });
    }

    function openCardForm() {
      var cardInput = input({ type: 'tel', inputmode: 'numeric', placeholder: '0000-0000-0000-0000', maxlength: '19' });
      bindFormatter(cardInput, formatCard);
      var fCard = field({ label: '카드번호', required: true, control: cardInput });

      var now = new Date();
      var months = []; for (var mo = 1; mo <= 12; mo++) months.push({ value: String(mo).padStart(2, '0'), label: String(mo).padStart(2, '0') + '월' });
      var years = []; for (var y = 0; y < 11; y++) { var yy = now.getFullYear() + y; years.push({ value: String(yy).slice(2), label: String(yy) + '년' }); }
      var selMonth = select(months);
      var selYear = select(years);
      var fExp = field({ label: '유효기간', required: true, control: el('div', { class: 'wzs-fld__row' }, selMonth, selYear) });

      var pwInput = input({ type: 'password', inputmode: 'numeric', placeholder: '앞 2자리', maxlength: '2' });
      pwInput.addEventListener('input', function () { pwInput.value = digitsOnly(pwInput.value).slice(0, 2); });
      var fPw = field({ label: '비밀번호 앞 2자리', required: true, control: pwInput });

      var birthInput = input({ type: 'tel', inputmode: 'numeric', placeholder: 'YYMMDD (생년월일 6자리)', maxlength: '6' });
      birthInput.addEventListener('input', function () { birthInput.value = digitsOnly(birthInput.value).slice(0, 6); });
      var fBirth = field({ label: '소유주 생년월일', required: true, control: birthInput });

      var defChk = el('input', { type: 'checkbox' });
      var fDefault = el('label', { class: 'wzs-consent' }, defChk, '기본 결제수단으로 설정');

      var bodyWrap = el('div', {}, fCard, fExp, fPw, fBirth, fDefault);
      var m = openModal({
        title: '카드 등록', body: bodyWrap, primaryLabel: '등록',
        onPrimary: function () {
          [fCard, fExp, fPw, fBirth].forEach(function (f) { f.clear(); });
          var cardDigits = digitsOnly(cardInput.value);
          if (cardDigits.length < 15) { fCard.fail('카드번호를 정확히 입력해 주세요'); return false; }
          if (digitsOnly(pwInput.value).length !== 2) { fPw.fail('비밀번호 앞 2자리를 입력해 주세요'); return false; }
          if (digitsOnly(birthInput.value).length !== 6) { fBirth.fail('생년월일 6자리를 입력해 주세요'); return false; }

          // 데모: 빌링키는 클라이언트가 만든 임의 토큰 문자열로 전송 (서버는 저장만)
          var billingKeyRef = 'demo_billing_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
          var brand = cardBrand(cardDigits);
          var payload = {
            channelType: 'CARD_DIRECT',
            billingKeyRef: billingKeyRef,
            cardName: brand,
            cardLastFour: cardDigits.slice(-4),
          };
          m.primaryBtn.disabled = true; m.primaryBtn.textContent = '등록 중...';
          api.post('/payment-methods', payload).then(function (created) {
            if (defChk.checked && created && created.id && !created.isDefault) {
              return api.patch('/payment-methods/' + encodeURIComponent(created.id) + '/default');
            }
          }).then(function () {
            return api.get('/payment-methods');
          }).then(function (rows) {
            state.methods = Array.isArray(rows) ? rows : [];
            m.close(); renderList(); toast('카드가 등록되었습니다');
          }).catch(function (e) {
            m.primaryBtn.disabled = false; m.primaryBtn.textContent = '등록';
            fCard.fail((e && e.message) || '등록에 실패했습니다');
          });
          return false;
        },
      });
      setTimeout(function () { cardInput.focus(); }, 60);
    }

    function openBankForm() {
      var bankOpts = BANKS.map(function (b) { return { value: b, label: b }; });
      var selBank = select(bankOpts);
      var fBank = field({ label: '은행', required: true, control: selBank });

      var acctInput = input({ type: 'tel', inputmode: 'numeric', placeholder: '계좌번호 (숫자만)' });
      acctInput.addEventListener('input', function () { acctInput.value = digitsOnly(acctInput.value).slice(0, 16); });
      var fAcct = field({ label: '계좌번호', required: true, control: acctInput });

      var holderInput = input({ placeholder: '예금주명' });
      var fHolder = field({ label: '예금주명', required: true, control: holderInput });

      var defChk = el('input', { type: 'checkbox' });
      var fDefault = el('label', { class: 'wzs-consent' }, defChk, '기본 결제수단으로 설정');

      var bodyWrap = el('div', {}, fBank, fAcct, fHolder, fDefault);
      var m = openModal({
        title: '계좌이체 등록', body: bodyWrap, primaryLabel: '등록',
        onPrimary: function () {
          [fBank, fAcct, fHolder].forEach(function (f) { f.clear(); });
          var acct = digitsOnly(acctInput.value);
          var holder = holderInput.value.trim();
          if (acct.length < 6) { fAcct.fail('계좌번호를 정확히 입력해 주세요'); return false; }
          if (!holder) { fHolder.fail('예금주명을 입력해 주세요'); return false; }

          var billingKeyRef = 'demo_billing_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
          var payload = {
            channelType: 'TOSSPAY',
            billingKeyRef: billingKeyRef,
            cardName: selBank.value + ' ' + holder,
            cardLastFour: acct.slice(-4),
          };
          m.primaryBtn.disabled = true; m.primaryBtn.textContent = '등록 중...';
          api.post('/payment-methods', payload).then(function (created) {
            if (defChk.checked && created && created.id && !created.isDefault) {
              return api.patch('/payment-methods/' + encodeURIComponent(created.id) + '/default');
            }
          }).then(function () {
            return api.get('/payment-methods');
          }).then(function (rows) {
            state.methods = Array.isArray(rows) ? rows : [];
            m.close(); renderList(); toast('계좌가 등록되었습니다');
          }).catch(function (e) {
            m.primaryBtn.disabled = false; m.primaryBtn.textContent = '등록';
            fAcct.fail((e && e.message) || '등록에 실패했습니다');
          });
          return false;
        },
      });
      setTimeout(function () { selBank.focus(); }, 60);
    }
  }

  // 카드 앞자리 -> 브랜드(표시용)
  function cardBrand(d) {
    if (/^4/.test(d)) return 'VISA 카드';
    if (/^5[1-5]/.test(d) || /^2[2-7]/.test(d)) return 'Mastercard';
    if (/^3[47]/.test(d)) return 'AMEX';
    if (/^35/.test(d)) return 'JCB';
    return '카드';
  }

  /* =====================================================================
   * 탭 4: 배송지
   * ===================================================================== */
  function renderAddress(panel) {
    panel.appendChild(el('p', { class: 'wzs-sec__desc' }, '상품을 받을 배송지를 등록하세요.'));
    var listWrap = el('div', { class: 'wzs-cards' });
    panel.appendChild(listWrap);

    var addBtn = el('button', { class: 'wzs-add', type: 'button' }, el('span', { html: SVG.plus }), '배송지 추가');
    addBtn.addEventListener('click', function () { openAddressForm(null); });
    panel.appendChild(addBtn);

    function renderList() {
      listWrap.innerHTML = '';
      var items = state.addresses || [];
      if (!items.length) {
        listWrap.appendChild(el('div', { class: 'wzs-empty' }, '등록된 배송지가 없습니다.'));
        return;
      }
      items.forEach(function (a) { listWrap.appendChild(addressCard(a)); });
    }

    if (state.addresses == null) {
      listWrap.appendChild(el('div', { class: 'wzs-loading' }, '불러오는 중...'));
      api.get('/addresses').then(function (rows) {
        state.addresses = Array.isArray(rows) ? rows : [];
        renderList();
      }).catch(function () {
        state.addresses = [];
        listWrap.innerHTML = '';
        listWrap.appendChild(el('div', { class: 'wzs-empty' }, '배송지를 불러오지 못했습니다.'));
      });
    } else {
      renderList();
    }

    function addressCard(a) {
      var parts = splitDetailMemo(a.detailAddress);
      var card = el('div', { class: 'wzs-card' + (a.isDefault ? ' is-default' : '') });
      var ic = el('div', { class: 'wzs-card__ic wzs-card__ic--addr', html: SVG.pin });
      var body = el('div', { class: 'wzs-card__body' });
      var title = el('div', { class: 'wzs-card__title' });
      title.appendChild(document.createTextNode((a.recipientName || '') + (a.recipientPhone ? '  ·  ' + formatPhone(a.recipientPhone) : '')));
      if (a.isDefault) title.appendChild(el('span', { class: 'wzs-badge wzs-badge--default' }, '기본'));
      body.appendChild(title);

      var addrLine = el('div', { class: 'wzs-card__line' });
      addrLine.textContent = '(' + (a.postalCode || '') + ') ' + (a.roadAddress || '') + (parts.detail ? ' ' + parts.detail : '');
      body.appendChild(addrLine);
      if (parts.memo) {
        var memoLine = el('div', { class: 'wzs-card__meta' });
        memoLine.textContent = '배송 메모: ' + parts.memo;
        body.appendChild(memoLine);
      }

      var actions = el('div', { class: 'wzs-card__actions' });
      if (!a.isDefault) actions.appendChild(miniBtn('기본으로 설정', function () { setDefaultAddress(a.id); }, 'wzs-mini--ghost'));
      actions.appendChild(miniBtn('수정', function () { openAddressForm(a); }));
      actions.appendChild(miniBtn('삭제', function () { deleteAddress(a); }, 'wzs-mini--danger'));
      body.appendChild(actions);
      card.append(ic, body);
      return card;
    }

    function setDefaultAddress(id) {
      api.patch('/addresses/' + encodeURIComponent(id) + '/default').then(function () {
        return api.get('/addresses');
      }).then(function (rows) {
        state.addresses = Array.isArray(rows) ? rows : [];
        renderList(); toast('기본 배송지가 변경되었습니다');
      }).catch(function (e) { toast((e && e.message) || '변경에 실패했습니다'); });
    }

    function deleteAddress(a) {
      var body = el('p', { style: 'font-size:14px;color:var(--c-text-sub);line-height:1.6;margin:0' });
      body.textContent = (a.recipientName || '이 배송지') + ' 배송지를 삭제할까요?';
      var m = openModal({
        title: '배송지 삭제', body: body, primaryLabel: '삭제',
        onPrimary: function () {
          m.primaryBtn.disabled = true; m.primaryBtn.textContent = '삭제 중...';
          api.del('/addresses/' + encodeURIComponent(a.id)).then(function () {
            return api.get('/addresses');
          }).then(function (rows) {
            state.addresses = Array.isArray(rows) ? rows : [];
            m.close(); renderList(); toast('배송지가 삭제되었습니다');
          }).catch(function (e) {
            m.primaryBtn.disabled = false; m.primaryBtn.textContent = '삭제';
            toast((e && e.message) || '삭제에 실패했습니다');
          });
          return false;
        },
      });
    }

    // 배송지 추가/수정 모달 (텀블벅 필드: 받는 사람 / 주소 / 상세주소 / 휴대폰 / 메모)
    function openAddressForm(editing) {
      var existing = editing ? splitDetailMemo(editing.detailAddress) : { detail: '', memo: '' };

      var nameInput = input({ placeholder: '받는 사람 이름', value: editing ? (editing.recipientName || '') : '' });
      var fName = field({ label: '받는 사람', required: true, control: nameInput });

      var phoneInput = input({ type: 'tel', inputmode: 'numeric', placeholder: '010-1234-5678', value: editing ? formatPhone(editing.recipientPhone || '') : '' });
      bindFormatter(phoneInput, formatPhone);
      var fPhone = field({ label: '휴대폰 번호', required: true, control: phoneInput });

      // 주소 (우편번호+도로명) — 검색 버튼으로 다음 우편번호 팝업
      var postalInput = input({ placeholder: '우편번호', readonly: 'readonly', value: editing ? (editing.postalCode || '') : '' });
      var searchBtn = el('button', { class: 'wzs-mini', type: 'button' }, '주소 검색');
      var roadInput = input({ placeholder: '도로명 주소 (검색으로 입력)', readonly: 'readonly', value: editing ? (editing.roadAddress || '') : '' });
      var jibun = { value: editing ? (editing.jibunAddress || '') : '' };
      var fPostal = field({ label: '우편번호', required: true, control: el('div', { class: 'wzs-fld__row' }, postalInput, searchBtn) });
      var fRoad = field({ label: '도로명 주소', required: true, control: roadInput });
      searchBtn.addEventListener('click', function () {
        openPostcode(function (data) {
          postalInput.value = data.zonecode || '';
          roadInput.value = data.roadAddress || data.address || '';
          jibun.value = data.jibunAddress || '';
          fPostal.clear(); fRoad.clear();
          setTimeout(function () { detailInput.focus(); }, 60);
        });
      });

      var detailInput = input({ placeholder: '상세주소 (동·호수 등)', value: existing.detail });
      var fDetail = field({ label: '상세주소', control: detailInput });

      var memoInput = input({ placeholder: '부재 시 경비실에 맡겨주세요 등', value: existing.memo });
      var fMemo = field({ label: '배송 특이사항', control: memoInput });

      // 레이아웃: 짧은 필드는 2열 그리드(모바일 1열)로 공간을 채우고, 도로명은 전체폭.
      //   (받는사람 | 휴대폰) · (우편번호 + 검색버튼, 전체폭) · 도로명(전체폭) · (상세주소 | 배송특이사항)
      //   검증/저장 로직은 그대로 — 래퍼/그리드만 추가.
      var bodyWrap = el('div', { class: 'wzs-form' },
        el('div', { class: 'wzs-form__grid' }, fName, fPhone),
        fPostal,
        fRoad,
        el('div', { class: 'wzs-form__grid' }, fDetail, fMemo));

      // 개인정보 수집·이용 동의 (필수) — WZConsent 없으면 인라인 체크박스
      var inlineChk = null;
      if (!(window.WZConsent && typeof window.WZConsent.requirePrivacy === 'function')) {
        inlineChk = el('input', { type: 'checkbox' });
        var consentLabel = el('label', { class: 'wzs-consent', style: 'margin-top:4px' },
          inlineChk,
          el('span', {}, '(필수) 배송을 위한 개인정보 수집·이용에 동의합니다. ',
            (function () {
              var a = el('a', { href: '/privacy.html', target: '_blank', rel: 'noopener' }, '자세히');
              return a;
            })()));
        bodyWrap.appendChild(consentLabel);
      }

      var m = openModal({
        title: editing ? '배송지 수정' : '배송지 추가', body: bodyWrap, primaryLabel: '저장', wide: true,
        onPrimary: function () {
          [fName, fPostal, fRoad, fPhone].forEach(function (f) { f.clear(); });
          var name = nameInput.value.trim();
          var phone = phoneInput.value.trim();
          if (!name) { fName.fail('받는 사람을 입력해 주세요'); return false; }
          if (!postalInput.value || !roadInput.value) { fPostal.fail('주소 검색으로 주소를 입력해 주세요'); return false; }
          if (digitsOnly(phone).length < 9) { fPhone.fail('휴대폰 번호를 정확히 입력해 주세요'); return false; }

          var detail = detailInput.value.trim();
          var memo = memoInput.value.trim();
          // 서버 스키마에 메모 필드 없음 -> detailAddress 에 "상세주소 / 메모" 형태로 합쳐 저장
          var mergedDetail = memo ? (detail ? detail + ' / ' + memo : '/ ' + memo) : detail;

          var payload = {
            label: '기본', // 화면엔 안 보이되 API 필수 — "기본" 으로 채움
            recipientName: name,
            recipientPhone: phone,
            postalCode: postalInput.value,
            roadAddress: roadInput.value,
            jibunAddress: jibun.value || undefined,
            detailAddress: mergedDetail || undefined,
          };

          m.primaryBtn.disabled = true; m.primaryBtn.textContent = '저장 중...';
          // 동의 처리: WZConsent 우선, 없으면 인라인 체크박스
          requirePrivacy().then(function (consented) {
            if (consented === false) { throw new Error('__CONSENT_CANCELLED__'); }
            if (consented === null) {
              // 인라인 체크박스 fallback
              if (inlineChk && !inlineChk.checked) { throw new Error('__CONSENT_REQUIRED__'); }
            }
            if (editing) {
              return api.patch('/addresses/' + encodeURIComponent(editing.id), payload);
            }
            return api.post('/addresses', payload);
          }).then(function () {
            return api.get('/addresses');
          }).then(function (rows) {
            state.addresses = Array.isArray(rows) ? rows : [];
            m.close(); renderList(); toast(editing ? '배송지가 수정되었습니다' : '배송지가 등록되었습니다');
          }).catch(function (e) {
            m.primaryBtn.disabled = false; m.primaryBtn.textContent = '저장';
            if (e && e.message === '__CONSENT_REQUIRED__') { fPhone.fail('개인정보 수집·이용에 동의해 주세요'); return; }
            if (e && e.message === '__CONSENT_CANCELLED__') { return; }
            fPhone.fail((e && e.message) || '저장에 실패했습니다');
          });
          return false;
        },
      });
      setTimeout(function () { nameInput.focus(); }, 60);
    }
  }

  // detailAddress 안에 합쳐진 "상세 / 메모" 분리
  function splitDetailMemo(detailAddress) {
    var s = String(detailAddress || '');
    if (!s) return { detail: '', memo: '' };
    var idx = s.indexOf(' / ');
    if (idx >= 0) return { detail: s.slice(0, idx).trim(), memo: s.slice(idx + 3).trim() };
    if (s.indexOf('/ ') === 0) return { detail: '', memo: s.slice(2).trim() };
    return { detail: s.trim(), memo: '' };
  }

  /* 다음 우편번호 — 스크립트 동적 로드 후 팝업 */
  var _postcodeLoading = null;
  function loadPostcode() {
    if (window.daum && window.daum.Postcode) return Promise.resolve();
    if (_postcodeLoading) return _postcodeLoading;
    _postcodeLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { _postcodeLoading = null; reject(new Error('우편번호 서비스를 불러오지 못했습니다')); };
      document.head.appendChild(s);
    });
    return _postcodeLoading;
  }
  function openPostcode(onComplete) {
    loadPostcode().then(function () {
      new window.daum.Postcode({
        oncomplete: function (data) { onComplete(data); },
      }).open();
    }).catch(function (e) { toast((e && e.message) || '우편번호 서비스를 불러오지 못했습니다'); });
  }

  /* =====================================================================
   * 탭 5: 알림
   * ===================================================================== */
  function renderNotification(panel) {
    panel.appendChild(el('p', { class: 'wzs-sec__desc' }, '받을 알림 종류를 선택하세요. 변경 즉시 저장됩니다.'));
    var prefs = (state.me && state.me.notificationPrefs) || {};
    var list = el('div', { class: 'wzs-list' });
    NOTIF_ITEMS.forEach(function (it) {
      var tg = toggle(!!prefs[it.key], function (next, node) {
        node.setAttribute('disabled', '');
        var patch = {}; patch[it.key] = next;
        api.patch('/me/notifications', patch).then(function (updated) {
          node.removeAttribute('disabled');
          if (updated && state.me) state.me.notificationPrefs = Object.assign({}, state.me.notificationPrefs, updated);
          else if (state.me) { state.me.notificationPrefs = state.me.notificationPrefs || {}; state.me.notificationPrefs[it.key] = next; }
          toast('알림 설정이 저장되었습니다');
        }).catch(function (e) {
          // 롤백
          node.removeAttribute('disabled');
          node.classList.toggle('is-on', !next);
          node.setAttribute('aria-checked', String(!next));
          toast((e && e.message) || '설정 저장에 실패했습니다');
        });
      });
      list.appendChild(settingRow({
        label: it.label,
        value: it.desc,
        valueMuted: true,
        actionNode: tg,
      }));
    });
    panel.appendChild(list);
  }

  /* =====================================================================
   * 탭: 친구 (팔로잉/팔로워 관리 + 검색해서 팔로우)
   *   - 검색  GET /api/users/search?q=
   *   - 팔로잉 GET /api/users/:myId/following   · 팔로워 GET /api/users/:myId/followers
   *   - 팔로우 POST /api/users/:id/follow        · 언팔  DELETE /api/users/:id/follow
   * ===================================================================== */
  function renderFriends(panel) {
    panel.appendChild(el('h2', { class: 'wzs-sec__title' }, '친구 관리'));
    panel.appendChild(el('p', { class: 'wzs-sec__desc' }, '이름이나 닉네임으로 친구를 찾아 팔로우하고, 내 팔로잉·팔로워를 관리하세요.'));

    var myId = state.me && state.me.userId;

    function makerHref(u) {
      return '/maker.html?' + (u.slug ? 'slug=' + encodeURIComponent(u.slug) : 'id=' + encodeURIComponent(u.userId));
    }

    function selfLabel() {
      // 배경/테두리 없이 검은 글자만 (사용자 요청)
      return el('span', {
        class: 'wzs-self',
        style: 'color:#111;font-weight:700;font-size:13px;cursor:default;align-self:center;padding:0 4px',
        'aria-disabled': 'true',
      }, '본인');
    }

    function followBtn(u) {
      // 본인은 팔로우 대상이 아님 — 버튼 대신 클릭 불가한 '본인' 라벨.
      if (myId && u.userId === myId) return selfLabel();
      var btn = miniBtn(u.isFollowing ? '팔로잉' : '팔로우', function () {
        if (btn.hasAttribute('disabled')) return;
        btn.setAttribute('disabled', '');
        var req = u.isFollowing
          ? api.del('/users/' + encodeURIComponent(u.userId) + '/follow')
          : api.post('/users/' + encodeURIComponent(u.userId) + '/follow', {});
        req.then(function (r) {
          u.isFollowing = r ? !!r.following : !u.isFollowing;
          btn.textContent = u.isFollowing ? '팔로잉' : '팔로우';
          btn.classList.toggle('wzs-mini--ghost', u.isFollowing);
          btn.removeAttribute('disabled');
          loadFollowing();
        }).catch(function (e) {
          btn.removeAttribute('disabled');
          toast((e && e.message) || '처리에 실패했습니다');
        });
      }, u.isFollowing ? 'wzs-mini--ghost' : '');
      return btn;
    }

    function friendRow(u) {
      var href = makerHref(u);
      var av = el('a', { class: 'wzs-friend__av', href: href, 'aria-label': u.name || '프로필' });
      if (u.picture) av.appendChild(el('img', { src: u.picture, alt: '' }));
      else av.appendChild(el('span', { class: 'wzs-friend__avic', html: SVG.user }));
      var meta = el('a', { class: 'wzs-friend__meta', href: href });
      meta.appendChild(el('p', { class: 'wzs-friend__name' }, u.name || u.nickname || '사용자'));
      if (u.slug) meta.appendChild(el('p', { class: 'wzs-friend__sub' }, '@' + u.slug));
      return el('div', { class: 'wzs-friend' }, av, meta, followBtn(u));
    }

    /* 검색 */
    var searchIn = input({ type: 'search', placeholder: '이름 또는 닉네임으로 검색', autocomplete: 'off' });
    var resultWrap = el('div', { class: 'wzs-friend-list' });
    var searchFld = field({ label: '사용자 검색', control: searchIn });
    searchFld.classList.add('wzs-friend-search');
    panel.appendChild(searchFld);
    panel.appendChild(resultWrap);

    var searchTimer;
    searchIn.addEventListener('input', function () {
      clearTimeout(searchTimer);
      var q = searchIn.value.trim();
      if (!q) { resultWrap.replaceChildren(); return; }
      searchTimer = setTimeout(function () {
        api.get('/users/search?q=' + encodeURIComponent(q)).then(function (rows) {
          // 본인도 결과에 그대로 노출(친구row 의 followBtn 이 '본인' 라벨로 렌더). 필터하지 않음.
          rows = Array.isArray(rows) ? rows : [];
          if (!rows.length) { resultWrap.replaceChildren(el('div', { class: 'wzs-empty' }, '검색 결과가 없습니다.')); return; }
          resultWrap.replaceChildren.apply(resultWrap, rows.map(friendRow));
        }).catch(function () { resultWrap.replaceChildren(el('div', { class: 'wzs-empty' }, '검색에 실패했습니다.')); });
      }, 300);
    });

    /* 팔로잉 / 팔로워 */
    var followingTitle = el('h3', { class: 'wzs-friend-grouptitle' }, '팔로잉');
    var followingWrap = el('div', { class: 'wzs-friend-list' });
    var followersTitle = el('h3', { class: 'wzs-friend-grouptitle' }, '팔로워');
    var followersWrap = el('div', { class: 'wzs-friend-list' });
    panel.append(followingTitle, followingWrap, followersTitle, followersWrap);

    function loadFollowing() {
      if (!myId) return;
      api.get('/users/' + encodeURIComponent(myId) + '/following').then(function (rows) {
        rows = Array.isArray(rows) ? rows : [];
        followingTitle.textContent = '팔로잉 ' + rows.length;
        if (!rows.length) { followingWrap.replaceChildren(el('div', { class: 'wzs-empty' }, '아직 팔로우한 사람이 없어요.')); return; }
        followingWrap.replaceChildren.apply(followingWrap, rows.map(function (u) { u.isFollowing = true; return friendRow(u); }));
      }).catch(function () { followingWrap.replaceChildren(el('div', { class: 'wzs-empty' }, '팔로잉을 불러오지 못했습니다.')); });
    }
    function loadFollowers() {
      if (!myId) return;
      api.get('/users/' + encodeURIComponent(myId) + '/followers').then(function (rows) {
        rows = Array.isArray(rows) ? rows : [];
        followersTitle.textContent = '팔로워 ' + rows.length;
        if (!rows.length) { followersWrap.replaceChildren(el('div', { class: 'wzs-empty' }, '아직 나를 팔로우한 사람이 없어요.')); return; }
        followersWrap.replaceChildren.apply(followersWrap, rows.map(friendRow));
      }).catch(function () { followersWrap.replaceChildren(el('div', { class: 'wzs-empty' }, '팔로워를 불러오지 못했습니다.')); });
    }
    loadFollowing();
    loadFollowers();
  }

  /* =====================================================================
   * 탭 렌더링 디스패치
   * ===================================================================== */
  var RENDERERS = {
    profile: renderProfile,
    account: renderAccount,
    payment: renderPayment,
    address: renderAddress,
    friends: renderFriends,
    notification: renderNotification,
  };

  function rerenderPanel() {
    var panel = document.getElementById('wzs-panel');
    if (!panel) return;
    panel.innerHTML = '';
    var fn = RENDERERS[state.activeTab] || renderProfile;
    fn(panel);
  }

  function setTab(key, push) {
    if (!RENDERERS[key]) key = 'profile';
    state.activeTab = key;
    // 탭 활성 표시
    var tabs = root.querySelectorAll('.wzs-tab');
    tabs.forEach(function (t) { t.classList.toggle('is-active', t.dataset.key === key); });
    if (push) {
      var tab = TABS.filter(function (t) { return t.key === key; })[0];
      if (tab) { try { history.replaceState(null, '', tab.hash); } catch (_) { location.hash = tab.hash; } }
    }
    rerenderPanel();
  }

  function tabFromHash() {
    var h = (location.hash || '').toLowerCase();
    var found = TABS.filter(function (t) { return t.hash === h; })[0];
    return found ? found.key : 'profile';
  }

  /* =====================================================================
   * 셸 렌더 (제목 + 탭바 + 패널)
   * ===================================================================== */
  function renderShell() {
    root.innerHTML = '';
    root.appendChild(el('h1', { class: 'wzs-title' }, '설정'));

    if (!state.me) {
      root.appendChild(el('div', { class: 'wzs-guest' },
        el('p', {}, '설정을 보려면 로그인이 필요합니다.'),
        el('a', { class: 'wz-btn wz-btn--primary', href: '/login.html' }, '로그인하기')));
      return;
    }

    var tabBar = el('div', { class: 'wzs-tabs', role: 'tablist' });
    TABS.forEach(function (t) {
      var btn = el('button', { class: 'wzs-tab', type: 'button', role: 'tab' }, t.label);
      btn.dataset.key = t.key;
      btn.addEventListener('click', function () { setTab(t.key, true); });
      tabBar.appendChild(btn);
    });
    root.appendChild(tabBar);

    root.appendChild(el('div', { class: 'wzs-panel', id: 'wzs-panel' }));

    setTab(tabFromHash(), false);
  }

  // 해시 변경(브라우저 뒤로/앞으로, 직접 링크) 대응
  window.addEventListener('hashchange', function () {
    if (!state.me) return;
    setTab(tabFromHash(), false);
  });

  /* =====================================================================
   * 부트스트랩
   * ===================================================================== */
  root.appendChild(el('h1', { class: 'wzs-title' }, '설정'));
  root.appendChild(el('div', { class: 'wzs-loading' }, '불러오는 중...'));

  WZ.fetchMe().then(function (me) {
    state.me = me || null;
    renderShell();
  }).catch(function () {
    state.me = null;
    renderShell();
  });
})();
