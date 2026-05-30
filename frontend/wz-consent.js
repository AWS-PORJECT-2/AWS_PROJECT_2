/* =====================================================================
 * 두띵 — 동의/약관 시스템. 전역 window.WZConsent.
 *
 *  WZConsent.open({ items, title?, sub?, confirmText?, gate? }) -> Promise<map|null>
 *    items: [{ key, label, required:bool, link? }]
 *    "모두 동의" 체크 + 필수 미동의 시 확인 비활성. resolve 값 예:
 *      { terms:true, privacy:true, age14:true, marketing:false }
 *    사용자가 취소/닫기 -> resolve(null). gate:true 면 닫기 불가(필수 강제).
 *
 *  WZConsent.ensure() -> 가입(첫 로그인) 게이트.
 *    GET /api/auth/me (silentAuthFail) 로 termsAgreedAt 없으면 필수 동의 강제,
 *    완료 시 POST /api/me/consent 저장. 비로그인이면 아무것도 안 함.
 *
 *  WZConsent.requirePrivacy() -> 개인정보 수집·이용 동의(필수) 1건. resolve(true|false).
 *  WZConsent.requireCreator() -> 창작자 이용약관·전자상거래 동의(필수) 1건. resolve(true|false).
 *
 * 의존: window.api(get/post). XSS: 사용자/외부 데이터 없음(라벨은 정적). SVG 인라인. 이모지 금지.
 * ===================================================================== */
(function () {
  if (window.WZConsent) return;

  var ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var ICON_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z"/><path d="M9.5 12l1.8 1.8 3.4-3.6"/></svg>';

  /* el 헬퍼 — WZ.el 있으면 재사용, 없으면 자체 구현(동일 시그니처) */
  function el(tag, props) {
    if (window.WZ && typeof window.WZ.el === 'function') {
      return window.WZ.el.apply(null, arguments);
    }
    var n = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null) return;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'onClick') n.addEventListener('click', v);
      else n.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var kids = arguments[i];
      (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
        if (c == null || c === false) return;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return n;
  }

  /* ===== 핵심: 동의 모달 ===== */
  function open(opts) {
    opts = opts || {};
    var items = (opts.items || []).filter(Boolean);
    var gate = !!opts.gate;

    return new Promise(function (resolve) {
      var settled = false;
      function finish(val) {
        if (settled) return;
        settled = true;
        over.classList.remove('is-open');
        document.removeEventListener('keydown', onKey);
        setTimeout(function () { if (over.parentNode) over.parentNode.removeChild(over); }, 200);
        document.documentElement.style.overflow = prevHtmlOverflow;
        resolve(val);
      }

      /* 결과 맵 (key->bool) */
      var state = {};
      items.forEach(function (it) { state[it.key] = false; });

      var over = el('div', { class: 'wzc-over' + (gate ? ' wzc-over--gate' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || '약관 동의' });
      var box = el('div', { class: 'wzc-box' });

      /* --- 헤더 --- */
      var head = el('div', { class: 'wzc-head' });
      head.appendChild(el('span', { class: 'wzc-head__badge' }, el('span', { html: ICON_SHIELD }), opts.badge || '약관 동의'));
      head.appendChild(el('h2', { class: 'wzc-title' }, opts.title || '서비스 이용에 동의해 주세요'));
      if (opts.sub) head.appendChild(el('p', { class: 'wzc-sub' }, opts.sub));
      if (!gate) {
        var closeBtn = el('button', { class: 'wzc-close', type: 'button', 'aria-label': '닫기', html: ICON_CLOSE });
        closeBtn.addEventListener('click', function () { finish(null); });
        head.appendChild(closeBtn);
      }
      box.appendChild(head);

      /* --- 본문 --- */
      var body = el('div', { class: 'wzc-body' });

      /* 모두 동의 */
      var allCheck = el('input', { type: 'checkbox', class: 'wzc-check wzc-check--all', 'aria-label': '모두 동의' });
      var allRow = el('label', { class: 'wzc-all' },
        allCheck,
        el('span', {},
          el('span', { class: 'wzc-all__text' }, '약관 전체 동의'),
          el('span', { class: 'wzc-all__hint' }, '필수 및 선택 항목에 모두 동의합니다.')
        )
      );
      body.appendChild(allRow);
      body.appendChild(el('div', { class: 'wzc-divider' }));

      /* 개별 항목 */
      var checks = {};
      var list = el('ul', { class: 'wzc-list' });
      items.forEach(function (it) {
        var cb = el('input', { type: 'checkbox', class: 'wzc-check', id: 'wzc-' + it.key });
        checks[it.key] = cb;

        var label = el('label', { class: 'wzc-item__label', for: 'wzc-' + it.key });
        label.appendChild(el('span', { class: it.required ? 'wzc-item__req' : 'wzc-item__opt' }, it.required ? '(필수)' : '(선택)'));
        label.appendChild(el('span', {}, it.label));

        var li = el('li', { class: 'wzc-item' }, cb, label);
        if (it.link) {
          var view = el('a', { class: 'wzc-item__view', href: it.link, target: '_blank', rel: 'noopener' }, '보기', el('span', { html: ICON_CHEVRON }));
          li.appendChild(view);
        }

        cb.addEventListener('change', function () { state[it.key] = cb.checked; sync(); });
        list.appendChild(li);
      });
      body.appendChild(list);
      box.appendChild(body);

      /* --- 푸터 --- */
      var foot = el('div', { class: 'wzc-foot' });
      foot.appendChild(el('p', { class: 'wzc-foot__note' }, opts.note || '필수 항목에 동의하셔야 서비스를 이용할 수 있습니다. 동의 내역은 마이페이지 설정에서 확인할 수 있습니다.'));
      var confirmBtn = el('button', { class: 'dt-btn dt-btn--primary dt-btn--lg', type: 'button' }, opts.confirmText || '동의하고 계속하기');
      confirmBtn.addEventListener('click', function () {
        if (confirmBtn.disabled) return;
        finish(Object.assign({}, state));
      });
      foot.appendChild(confirmBtn);
      box.appendChild(foot);

      over.appendChild(box);

      /* 배경 클릭으로 닫기(게이트 아닐 때만) */
      over.addEventListener('mousedown', function (e) { if (!gate && e.target === over) finish(null); });

      /* --- 동기화: 필수 충족 여부 -> 확인 버튼, 모두동의 체크 --- */
      function requiredOk() {
        return items.every(function (it) { return !it.required || state[it.key]; });
      }
      function allOn() {
        return items.length > 0 && items.every(function (it) { return state[it.key]; });
      }
      function sync() {
        confirmBtn.disabled = !requiredOk();
        var every = allOn();
        allCheck.checked = every;
        allRow.classList.toggle('is-on', every);
      }
      allCheck.addEventListener('change', function () {
        var on = allCheck.checked;
        items.forEach(function (it) { state[it.key] = on; if (checks[it.key]) checks[it.key].checked = on; });
        sync();
      });

      function onKey(e) {
        if (e.key === 'Escape' && !gate) { e.preventDefault(); finish(null); }
      }
      document.addEventListener('keydown', onKey);

      var prevHtmlOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      document.body.appendChild(over);
      // 트랜지션 트리거
      requestAnimationFrame(function () { over.classList.add('is-open'); });
      sync();
    });
  }

  /* ===== 가입(첫 로그인) 게이트 ===== */
  var GATE_ITEMS = [
    { key: 'age14', label: '만 14세 이상입니다', required: true },
    { key: 'terms', label: '두띵 이용약관 동의', required: true, link: '/terms.html' },
    { key: 'privacy', label: '개인정보 수집·이용 동의', required: true, link: '/privacy.html' },
    { key: 'marketing', label: '마케팅 정보 수신 동의', required: false }
  ];

  async function ensure() {
    var me;
    try {
      me = await window.api.get('/auth/me', { silentAuthFail: true });
    } catch (_) {
      return null; // 비로그인 -> 아무것도 안 함
    }
    if (!me) return null;
    if (me.termsAgreedAt) return me; // 이미 동의한 기존 회원

    var result = await open({
      gate: true,
      badge: '환영합니다',
      title: '두띵 시작 전, 약관에 동의해 주세요',
      sub: '국민대학교 굿즈 크라우드펀딩 플랫폼 두띵을 이용하려면 아래 항목에 동의가 필요합니다.',
      items: GATE_ITEMS,
      confirmText: '동의하고 두띵 시작하기',
      note: '만 14세 미만은 가입할 수 없습니다. 선택 항목 미동의 시에도 서비스 이용에는 제한이 없습니다.'
    });
    if (!result) return me; // gate 라 사실상 도달 불가지만 방어

    try {
      var saved = await window.api.post('/me/consent', {
        terms: !!result.terms,
        privacy: !!result.privacy,
        age14: !!result.age14,
        marketing: !!result.marketing
      });
      if (saved) {
        me.termsAgreedAt = saved.termsAgreedAt || new Date().toISOString();
        me.marketingOptIn = !!saved.marketingOptIn;
      }
    } catch (_) { /* 저장 실패해도 흐름은 유지 — 다음 진입 시 다시 시도 */ }
    return me;
  }

  /* ===== 단일 필수 동의 헬퍼 (주소 등록 / 프로젝트 만들기 등) ===== */
  async function requireSingle(item, opts) {
    opts = opts || {};
    var result = await open({
      badge: opts.badge,
      title: opts.title,
      sub: opts.sub,
      items: [item],
      confirmText: opts.confirmText || '동의',
      note: opts.note
    });
    return !!(result && result[item.key]);
  }

  function requirePrivacy() {
    return requireSingle(
      { key: 'privacy', label: '개인정보 수집·이용 동의', required: true, link: '/privacy.html' },
      {
        badge: '개인정보 동의',
        title: '배송을 위해 개인정보 수집에 동의해 주세요',
        sub: '입력하신 이름·연락처·주소는 주문 상품의 배송 처리 목적으로만 이용되며, 목적 달성 후 관련 법령에 따라 파기됩니다.',
        confirmText: '동의하고 계속'
      }
    );
  }

  function requireCreator() {
    return requireSingle(
      { key: 'creator', label: '창작자 이용약관·전자상거래 판매자 동의', required: true, link: '/terms.html' },
      {
        badge: '창작자 동의',
        title: '프로젝트를 시작하려면 창작자 약관에 동의해 주세요',
        sub: '창작자는 전자상거래법상 판매자로서 상품 정보, 배송, 환불에 대한 책임을 부담합니다. 두띵은 통신판매중개자입니다.',
        confirmText: '동의하고 프로젝트 만들기'
      }
    );
  }

  window.WZConsent = {
    open: open,
    ensure: ensure,
    requirePrivacy: requirePrivacy,
    requireCreator: requireCreator
  };
})();
