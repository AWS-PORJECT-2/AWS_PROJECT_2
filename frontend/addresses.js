/**
 * 배송지 관리 페이지 (wz 디자인 시스템).
 * - 펀딩(후원) 결제 흐름에서 도달하는 사용자 소유 배송지 CRUD.
 * - 전역 WZ(wz-core.js) · window.api 사용. 데이터: /api/addresses
 *     GET    /addresses               목록
 *     POST   /addresses               추가
 *     PATCH  /addresses/:id           수정
 *     DELETE /addresses/:id           삭제
 *     PATCH  /addresses/:id/default   기본 배송지 설정
 * - 필드/검증은 설정 페이지 배송지 탭(wz-settings.js)과 동일:
 *     받는 사람 · 휴대폰(숫자만 자동 하이픈) · 주소(다음 우편번호 검색) · 상세주소 · 배송 특이사항(메모).
 * - 색은 tokens.css 변수만(보라). 이모지 금지 — 아이콘은 인라인 SVG(stroke=currentColor).
 * - 사용자/외부 데이터는 textContent 로만 삽입(XSS 방어).
 */
(function () {
  'use strict';
  var W = window.WZ;
  var el = W.el;
  var api = window.api;

  /* ===== 인라인 SVG (stroke/fill=currentColor) ===== */
  var SVG = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  };

  /* ===== 상태 ===== */
  var state = { addresses: null };
  var listEl = document.getElementById('adrList');
  var addBtn = document.getElementById('btnAdd');

  /* =====================================================================
   * 유틸: 숫자만 + 휴대폰 자동 하이픈 (wz-settings 와 동일)
   * ===================================================================== */
  function digitsOnly(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function formatPhone(raw) {
    var d = digitsOnly(raw).slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 7) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length < 11) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7, 11);
  }
  function bindFormatter(input, fmt) {
    input.addEventListener('input', function () {
      var v = fmt(input.value);
      if (v !== input.value) input.value = v;
    });
  }

  // detailAddress 안에 합쳐진 "상세 / 메모" 분리 (wz-settings 와 동일 규약)
  function splitDetailMemo(detailAddress) {
    var s = String(detailAddress || '');
    if (!s) return { detail: '', memo: '' };
    var idx = s.indexOf(' / ');
    if (idx >= 0) return { detail: s.slice(0, idx).trim(), memo: s.slice(idx + 3).trim() };
    if (s.indexOf('/ ') === 0) return { detail: '', memo: s.slice(2).trim() };
    return { detail: s.trim(), memo: '' };
  }

  /* =====================================================================
   * 토스트
   * ===================================================================== */
  var toastNode;
  function toast(msg) {
    if (!toastNode) { toastNode = el('div', { class: 'adr-toast' }); document.body.appendChild(toastNode); }
    toastNode.textContent = msg;
    toastNode.classList.add('is-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastNode.classList.remove('is-show'); }, 2200);
  }

  /* =====================================================================
   * 다음 우편번호 — 스크립트 동적 로드 후 팝업 (wz-settings 와 동일)
   * ===================================================================== */
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
   * 개인정보 동의 — WZConsent.requirePrivacy() 우선, 없으면 인라인 체크박스.
   *   returns Promise<boolean|null> (null = 인라인 체크박스로 처리)
   * ===================================================================== */
  function requirePrivacy() {
    if (window.WZConsent && typeof window.WZConsent.requirePrivacy === 'function') {
      try {
        var r = window.WZConsent.requirePrivacy();
        return (r && typeof r.then === 'function') ? r : Promise.resolve(!!r);
      } catch (_) { /* fall through */ }
    }
    return Promise.resolve(null);
  }

  /* =====================================================================
   * 폼 필드 헬퍼
   * ===================================================================== */
  function field(opts) {
    var f = el('div', { class: 'adr-fld' });
    if (opts.label) {
      var lab = el('label', { class: 'adr-fld__label' }, opts.label);
      if (opts.required) lab.appendChild(el('span', { class: 'req' }, '*'));
      f.appendChild(lab);
    }
    f.appendChild(opts.control);
    var err = el('div', { class: 'adr-fld__err' });
    f.appendChild(err);
    f.fail = function (msg) { err.textContent = msg; err.classList.add('is-show'); };
    f.clear = function () { err.textContent = ''; err.classList.remove('is-show'); };
    return f;
  }
  function input(attrs) { return el('input', Object.assign({ class: 'adr-input', type: 'text', autocomplete: 'off' }, attrs || {})); }
  function miniBtn(label, onClick, cls) {
    var b = el('button', { class: 'adr-mini' + (cls ? ' ' + cls : ''), type: 'button' }, label);
    b.addEventListener('click', onClick);
    return b;
  }

  /* =====================================================================
   * 모달 (제목 + 본문 노드 + 푸터 버튼)
   *   opts: { title, body(node), primaryLabel, onPrimary(returns false to keep open) }
   * 반환: { close(), primaryBtn }
   * ===================================================================== */
  function openModal(opts) {
    var back = el('div', { class: 'adr-modal-back' });
    var modal = el('div', { class: 'adr-modal' });
    var closeBtn = el('button', { class: 'adr-modal__close', type: 'button', 'aria-label': '닫기', html: SVG.close });
    closeBtn.addEventListener('click', close);
    var head = el('div', { class: 'adr-modal__head' },
      el('h2', { class: 'adr-modal__title' }, opts.title || ''), closeBtn);
    var body = el('div', { class: 'adr-modal__body' }, opts.body);
    modal.append(head, body);

    var primaryBtn = null;
    if (opts.primaryLabel) {
      var cancel = el('button', { class: 'wz-btn wz-btn--ghost', type: 'button' }, '취소');
      cancel.addEventListener('click', close);
      primaryBtn = el('button', { class: 'wz-btn wz-btn--primary', type: 'button' }, opts.primaryLabel);
      primaryBtn.addEventListener('click', function () {
        var r = opts.onPrimary ? opts.onPrimary() : true;
        if (r === false) return;
        if (r && typeof r.then === 'function') return; // async handler closes itself
        close();
      });
      var foot = el('div', { class: 'adr-modal__foot' }, cancel, primaryBtn);
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
    return { close: close, primaryBtn: primaryBtn };
  }

  /* =====================================================================
   * 목록 렌더링
   * ===================================================================== */
  function renderList() {
    listEl.innerHTML = '';
    var items = state.addresses || [];
    if (!items.length) {
      listEl.appendChild(el('div', { class: 'adr-empty' }, '등록된 배송지가 없습니다. [배송지 추가] 로 첫 배송지를 등록해 주세요.'));
      return;
    }
    items.forEach(function (a) { listEl.appendChild(addressCard(a)); });
  }

  function addressCard(a) {
    var parts = splitDetailMemo(a.detailAddress);
    var card = el('div', { class: 'adr-card' + (a.isDefault ? ' is-default' : '') });
    var ic = el('div', { class: 'adr-card__ic', html: SVG.pin });
    var body = el('div', { class: 'adr-card__body' });

    var title = el('div', { class: 'adr-card__title' });
    title.appendChild(document.createTextNode(
      (a.recipientName || '') + (a.recipientPhone ? '  ·  ' + formatPhone(a.recipientPhone) : '')));
    if (a.isDefault) title.appendChild(el('span', { class: 'adr-badge' }, '기본'));
    body.appendChild(title);

    var addrLine = el('div', { class: 'adr-card__line' });
    addrLine.textContent = '(' + (a.postalCode || '') + ') ' + (a.roadAddress || '') + (parts.detail ? ' ' + parts.detail : '');
    body.appendChild(addrLine);

    if (parts.memo) {
      var memoLine = el('div', { class: 'adr-card__meta' });
      memoLine.textContent = '배송 메모: ' + parts.memo;
      body.appendChild(memoLine);
    }

    var actions = el('div', { class: 'adr-card__actions' });
    if (!a.isDefault) actions.appendChild(miniBtn('기본으로 설정', function () { setDefaultAddress(a.id); }, 'adr-mini--ghost'));
    actions.appendChild(miniBtn('수정', function () { openAddressForm(a); }));
    actions.appendChild(miniBtn('삭제', function () { confirmDelete(a); }, 'adr-mini--danger'));
    body.appendChild(actions);

    card.append(ic, body);
    return card;
  }

  function refresh() {
    return api.get('/addresses').then(function (rows) {
      state.addresses = Array.isArray(rows) ? rows : [];
      renderList();
    });
  }

  /* =====================================================================
   * 기본 배송지 설정
   * ===================================================================== */
  function setDefaultAddress(id) {
    api.patch('/addresses/' + encodeURIComponent(id) + '/default')
      .then(refresh)
      .then(function () { toast('기본 배송지가 변경되었습니다'); })
      .catch(function (e) { toast((e && e.message) || '변경에 실패했습니다'); });
  }

  /* =====================================================================
   * 삭제
   * ===================================================================== */
  function confirmDelete(a) {
    var body = el('p', { style: 'font-size:14px;color:var(--c-text-sub);line-height:1.6;margin:0' });
    body.textContent = (a.recipientName || '이 배송지') + ' 배송지를 삭제할까요?';
    var m = openModal({
      title: '배송지 삭제', body: body, primaryLabel: '삭제',
      onPrimary: function () {
        m.primaryBtn.disabled = true; m.primaryBtn.textContent = '삭제 중...';
        api.del('/addresses/' + encodeURIComponent(a.id))
          .then(refresh)
          .then(function () { m.close(); toast('배송지가 삭제되었습니다'); })
          .catch(function (e) {
            m.primaryBtn.disabled = false; m.primaryBtn.textContent = '삭제';
            toast((e && e.message) || '삭제에 실패했습니다');
          });
        return false;
      },
    });
  }

  /* =====================================================================
   * 추가/수정 모달 (받는 사람 / 휴대폰 / 주소 / 상세주소 / 메모)
   * ===================================================================== */
  function openAddressForm(editing) {
    var existing = editing ? splitDetailMemo(editing.detailAddress) : { detail: '', memo: '' };

    var nameInput = input({ placeholder: '받는 사람 이름', maxlength: '50', value: editing ? (editing.recipientName || '') : '' });
    var fName = field({ label: '받는 사람', required: true, control: nameInput });

    var phoneInput = input({ type: 'tel', inputmode: 'numeric', placeholder: '010-1234-5678', maxlength: '13', value: editing ? formatPhone(editing.recipientPhone || '') : '' });
    bindFormatter(phoneInput, formatPhone);
    var fPhone = field({ label: '휴대폰 번호', required: true, control: phoneInput });

    // 주소 (우편번호 + 도로명) — 검색 버튼으로 다음 우편번호 팝업
    var postalInput = input({ placeholder: '우편번호', readonly: 'readonly', value: editing ? (editing.postalCode || '') : '' });
    var searchBtn = miniBtn('주소 검색', null, 'adr-mini--ghost');
    var roadInput = input({ placeholder: '도로명 주소 (검색으로 입력)', readonly: 'readonly', value: editing ? (editing.roadAddress || '') : '' });
    var jibun = { value: editing ? (editing.jibunAddress || '') : '' };
    var fPostal = field({ label: '우편번호', required: true, control: el('div', { class: 'adr-fld__row' }, postalInput, searchBtn) });
    var fRoad = field({ label: '도로명 주소', required: true, control: roadInput });

    var detailInput = input({ placeholder: '상세주소 (동·호수 등)', maxlength: '100', value: existing.detail });
    var fDetail = field({ label: '상세주소', control: detailInput });

    var memoInput = input({ placeholder: '부재 시 경비실에 맡겨주세요 등', maxlength: '100', value: existing.memo });
    var fMemo = field({ label: '배송 특이사항', control: memoInput });

    searchBtn.addEventListener('click', function () {
      openPostcode(function (data) {
        postalInput.value = data.zonecode || '';
        roadInput.value = data.roadAddress || data.address || '';
        jibun.value = data.jibunAddress || '';
        fPostal.clear(); fRoad.clear();
        setTimeout(function () { detailInput.focus(); }, 60);
      });
    });

    var bodyWrap = el('div', { class: 'adr-form' },
      el('div', { class: 'adr-form__grid' }, fName, fPhone),
      fPostal,
      fRoad,
      el('div', { class: 'adr-form__grid' }, fDetail, fMemo));

    // 개인정보 수집·이용 동의 (필수) — WZConsent 없으면 인라인 체크박스
    var inlineChk = null;
    if (!(window.WZConsent && typeof window.WZConsent.requirePrivacy === 'function')) {
      inlineChk = el('input', { type: 'checkbox' });
      var more = el('a', { href: '/privacy.html', target: '_blank', rel: 'noopener' }, '자세히');
      var consentLabel = el('label', { class: 'adr-consent' },
        inlineChk,
        el('span', {}, '(필수) 배송을 위한 개인정보 수집·이용에 동의합니다. ', more));
      bodyWrap.appendChild(consentLabel);
    }

    var m = openModal({
      title: editing ? '배송지 수정' : '배송지 추가', body: bodyWrap, primaryLabel: '저장',
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
        // DB detail_address VARCHAR(200) 초과 시 저장 실패(22001) → 200자로 잘라 안전 저장.
        var mergedDetail = memo ? (detail ? detail + ' / ' + memo : '/ ' + memo) : detail;
        if (mergedDetail && mergedDetail.length > 200) mergedDetail = mergedDetail.slice(0, 200);

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
        requirePrivacy().then(function (consented) {
          if (consented === false) { throw new Error('__CONSENT_CANCELLED__'); }
          if (consented === null) {
            if (inlineChk && !inlineChk.checked) { throw new Error('__CONSENT_REQUIRED__'); }
          }
          if (editing) {
            return api.patch('/addresses/' + encodeURIComponent(editing.id), payload);
          }
          return api.post('/addresses', payload);
        }).then(refresh).then(function () {
          m.close(); toast(editing ? '배송지가 수정되었습니다' : '배송지가 등록되었습니다');
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

  /* =====================================================================
   * 초기화 — 로그인 필수(사용자 소유 배송지). 미로그인은 로그인 페이지로.
   * ===================================================================== */
  function init() {
    addBtn.addEventListener('click', function () { openAddressForm(null); });

    W.fetchMe().then(function (me) {
      if (!me) { location.href = '/login.html'; return; }
      addBtn.style.display = '';
      refresh().catch(function () {
        listEl.innerHTML = '';
        listEl.appendChild(el('div', { class: 'adr-error' }, '배송지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'));
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
