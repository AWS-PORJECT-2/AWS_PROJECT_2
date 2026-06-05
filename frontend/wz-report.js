/* =====================================================================
 * 두띵 — 공용 신고 모달 (전역 window.WZReport)
 *
 * 사용:
 *   WZReport.open({ targetType:'maker'|'project', targetId, targetLabel })
 *     - targetType : 'maker'(메이커 신고) | 'project'(게시글 신고)
 *     - targetId   : 대상 식별자(메이커 userId 또는 펀드 id)
 *     - targetLabel: 화면 표시용 라벨(메이커명 / 펀드 제목) — XSS 안전(textContent)
 *
 * 동작:
 *   사유 카테고리 select(spam/abuse/fraud/sexual/copyright/privacy/etc) 선택.
 *   '기타(etc)' 선택 시에만 상세 textarea 필수 노출. 그 외엔 상세 입력 선택적.
 *   [신고] → POST /api/reports { targetType, targetId, reasonCategory, detail }.
 *     · 성공 → "신고가 접수되었습니다" 토스트 + 닫기
 *     · 401  → 로그인 페이지로(미로그인)
 *     · 400 SELF_REPORT → "본인은 신고할 수 없습니다"
 *     · etc 인데 detail 비면 제출 막고 안내
 *
 * 규칙: Vanilla JS, 전역 window.WZ / window.api 재사용. 이모지 금지(SVG).
 *       색은 tokens.css 변수. 사용자값은 textContent 로만 삽입(XSS 안전).
 *       스크롤 잠금은 닫기 경로에서 반드시 복원(누수 금지).
 * ===================================================================== */
(function () {
  var W = window.WZ || {};

  /* 신고 사유 — value 는 영문 enum, 라벨은 한글(백엔드 계약과 동일) */
  var REASONS = [
    { value: 'spam', label: '스팸·광고' },
    { value: 'abuse', label: '욕설·비방' },
    { value: 'fraud', label: '사기·허위정보' },
    { value: 'sexual', label: '음란성·부적절' },
    { value: 'copyright', label: '저작권 침해' },
    { value: 'privacy', label: '개인정보 노출' },
    { value: 'etc', label: '기타' },
  ];

  var FLAG_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>';
  var CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  var overlayRef = null;       // 현재 열린 오버레이
  var prevBodyOverflow = '';   // 닫을 때 복원할 body overflow
  var prevHtmlOverflow = '';   // 닫을 때 복원할 html overflow
  var keyHandler = null;

  /* el 헬퍼 — WZ.el 우선, 없으면 폴백(독립 동작 보장) */
  function el(tag, props) {
    if (W && typeof W.el === 'function') {
      var args = Array.prototype.slice.call(arguments, 2);
      return W.el.apply(null, [tag, props].concat(args));
    }
    var n = document.createElement(tag);
    props = props || {};
    for (var k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      var v = props[k];
      if (v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    var kids = Array.prototype.slice.call(arguments, 2);
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c == null || c === false) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }

  /* 토스트 — 페이지 전용 경량 구현(wz-report.css) */
  var toastTimer = null;
  function toast(msg) {
    var ex = document.querySelector('.wz-rp-toast');
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
    var t = el('div', { class: 'wz-rp-toast' }, String(msg == null ? '' : msg));
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-on'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('is-on');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
    }, 2600);
  }

  /* 스크롤 잠금/복원 — 닫기 경로에서 반드시 복원(누수 금지) */
  function lockScroll() {
    prevBodyOverflow = document.body.style.overflow;
    prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }
  function unlockScroll() {
    document.body.style.overflow = prevBodyOverflow;
    document.documentElement.style.overflow = prevHtmlOverflow;
  }

  function close() {
    if (!overlayRef) return;
    var overlay = overlayRef;
    overlayRef = null;
    overlay.classList.remove('is-open');
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    // 스크롤 복원은 즉시(누수 방지) — 애니메이션 동안에도 안전
    unlockScroll();
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 220);
  }

  function open(opts) {
    opts = opts || {};
    var ALLOWED_TT = { maker: 1, project: 1, board_post: 1 };
    var targetType = ALLOWED_TT[opts.targetType] ? opts.targetType : 'project';
    var targetId = opts.targetId;
    var targetLabel = opts.targetLabel;

    if (targetId == null || String(targetId) === '') {
      // 대상이 없으면 열지 않음(잘못된 호출 방어)
      return;
    }
    // 중복 오픈 방지
    if (overlayRef) close();

    var overlay = el('div', { class: 'wz-rp', role: 'dialog', 'aria-modal': 'true', 'aria-label': '신고하기' });

    var backdrop = el('div', { class: 'wz-rp__backdrop' });
    backdrop.addEventListener('click', close);
    overlay.appendChild(backdrop);

    var box = el('div', { class: 'wz-rp__box' });

    /* 헤더 */
    var head = el('div', { class: 'wz-rp__head' });
    var title = el('div', { class: 'wz-rp__title' });
    title.appendChild(el('span', { html: FLAG_SVG }));
    title.appendChild(el('span', {}, '신고하기'));
    head.appendChild(title);
    var closeBtn = el('button', { class: 'wz-rp__close', type: 'button', 'aria-label': '닫기', html: CLOSE_SVG });
    closeBtn.addEventListener('click', close);
    head.appendChild(closeBtn);
    box.appendChild(head);

    /* 본문 */
    var body = el('div', { class: 'wz-rp__body' });

    /* 대상 표시(targetLabel — textContent 안전) */
    if (targetLabel != null && String(targetLabel).trim() !== '') {
      var tgt = el('div', { class: 'wz-rp__target' });
      tgt.appendChild(el('span', { class: 'wz-rp__target-label' },
        targetType === 'maker' ? '신고 대상 메이커' : '신고 대상 게시글'));
      tgt.appendChild(el('span', { class: 'wz-rp__target-name' }, String(targetLabel)));
      body.appendChild(tgt);
    }

    /* 사유 카테고리 select */
    var reasonField = el('div', { class: 'wz-rp__field' });
    var reasonLabel = el('label', { class: 'wz-rp__flabel', for: 'wz-rp-reason' });
    reasonLabel.appendChild(el('span', {}, '신고 사유'));
    reasonLabel.appendChild(el('span', { class: 'wz-rp__req', 'aria-hidden': 'true' }, '*'));
    reasonField.appendChild(reasonLabel);

    var select = el('select', { class: 'wz-rp__select', id: 'wz-rp-reason' });
    REASONS.forEach(function (r) {
      // 라벨은 신뢰 가능한 상수지만 textContent 로 안전하게 삽입
      var opt = el('option', { value: r.value }, r.label);
      select.appendChild(opt);
    });
    reasonField.appendChild(select);
    body.appendChild(reasonField);

    /* 상세 textarea — etc 일 때만 노출(필수). 다른 사유면 선택적 노출 */
    var detailField = el('div', { class: 'wz-rp__field' });
    var detailLabel = el('label', { class: 'wz-rp__flabel', for: 'wz-rp-detail' });
    var detailLabelText = el('span', {}, '상세 내용');
    var detailReq = el('span', { class: 'wz-rp__req', 'aria-hidden': 'true' }, '*');
    detailLabel.appendChild(detailLabelText);
    detailLabel.appendChild(detailReq);
    detailField.appendChild(detailLabel);
    var textarea = el('textarea', {
      class: 'wz-rp__textarea',
      id: 'wz-rp-detail',
      rows: '4',
      placeholder: '신고 사유를 자세히 적어주세요',
      maxlength: '1000',
    });
    detailField.appendChild(textarea);
    var err = el('p', { class: 'wz-rp__err' }, '기타 사유는 상세 내용을 입력해 주세요.');
    detailField.appendChild(err);
    body.appendChild(detailField);

    // etc 여부에 따라 상세 필수 표시/선택 표시 전환. etc 가 아니면 상세는 항상 노출하되 선택적.
    function syncDetail() {
      var isEtc = select.value === 'etc';
      detailReq.style.display = isEtc ? '' : 'none';
      if (!isEtc) {
        detailLabelText.textContent = '상세 내용 (선택)';
        err.classList.remove('is-on');
      } else {
        detailLabelText.textContent = '상세 내용';
      }
    }
    syncDetail();
    select.addEventListener('change', syncDetail);
    textarea.addEventListener('input', function () {
      if (textarea.value.trim() !== '') err.classList.remove('is-on');
    });

    /* 버튼 */
    var btns = el('div', { class: 'wz-rp__btns' });
    var cancelBtn = el('button', { class: 'wz-rp__btn wz-rp__btn--ghost', type: 'button' }, '취소');
    cancelBtn.addEventListener('click', close);
    var submitBtn = el('button', { class: 'wz-rp__btn wz-rp__btn--primary', type: 'button' }, '신고');
    btns.appendChild(cancelBtn);
    btns.appendChild(submitBtn);
    body.appendChild(btns);

    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlayRef = overlay;
    lockScroll();

    // ESC 닫기
    keyHandler = function (e) {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', keyHandler);

    // reflow 후 전환 적용
    requestAnimationFrame(function () { overlay.classList.add('is-open'); });
    // 포커스 편의
    setTimeout(function () { try { select.focus(); } catch (_) {} }, 60);

    /* 제출 */
    function submit() {
      var reasonCategory = select.value;
      var detail = textarea.value.trim();

      // etc 인데 detail 비면 제출 막고 안내
      if (reasonCategory === 'etc' && detail === '') {
        err.classList.add('is-on');
        try { textarea.focus(); } catch (_) {}
        return;
      }

      if (!window.api || typeof window.api.post !== 'function') {
        toast('신고를 보낼 수 없어요. 잠시 후 다시 시도해 주세요.');
        return;
      }

      submitBtn.disabled = true;
      cancelBtn.disabled = true;

      var payload = {
        targetType: targetType,
        targetId: targetId,
        reasonCategory: reasonCategory,
      };
      if (detail !== '') payload.detail = detail;

      // silentAuthFail: 미로그인은 직접 로그인 페이지로 보냄(아래 catch).
      window.api.post('/reports', payload, { silentAuthFail: true })
        .then(function () {
          close();
          toast('신고가 접수되었습니다');
        })
        .catch(function (e) {
          submitBtn.disabled = false;
          cancelBtn.disabled = false;
          var status = e && e.status;
          var code = e && e.code;
          if (status === 401 || code === 'NOT_AUTHENTICATED') {
            // 미로그인 → 로그인 페이지로(복귀 경로 포함)
            var ret = window.location.pathname + window.location.search;
            window.location.href = '/login.html?return=' + encodeURIComponent(ret);
            return;
          }
          if (status === 400 && code === 'SELF_REPORT') {
            toast((e && e.message) || '본인은 신고할 수 없습니다');
            return;
          }
          toast((e && e.message) ? e.message : '신고 접수에 실패했어요. 잠시 후 다시 시도해 주세요.');
        });
    }
    submitBtn.addEventListener('click', submit);
  }

  /* ===== 전역 노출 ===== */
  window.WZReport = { open: open, close: close };
})();
