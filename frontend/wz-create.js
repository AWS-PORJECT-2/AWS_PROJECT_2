/* =====================================================================
 * 두띵 — 프로젝트 만들기. from scratch.
 * wz-core.js(WZ) + categories.js(DT_CATEGORIES) + category-icons.js + wz-consent.js(WZConsent).
 *
 * 흐름:
 *   0) 진입 선택 화면 — "직접 개설(일반)" vs "대리 개설" 큰 카드 2개.
 *      ?mode=normal | ?mode=proxy 쿼리로 바로 진입 가능.
 *   1-N) 일반 개설: 메이커 스튜디오형 작성 현황(섹션 카드 + 슬라이드오버 폼)
 *        -> WZConsent.requireCreator() -> POST /api/funds { mode:"normal", ... } -> /detail.html?id=
 *   1-P) 대리 개설: 간소 폼(제목/카테고리/연락처/요청사항 + 선택 목표·마감)
 *        -> WZConsent.requireCreator() -> POST /api/funds { mode:"proxy", ... } -> 접수 완료 화면
 *
 * 가격/수수료는 항상 서버 계산을 신뢰. 클라 표시는 참고용.
 * 사용자/외부 데이터는 textContent(W.el 텍스트 인자) 또는 escapeHTML 으로만 삽입.
 * AI 가상피팅은 별도 모달(메인 흐름 임베드 금지). 이모지 금지(SVG만).
 * ===================================================================== */
(function () {
  var W = window.WZ;

  /* ---- 로컬 SVG 아이콘(stroke=currentColor) ---- */
  var IC = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg>',
    mega: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h3v-4z"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
    hands: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12l5-5 4 4 3-3 5 5"/><path d="M2 12v4a2 2 0 0 0 2 2h3"/><path d="M22 12v4a2 2 0 0 1-2 2h-3"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };

  /* ---- 진행 방식별 안내(수수료는 서버 계산, 표시는 참고용) ---- */
  var MODE_INFO = {
    normal: { label: '직접 개설', feeHint: '5%', short: '직접' },
    proxy: { label: '대리 개설', feeHint: '20%', short: '대리' },
  };

  var root, me;

  function run() {
    root = document.getElementById('wz-create');
    if (!root || !W) return;
    root.appendChild(W.el('div', { class: 'wc-loading' }, '불러오는 중...'));
    W.fetchMe().then(function (m) {
      me = m;
      if (!me) { renderNeedLogin(); return; }
      var q = new URLSearchParams(location.search);
      var mode = q.get('mode');
      if (mode === 'normal') startNormal();
      else if (mode === 'proxy') startProxy();
      else renderPick();
    });
  }

  /* =====================================================================
   * 0. 진입 선택 — 직접 개설(일반) vs 대리 개설
   * ===================================================================== */
  function renderPick() {
    root.replaceChildren();
    var wrap = W.el('div', { class: 'wc-choose' });

    var head = W.el('div', { class: 'wc-choose__head' });
    head.append(
      W.el('p', { class: 'wc-choose__steplabel' }, 'STEP 1'),
      W.el('h1', { class: 'wc-choose__title' }, '어떻게 프로젝트를 시작할까요?'),
      W.el('p', { class: 'wc-choose__sub' }, '진행 방식을 선택하세요. 직접 개설은 수수료가 낮고 모든 내용을 직접 작성하며, 대리 개설은 수수료를 더 받는 대신 두띵이 기획과 운영을 대신 진행합니다.'),
    );
    wrap.appendChild(head);

    var grid = W.el('div', { class: 'wc-choose__grid' });
    grid.append(
      ChoiceCard({
        accent: 'normal',
        icon: IC.pen,
        name: '직접 개설',
        tag: '일반',
        feeLine: '정산 수수료 ' + MODE_INFO.normal.feeHint + ' (참고)',
        desc: '창작자가 제목·이미지·스토리·리워드·일정을 직접 구성합니다. 수수료가 낮은 대신 모든 내용을 직접 입력해야 합니다.',
        points: ['수수료가 가장 낮음', '리워드·가격·일정 직접 설정', '대표 이미지·스토리 직접 작성', 'AI 가상 피팅으로 대표 이미지 제작 가능'],
        cta: '직접 개설하기',
        onClick: startNormal,
      }),
      ChoiceCard({
        accent: 'proxy',
        icon: IC.hands,
        name: '대리 개설',
        tag: '대리',
        feeLine: '정산 수수료 ' + MODE_INFO.proxy.feeHint + ' (참고)',
        desc: '필수 정보 몇 가지만 입력하면 두띵이 상세 기획·이미지·리워드 구성을 대신 진행합니다. 수수료가 더 부과됩니다.',
        points: ['제목·카테고리·연락처·요청사항만 입력', '상세 기획·이미지·리워드는 두띵이 작성', '검토 후 담당자가 연락', '바쁘거나 처음이라면 추천'],
        cta: '대리 개설 신청하기',
        onClick: startProxy,
      }),
    );
    wrap.appendChild(grid);

    var note = W.el('div', { class: 'wc-choose__note' });
    note.append(
      W.el('span', { class: 'wc-choose__noteic', html: IC.info }),
      W.el('span', {}, '두 방식 모두 제출 후 관리자 심사를 거쳐 공개됩니다. 정산 수수료율은 서버 정책에 따라 최종 확정되며, 위 수치는 참고용입니다.'),
    );
    wrap.appendChild(note);

    root.appendChild(wrap);
  }

  function ChoiceCard(o) {
    var card = W.el('button', { class: 'wc-cc wc-cc--' + o.accent, type: 'button' });
    var top = W.el('div', { class: 'wc-cc__top' });
    top.append(
      W.el('span', { class: 'wc-cc__ic', html: o.icon }),
      W.el('span', { class: 'wc-cc__tag' }, o.tag),
    );
    var name = W.el('h2', { class: 'wc-cc__name' }, o.name);
    var fee = W.el('p', { class: 'wc-cc__fee' }, o.feeLine);
    var desc = W.el('p', { class: 'wc-cc__desc' }, o.desc);
    var ul = W.el('ul', { class: 'wc-cc__list' });
    o.points.forEach(function (p) {
      var li = W.el('li', {});
      li.append(W.el('span', { class: 'wc-cc__dot', html: IC.check }), W.el('span', {}, p));
      ul.appendChild(li);
    });
    var cta = W.el('span', { class: 'wc-cc__cta' });
    cta.append(W.el('span', {}, o.cta), W.el('span', { class: 'wc-cc__ctaic', html: IC.arrow }));
    card.append(top, name, fee, desc, ul, cta);
    card.addEventListener('click', o.onClick);
    return card;
  }

  /* =====================================================================
   * 일반(직접) 개설
   * ===================================================================== */
  var nstate;
  function startNormal() {
    nstate = {
      mode: 'normal',
      category: '',
      title: '',
      description: '',
      coverImage: null,       // data URL
      basePrice: '',
      targetQuantity: '',
      deadline: '',
      rewardTiers: [],        // [{title, price, desc, stock}]
      storyBlocks: [],        // [{type:'text'|'image', value}]
      refundPolicy: '',
      legalNotice: '',
      makerIntro: '',
      makerContact: '',
      tryonImage: null,
    };
    renderCategoryPick();
  }

  /* 카테고리 선택(일반 첫 단계) */
  function renderCategoryPick() {
    root.replaceChildren();
    var wrap = W.el('div', { class: 'wc-pick' });
    var head = W.el('div', { class: 'wc-pick__head' });
    head.append(
      W.el('p', { class: 'wc-pick__steplabel' }, '직접 개설 · STEP 1'),
      W.el('h1', { class: 'wc-pick__title' }, '무엇을 만들까요?'),
      W.el('p', { class: 'wc-pick__sub' }, '카테고리를 선택하면 작성 현황으로 이동합니다.'),
    );
    wrap.appendChild(head);

    var grid = W.el('div', { class: 'wc-catgrid' });
    var nextBtn;
    (window.DT_CATEGORIES || []).forEach(function (c) {
      var card = W.el('button', { class: 'wc-catcard' + (nstate.category === c.slug ? ' is-on' : ''), type: 'button', 'data-slug': c.slug, 'aria-pressed': nstate.category === c.slug ? 'true' : 'false' });
      var ic = W.el('div', { class: 'wc-catcard__ic' });
      if (typeof window.categoryIconSvg === 'function') ic.innerHTML = window.categoryIconSvg(c.key);
      var typeLabel = c.type === 'apparel' ? '의류' : (c.type === 'goods' ? '굿즈' : '기타');
      card.append(ic, W.el('span', { class: 'wc-catcard__label' }, c.label), W.el('span', { class: 'wc-catcard__type' }, typeLabel));
      card.addEventListener('click', function () {
        nstate.category = c.slug;
        grid.querySelectorAll('.wc-catcard').forEach(function (x) { x.classList.remove('is-on'); x.setAttribute('aria-pressed', 'false'); });
        card.classList.add('is-on'); card.setAttribute('aria-pressed', 'true');
        if (nextBtn) nextBtn.disabled = !nstate.category;
      });
      grid.appendChild(card);
    });
    wrap.appendChild(grid);

    var actions = W.el('div', { class: 'wc-pick__actions' });
    var backBtn = W.el('button', { class: 'wz-btn wz-btn--ghost wz-btn--lg', type: 'button' }, '이전');
    backBtn.addEventListener('click', renderPick);
    nextBtn = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg', type: 'button' }, '다음');
    nextBtn.disabled = !nstate.category;
    nextBtn.addEventListener('click', function () {
      if (!nstate.category) { toast('카테고리를 선택해 주세요'); return; }
      renderStudio();
    });
    actions.append(backBtn, nextBtn);
    wrap.appendChild(actions);

    root.appendChild(wrap);
  }

  /* ---- 일반 개설 섹션 정의 ---- */
  function sections() {
    return [
      {
        key: 'basic', name: '기본 정보', required: true,
        done: function () { return !!nstate.title.trim() && !!nstate.description.trim(); },
        open: openBasicForm,
      },
      {
        key: 'goal', name: '기본가 · 목표 · 일정', required: true,
        done: function () { return validPrice(nstate.basePrice) && validQty(nstate.targetQuantity) && validDeadline(nstate.deadline); },
        open: openGoalForm,
      },
      {
        key: 'story', name: '스토리', required: true,
        done: function () { return nstate.storyBlocks.some(function (b) { return b.type === 'text' ? b.value.trim() : b.value; }); },
        open: openStoryForm,
      },
      {
        key: 'reward', name: '리워드', required: true,
        done: function () { return nstate.rewardTiers.length > 0 && nstate.rewardTiers.every(validTier); },
        open: openRewardForm,
      },
      {
        key: 'policy', name: '정책', required: false,
        done: function () { return !!nstate.refundPolicy.trim() || !!nstate.legalNotice.trim(); },
        open: openPolicyForm,
      },
      {
        key: 'maker', name: '메이커 정보', required: false,
        done: function () { return !!nstate.makerIntro.trim() || !!nstate.makerContact.trim(); },
        open: openMakerForm,
      },
    ];
  }

  function validPrice(v) { var n = Number(v); return Number.isFinite(n) && n >= 0 && String(v).trim() !== ''; }
  function validQty(v) { var n = Number(v); return Number.isFinite(n) && n >= 1 && n <= 500; }
  function validDeadline(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    var p = s.split('-').map(Number);
    var dt = new Date(p[0], p[1] - 1, p[2]);
    if (dt.getFullYear() !== p[0] || dt.getMonth() !== p[1] - 1 || dt.getDate() !== p[2]) return false;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return dt.getTime() > today.getTime();
  }
  function validTier(t) { return !!String(t.title || '').trim() && Number.isFinite(Number(t.price)) && Number(t.price) >= 0; }

  function progressPct() {
    var reqs = sections().filter(function (s) { return s.required; });
    if (!reqs.length) return 100;
    var done = reqs.filter(function (s) { return s.done(); }).length;
    return Math.round((done / reqs.length) * 100);
  }
  function allRequiredDone() { return sections().filter(function (s) { return s.required; }).every(function (s) { return s.done(); }); }

  /* ---- 작성 현황(메인) ---- */
  function renderStudio() {
    root.replaceChildren();
    var studio = W.el('div', { class: 'wc-studio' });
    studio.append(Sidebar(), MainColumn(), AsideBanners());
    root.appendChild(studio);
  }

  function Sidebar() {
    var side = W.el('nav', { class: 'wc-side', 'aria-label': '메이커 스튜디오' });
    side.appendChild(W.el('p', { class: 'wc-side__title' }, '메이커 스튜디오'));
    var ul = W.el('ul', { class: 'wc-side__nav' });
    var items = [
      { name: '프로젝트 작성', icon: IC.doc, active: true },
      { name: '일정', icon: IC.calendar },
      { name: '데이터·인사이트', icon: IC.chart },
      { name: '마케팅 도구', icon: IC.mega },
      { name: '정산', icon: IC.wallet },
    ];
    items.forEach(function (it) {
      var li = W.el('li', { class: 'wc-side__item ' + (it.active ? 'is-active' : 'is-disabled') });
      var sp = W.el('span', { html: it.icon, class: 'wc-side__ic' });
      sp.style.display = 'inline-flex'; sp.style.width = '18px'; sp.style.height = '18px';
      li.appendChild(sp);
      li.appendChild(W.el('span', {}, it.name));
      if (!it.active) li.appendChild(W.el('span', { class: 'wc-side__soon' }, '준비 중'));
      ul.appendChild(li);
    });
    side.appendChild(ul);
    var change = W.el('button', { class: 'wc-side__change', type: 'button' }, '진행 방식 다시 선택');
    change.addEventListener('click', renderPick);
    side.appendChild(change);
    return side;
  }

  function MainColumn() {
    var col = W.el('div', { class: 'wc-main' });
    col.append(
      W.el('h1', { class: 'wc-main__title' }, '작성 현황'),
      W.el('p', { class: 'wc-main__sub' }, '프로젝트를 공개하는 데 필요한 내용을 작성해 주세요'),
      ProgressCard(),
      SectionList(),
      AiFittingCard(),
      SubmitArea(),
    );
    return col;
  }

  function ProgressCard() {
    var pct = progressPct();
    var ready = allRequiredDone();
    var card = W.el('div', { class: 'wc-prog' });
    var rowTop = W.el('div', { class: 'wc-prog__row' });
    rowTop.append(
      W.el('span', { class: 'wc-prog__state' }, ready ? '필수 항목 작성 완료' : '프로젝트 작성 중'),
      W.el('span', { class: 'wc-prog__pct' }, pct + '%'),
    );
    var bar = W.el('div', { class: 'wc-prog__bar' });
    var fill = W.el('div', { class: 'wc-prog__fill' });
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    card.append(rowTop, bar);
    card.appendChild(W.el('p', { class: 'wc-prog__note' + (ready ? ' is-ready' : '') },
      ready ? '모든 필수 항목을 작성했습니다. 이제 오픈 예약을 진행할 수 있어요.'
            : '모든 필수 항목을 작성하면 오픈 예약하기가 활성화됩니다.'));
    return card;
  }

  function SectionList() {
    var list = W.el('div', { class: 'wc-list' });
    sections().forEach(function (sec) {
      var done = sec.done();
      var card = W.el('div', { class: 'wc-card' + (done ? ' is-done' : '') });
      var check = W.el('div', { class: 'wc-card__check', html: IC.check });
      var body = W.el('div', { class: 'wc-card__body' });
      var name = W.el('p', { class: 'wc-card__name' }, sec.name);
      if (sec.required) name.appendChild(W.el('span', { class: 'wc-card__req' }, '필수'));
      body.append(name, W.el('p', { class: 'wc-card__state' }, done ? '작성 완료' : '작성 전'));
      var btnWrap = W.el('div', { class: 'wc-card__btn' });
      var btn = W.el('button', { class: 'wz-btn ' + (done ? 'wz-btn--outline' : 'wz-btn--primary'), type: 'button' }, done ? '수정하기' : '작성하기');
      btn.addEventListener('click', function () { sec.open(); });
      btnWrap.appendChild(btn);
      card.append(check, body, btnWrap);
      list.appendChild(card);
    });
    return list;
  }

  function AiFittingCard() {
    var card = W.el('div', { class: 'wc-aicard' });
    var ic = W.el('div', { class: 'wc-aicard__ic', html: IC.sparkle });
    var body = W.el('div', { class: 'wc-aicard__body' });
    body.append(
      W.el('p', { class: 'wc-aicard__name' }, 'AI 가상 피팅 (선택)'),
      W.el('p', { class: 'wc-aicard__desc' }, '디자인 이미지를 모델 착용 사진으로 만들어 대표 이미지로 사용할 수 있습니다.'),
    );
    var btn = W.el('button', { class: 'wz-btn wz-btn--outline', type: 'button' }, 'AI 피팅 열기');
    btn.addEventListener('click', openAiModal);
    card.append(ic, body, btn);
    return card;
  }

  function SubmitArea() {
    var wrap = W.el('div', { class: 'wc-submit' });
    var ready = allRequiredDone();
    var btn = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg wz-btn--block', type: 'button' }, '오픈 예약하기');
    btn.disabled = !ready;
    btn.addEventListener('click', submitNormal);
    wrap.appendChild(btn);
    wrap.appendChild(W.el('p', { class: 'wc-submit__hint' },
      ready ? '제출하면 창작자 약관 동의 후 관리자 심사를 거쳐 프로젝트가 공개됩니다.'
            : '필수 항목(기본 정보 · 기본가/목표/일정 · 스토리 · 리워드)을 모두 작성해 주세요.'));
    return wrap;
  }

  function AsideBanners() {
    var aside = W.el('aside', { class: 'wc-aside' });
    var cat = window.dtCategory ? window.dtCategory(nstate.category) : null;

    var b1 = W.el('div', { class: 'wc-banner wc-banner--accent' });
    b1.appendChild(W.el('p', { class: 'wc-banner__title', html: IC.info + '<span>선택한 항목</span>' }));
    b1.appendChild(W.el('p', { class: 'wc-banner__text' }, (cat ? cat.label : '미지정') + ' · 직접 개설'));
    aside.appendChild(b1);

    var b2 = W.el('div', { class: 'wc-banner' });
    b2.appendChild(W.el('p', { class: 'wc-banner__title', html: IC.doc + '<span>작성 가이드</span>' }));
    var ul = W.el('ul', { class: 'wc-banner__list' });
    [
      '제목과 한 줄 소개는 후원자가 가장 먼저 보는 정보입니다.',
      '기본가·목표 수량·마감일을 명확히 설정해 주세요.',
      '리워드는 최소 1개 이상 등록해야 합니다.',
      '스토리에 디자인 의도와 제작 일정을 담아 주세요.',
    ].forEach(function (t) { ul.appendChild(W.el('li', {}, t)); });
    b2.appendChild(ul);
    aside.appendChild(b2);

    var b3 = W.el('div', { class: 'wc-banner' });
    b3.appendChild(W.el('p', { class: 'wc-banner__title', html: IC.shield + '<span>심사 안내</span>' }));
    b3.appendChild(W.el('p', { class: 'wc-banner__text' }, '제출된 프로젝트는 관리자 심사 후 공개됩니다. 가격과 수수료는 서버에서 최종 계산됩니다. 정책·메이커 정보 등 일부 항목은 스토리 본문에 함께 저장됩니다.'));
    b3.appendChild(W.el('a', { class: 'wc-banner__link', href: '/support.html' }, '프로젝트 심사 기준 보기'));
    aside.appendChild(b3);

    return aside;
  }

  function refreshStudio() { renderStudio(); }

  /* =====================================================================
   * 슬라이드오버 공통
   * ===================================================================== */
  var _over;
  function openOver(title, buildBody, onSave) {
    closeOver();
    var over = W.el('div', { class: 'wc-over' });
    var dim = W.el('div', { class: 'wc-over__dim' });
    dim.addEventListener('click', closeOver);
    var panel = W.el('div', { class: 'wc-over__panel', role: 'dialog', 'aria-label': title });

    var head = W.el('div', { class: 'wc-over__head' });
    var closeBtn = W.el('button', { class: 'wc-over__close', type: 'button', 'aria-label': '닫기', html: IC.close });
    closeBtn.addEventListener('click', closeOver);
    head.append(W.el('h2', { class: 'wc-over__title' }, title), closeBtn);

    var body = W.el('div', { class: 'wc-over__body' });
    buildBody(body);

    var foot = W.el('div', { class: 'wc-over__foot' });
    var cancel = W.el('button', { class: 'wz-btn wz-btn--ghost', type: 'button' }, '취소');
    cancel.addEventListener('click', closeOver);
    var save = W.el('button', { class: 'wz-btn wz-btn--primary', type: 'button' }, '저장');
    save.addEventListener('click', function () {
      var ok = onSave();
      if (ok !== false) { closeOver(); refreshStudio(); toast('저장되었습니다'); }
    });
    foot.append(cancel, save);

    panel.append(head, body, foot);
    over.append(dim, panel);
    document.body.appendChild(over);
    _over = over;
    requestAnimationFrame(function () { over.classList.add('is-open'); });
  }
  function closeOver() {
    if (!_over) return;
    var o = _over; _over = null;
    o.classList.remove('is-open');
    setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 250);
  }

  /* 폼 헬퍼 */
  function field(label, required, control, help) {
    var f = W.el('div', { class: 'wc-fld' });
    var lbl = W.el('label', { class: 'wc-fld__label' }, label);
    if (required) lbl.appendChild(W.el('span', { class: 'wc-fld__req' }, '*'));
    f.append(lbl, control);
    if (help) f.appendChild(W.el('p', { class: 'wc-fld__help' }, help));
    return f;
  }
  function input(props) { return W.el('input', Object.assign({ class: 'wc-input' }, props)); }
  function textarea(props) { return W.el('textarea', Object.assign({ class: 'wc-textarea' }, props)); }

  /* ---- 기본 정보 ---- */
  function openBasicForm() {
    var titleIn, descIn, coverState = nstate.coverImage, previewWrap;
    openOver('기본 정보', function (body) {
      titleIn = input({ type: 'text', value: nstate.title, maxlength: '80', placeholder: '프로젝트 제목' });
      body.appendChild(field('제목', true, titleIn, '후원자에게 보이는 프로젝트 이름입니다. 최대 80자.'));

      descIn = input({ type: 'text', value: nstate.description, maxlength: '120', placeholder: '한 줄 소개' });
      body.appendChild(field('한 줄 소개', true, descIn, '프로젝트를 한 문장으로 설명해 주세요.'));

      previewWrap = W.el('div', {});
      function renderCover() {
        previewWrap.replaceChildren();
        if (coverState) {
          var pv = W.el('div', { class: 'wc-preview' });
          pv.appendChild(W.el('img', { src: coverState, alt: '대표 이미지 미리보기' }));
          var del = W.el('button', { class: 'wc-preview__del', type: 'button', 'aria-label': '이미지 삭제', html: IC.close });
          del.addEventListener('click', function () { coverState = null; renderCover(); });
          pv.appendChild(del);
          previewWrap.appendChild(pv);
        } else {
          var up = W.el('label', { class: 'wc-upload' });
          up.appendChild(W.el('div', { html: IC.upload }));
          up.appendChild(W.el('div', { class: 'wc-upload__text' }, '대표 이미지 업로드'));
          up.appendChild(W.el('div', { class: 'wc-upload__hint' }, 'PNG · JPG · WEBP (최대 8MB)'));
          var fileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
          fileIn.addEventListener('change', function () {
            readImage(fileIn.files && fileIn.files[0], function (dataUrl) { coverState = dataUrl; renderCover(); });
          });
          up.appendChild(fileIn);
          previewWrap.appendChild(up);
        }
      }
      renderCover();
      body.appendChild(field('대표 이미지', false, previewWrap, '목록·상세 썸네일로 사용됩니다. 비우면 AI 피팅 결과나 스토리 첫 이미지가 사용됩니다.'));
    }, function () {
      var t = titleIn.value.trim(), d = descIn.value.trim();
      if (!t) { toast('제목을 입력해 주세요'); return false; }
      if (!d) { toast('한 줄 소개를 입력해 주세요'); return false; }
      nstate.title = t; nstate.description = d; nstate.coverImage = coverState;
      return true;
    });
  }

  /* ---- 기본가 · 목표 · 일정 ---- */
  function openGoalForm() {
    var priceIn, qtyIn, dlIn;
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    var minDate = tomorrow.toISOString().slice(0, 10);
    openOver('기본가 · 목표 · 일정', function (body) {
      priceIn = input({ type: 'number', value: nstate.basePrice, min: '0', placeholder: '예: 30000' });
      body.appendChild(field('기본가(원)', true, priceIn, '제품 1개의 기본 판매가입니다. 디자인비·플랫폼 수수료는 서버에서 자동 계산되어 최종가에 반영됩니다.'));

      qtyIn = input({ type: 'number', value: nstate.targetQuantity, min: '1', max: '500', placeholder: '예: 50' });
      body.appendChild(field('목표 수량', true, qtyIn, '펀딩 성공에 필요한 최소 수량입니다. (1 ~ 500개)'));

      dlIn = input({ type: 'date', value: nstate.deadline, min: minDate });
      body.appendChild(field('마감일', true, dlIn, '이 날짜까지 목표 수량을 달성해야 펀딩이 성사됩니다. 오늘 이후 날짜만 가능합니다.'));

      body.appendChild(W.el('div', { class: 'wc-fld__notice' },
        '최종 판매가와 정산 수수료(직접 개설 ' + MODE_INFO.normal.feeHint + ' 기준, 참고용)는 서버에서 계산됩니다. 입력하신 기본가는 산정 기준값으로만 사용됩니다.'));
    }, function () {
      if (!validPrice(priceIn.value)) { toast('기본가를 0원 이상으로 입력해 주세요'); return false; }
      if (!validQty(qtyIn.value)) { toast('목표 수량은 1~500 사이로 입력해 주세요'); return false; }
      if (!validDeadline(dlIn.value)) { toast('마감일은 오늘 이후 날짜로 선택해 주세요'); return false; }
      nstate.basePrice = priceIn.value; nstate.targetQuantity = qtyIn.value; nstate.deadline = dlIn.value;
      return true;
    });
  }

  /* ---- 리워드 ---- */
  function openRewardForm() {
    var draft = nstate.rewardTiers.map(function (t) { return Object.assign({}, t); });
    var listEl;
    openOver('리워드', function (body) {
      body.appendChild(W.el('p', { class: 'wc-fld__help', style: 'margin:0 0 14px' },
        '후원자가 선택할 선물(리워드) 구성입니다. 가격은 창작자가 직접 정합니다. 최소 1개가 필요합니다.'));
      listEl = W.el('div', {});
      renderTiers();
      body.appendChild(listEl);
      var addBtn = W.el('button', { class: 'wc-addtier', type: 'button', html: IC.plus + '<span>리워드 추가</span>' });
      addBtn.addEventListener('click', function () {
        if (draft.length >= 12) { toast('리워드는 최대 12개까지 추가할 수 있어요'); return; }
        draft.push({ title: '', price: '', desc: '', stock: '' });
        renderTiers();
      });
      body.appendChild(addBtn);

      function renderTiers() {
        listEl.replaceChildren();
        draft.forEach(function (t, i) {
          var box = W.el('div', { class: 'wc-tier' });
          var head = W.el('div', { class: 'wc-tier__head' });
          var del = W.el('button', { class: 'wc-tier__del', type: 'button' }, '삭제');
          del.addEventListener('click', function () { draft.splice(i, 1); renderTiers(); });
          head.append(W.el('span', { class: 'wc-tier__no' }, '리워드 ' + (i + 1)), del);
          box.appendChild(head);

          var g = W.el('div', { class: 'wc-tier__grid' });
          var titleIn = input({ type: 'text', value: t.title, maxlength: '60', placeholder: '리워드 제목' });
          titleIn.addEventListener('input', function () { t.title = titleIn.value; });
          var priceIn = input({ type: 'number', value: t.price, min: '0', placeholder: '가격(원)' });
          priceIn.addEventListener('input', function () { t.price = priceIn.value; });
          var stockIn = input({ type: 'number', value: t.stock, min: '1', placeholder: '한정 수량(선택)' });
          stockIn.addEventListener('input', function () { t.stock = stockIn.value; });
          var descIn = textarea({ maxlength: '500', placeholder: '리워드 설명(구성품 등)' });
          descIn.value = t.desc || '';
          descIn.addEventListener('input', function () { t.desc = descIn.value; });

          g.append(
            field('제목', true, titleIn),
            field('가격(원)', true, priceIn),
            field('한정 수량', false, stockIn),
            W.el('div', { class: 'wc-tier__full' }, field('설명', false, descIn)),
          );
          box.appendChild(g);
          listEl.appendChild(box);
        });
        if (!draft.length) listEl.appendChild(W.el('p', { class: 'wc-fld__help' }, '아직 추가된 리워드가 없습니다.'));
      }
    }, function () {
      var cleaned = [];
      for (var i = 0; i < draft.length; i++) {
        var t = draft[i];
        if (!String(t.title || '').trim()) { toast('리워드 ' + (i + 1) + '의 제목을 입력해 주세요'); return false; }
        if (!Number.isFinite(Number(t.price)) || Number(t.price) < 0) { toast('리워드 ' + (i + 1) + '의 가격을 확인해 주세요'); return false; }
        cleaned.push({
          title: String(t.title).trim(),
          price: Math.floor(Number(t.price)),
          desc: String(t.desc || '').trim(),
          stock: (t.stock !== '' && t.stock != null && Number(t.stock) >= 1) ? Math.floor(Number(t.stock)) : null,
        });
      }
      if (cleaned.length === 0) { toast('직접 개설은 리워드가 최소 1개 필요합니다'); return false; }
      nstate.rewardTiers = cleaned;
      return true;
    });
  }

  /* ---- 스토리 ---- */
  function openStoryForm() {
    var draft = nstate.storyBlocks.map(function (b) { return Object.assign({}, b); });
    var listEl;
    openOver('스토리', function (body) {
      body.appendChild(W.el('p', { class: 'wc-fld__help', style: 'margin:0 0 14px' },
        '프로젝트의 이야기를 글과 이미지 블록으로 구성하세요. 최소 1개 블록이 필요합니다.'));
      listEl = W.el('div', {});
      renderBlocks();
      body.appendChild(listEl);

      var add = W.el('div', { class: 'wc-blockadd' });
      var addText = W.el('button', { class: 'wz-btn wz-btn--outline', type: 'button', html: IC.plus + '<span>글 추가</span>' });
      addText.addEventListener('click', function () { draft.push({ type: 'text', value: '' }); renderBlocks(); });
      var addImg = W.el('label', { class: 'wz-btn wz-btn--outline', html: IC.upload + '<span>이미지 추가</span>' });
      var fileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
      fileIn.addEventListener('change', function () {
        readImage(fileIn.files && fileIn.files[0], function (dataUrl) { draft.push({ type: 'image', value: dataUrl }); renderBlocks(); });
        fileIn.value = '';
      });
      addImg.appendChild(fileIn);
      add.append(addText, addImg);
      body.appendChild(add);

      function renderBlocks() {
        listEl.replaceChildren();
        draft.forEach(function (b, i) {
          var box = W.el('div', { class: 'wc-block' });
          var head = W.el('div', { class: 'wc-block__head' });
          var del = W.el('button', { class: 'wc-block__del', type: 'button' }, '삭제');
          del.addEventListener('click', function () { draft.splice(i, 1); renderBlocks(); });
          head.append(W.el('span', { class: 'wc-block__type' }, b.type === 'image' ? '이미지' : '글'), del);
          box.appendChild(head);
          if (b.type === 'text') {
            var ta = textarea({ maxlength: '5000', placeholder: '본문을 입력하세요' });
            ta.value = b.value || '';
            ta.addEventListener('input', function () { b.value = ta.value; });
            box.appendChild(ta);
          } else {
            box.appendChild(W.el('img', { src: b.value, alt: '스토리 이미지' }));
          }
          listEl.appendChild(box);
        });
        if (!draft.length) listEl.appendChild(W.el('p', { class: 'wc-fld__help' }, '아직 추가된 블록이 없습니다.'));
      }
    }, function () {
      var cleaned = [];
      draft.forEach(function (b) {
        if (b.type === 'text') { var t = String(b.value || '').trim(); if (t) cleaned.push({ type: 'text', value: t.slice(0, 5000) }); }
        else if (b.type === 'image' && b.value) cleaned.push({ type: 'image', value: b.value });
      });
      if (!cleaned.length) { toast('스토리에 최소 1개 블록을 작성해 주세요'); return false; }
      nstate.storyBlocks = cleaned;
      return true;
    });
  }

  /* ---- 정책 ---- */
  function openPolicyForm() {
    var refundIn, legalIn;
    openOver('정책', function (body) {
      body.appendChild(W.el('div', { class: 'wc-fld__notice' },
        '정책 항목은 별도 저장 필드가 없어, 입력 시 스토리 본문 끝에 함께 저장됩니다.'));
      refundIn = textarea({ maxlength: '2000', placeholder: '교환·환불 기준, 배송 지연 시 처리 방법 등' });
      refundIn.value = nstate.refundPolicy || '';
      body.appendChild(field('교환·환불 정책', false, refundIn));
      legalIn = textarea({ maxlength: '2000', placeholder: '제품 소재·치수, 제조국, A/S 안내 등 정보 고시' });
      legalIn.value = nstate.legalNotice || '';
      body.appendChild(field('상품 정보 고시', false, legalIn));
    }, function () {
      nstate.refundPolicy = refundIn.value.trim();
      nstate.legalNotice = legalIn.value.trim();
      return true;
    });
  }

  /* ---- 메이커 정보 ---- */
  function openMakerForm() {
    var introIn, contactIn;
    openOver('메이커 정보', function (body) {
      body.appendChild(W.el('div', { class: 'wc-fld__notice' },
        '메이커 정보는 별도 저장 필드가 없어, 입력 시 스토리 본문 끝에 함께 저장됩니다.'));
      introIn = textarea({ maxlength: '1000', placeholder: '메이커(팀) 소개' });
      introIn.value = nstate.makerIntro || '';
      body.appendChild(field('메이커 소개', false, introIn));
      contactIn = input({ type: 'text', maxlength: '200', placeholder: '문의 이메일 또는 오픈채팅 링크' });
      contactIn.value = nstate.makerContact || '';
      body.appendChild(field('문의처', false, contactIn, '후원자 문의를 받을 연락 수단입니다.'));
    }, function () {
      nstate.makerIntro = introIn.value.trim();
      nstate.makerContact = contactIn.value.trim();
      return true;
    });
  }

  /* ---- AI 가상피팅 모달(별도) ---- */
  function openAiModal() {
    var modal = W.el('div', { class: 'wc-modal' });
    var dim = W.el('div', { class: 'wc-modal__dim' });
    dim.addEventListener('click', close);
    var box = W.el('div', { class: 'wc-modal__box', role: 'dialog', 'aria-label': 'AI 가상 피팅' });

    var head = W.el('div', { class: 'wc-modal__head' });
    var closeBtn = W.el('button', { class: 'wc-modal__close', type: 'button', 'aria-label': '닫기', html: IC.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h2', { class: 'wc-modal__title' }, 'AI 가상 피팅'), closeBtn);
    box.appendChild(head);
    box.appendChild(W.el('p', { class: 'wc-modal__sub' }, '디자인(굿즈·의류) 이미지를 업로드하면 모델 착용/전시 이미지를 생성합니다. 결과는 대표 이미지로 사용할 수 있습니다.'));

    var sourceState = null, resultState = null;
    var previewWrap = W.el('div', {});
    function renderSource() {
      previewWrap.replaceChildren();
      if (sourceState) {
        var pv = W.el('div', { class: 'wc-preview' });
        pv.appendChild(W.el('img', { src: sourceState, alt: '디자인 이미지' }));
        var del = W.el('button', { class: 'wc-preview__del', type: 'button', 'aria-label': '이미지 삭제', html: IC.close });
        del.addEventListener('click', function () { sourceState = null; renderSource(); });
        pv.appendChild(del);
        previewWrap.appendChild(pv);
      } else {
        var up = W.el('label', { class: 'wc-upload' });
        up.appendChild(W.el('div', { html: IC.upload }));
        up.appendChild(W.el('div', { class: 'wc-upload__text' }, '디자인 이미지 업로드'));
        up.appendChild(W.el('div', { class: 'wc-upload__hint' }, 'PNG · JPG · WEBP (최대 8MB)'));
        var fileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
        fileIn.addEventListener('change', function () { readImage(fileIn.files && fileIn.files[0], function (d) { sourceState = d; renderSource(); }); });
        up.appendChild(fileIn);
        previewWrap.appendChild(up);
      }
    }
    renderSource();
    box.appendChild(field('디자인 이미지', false, previewWrap));

    var opts = W.el('div', { class: 'wc-opts' });
    var modelSel = W.el('select', { class: 'wc-select' });
    [['female', '여성 모델'], ['male', '남성 모델'], ['female_athletic', '여성(운동)'], ['male_athletic', '남성(운동)']]
      .forEach(function (o) { modelSel.appendChild(W.el('option', { value: o[0] }, o[1])); });
    var bgSel = W.el('select', { class: 'wc-select' });
    [['studio', '스튜디오'], ['campus', '캠퍼스'], ['classroom', '강의실'], ['outdoor', '야외']]
      .forEach(function (o) { bgSel.appendChild(W.el('option', { value: o[0] }, o[1])); });
    opts.append(field('모델', false, modelSel), field('배경', false, bgSel));
    box.appendChild(opts);

    var statusEl = W.el('div', {});
    var resultWrap = W.el('div', { class: 'wc-modal__result', style: 'display:none' });
    box.append(statusEl, resultWrap);

    var foot = W.el('div', { class: 'wc-over__foot', style: 'border:0;padding:18px 0 0' });
    var genBtn = W.el('button', { class: 'wz-btn wz-btn--primary', type: 'button' }, 'AI 피팅 생성');
    var useBtn = W.el('button', { class: 'wz-btn wz-btn--outline', type: 'button' }, '대표 이미지로 사용');
    useBtn.disabled = true;
    genBtn.addEventListener('click', function () {
      if (!sourceState) { toast('디자인 이미지를 업로드해 주세요'); return; }
      statusEl.className = 'wc-modal__status';
      statusEl.replaceChildren(W.el('div', { class: 'wc-spin' }), document.createTextNode('AI가 이미지를 생성하고 있어요. 잠시만 기다려 주세요.'));
      genBtn.disabled = true;
      window.api.post('/ai/try-on', { imageDataUrls: [sourceState], modelType: modelSel.value, background: bgSel.value })
        .then(function (res) {
          var url = res && res.tryOnDataUrl;
          if (!url) throw new Error('NO_RESULT');
          resultState = url;
          statusEl.replaceChildren();
          resultWrap.style.display = '';
          resultWrap.replaceChildren(W.el('img', { src: url, alt: 'AI 피팅 결과' }));
          useBtn.disabled = false;
          genBtn.disabled = false;
        })
        .catch(function (err) {
          genBtn.disabled = false;
          statusEl.className = 'wc-modal__status is-err';
          var msg = (err && (err.status === 404 || err.status === 503))
            ? 'AI 기능이 현재 연결되어 있지 않습니다. 나중에 다시 시도해 주세요.'
            : ((err && err.message) ? err.message : 'AI 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
          statusEl.textContent = msg;
        });
    });
    useBtn.addEventListener('click', function () {
      if (!resultState) return;
      nstate.tryonImage = resultState;
      nstate.coverImage = nstate.coverImage || resultState;
      close();
      refreshStudio();
      toast('AI 피팅 결과를 대표 이미지로 적용했습니다');
    });
    foot.append(genBtn, useBtn);
    box.appendChild(foot);

    modal.append(dim, box);
    document.body.appendChild(modal);
    requestAnimationFrame(function () { modal.classList.add('is-open'); });

    function close() { if (modal.parentNode) modal.parentNode.removeChild(modal); }
  }

  /* ---- 일반 제출 ---- */
  function submitNormal() {
    if (!allRequiredDone()) { toast('필수 항목을 모두 작성해 주세요'); return; }

    var btn = root.querySelector('.wc-submit .wz-btn');

    function disable() { if (btn) { btn.disabled = true; btn.textContent = '제출 중...'; } }
    function restore() { if (btn) { btn.disabled = false; btn.textContent = '오픈 예약하기'; } }

    // 창작자 약관 동의 후 제출
    Promise.resolve(window.WZConsent && window.WZConsent.requireCreator ? window.WZConsent.requireCreator() : true)
      .then(function (agreed) {
        if (!agreed) { toast('창작자 약관에 동의해야 프로젝트를 만들 수 있어요'); return; }
        disable();

        // contentBlocks: API 계약 {type:"text"|"image", text?, url?}
        var blocks = nstate.storyBlocks.map(function (b) {
          return b.type === 'image' ? { type: 'image', url: b.value } : { type: 'text', text: b.value };
        });
        var extra = [];
        if (nstate.refundPolicy) extra.push('[교환·환불 정책]\n' + nstate.refundPolicy);
        if (nstate.legalNotice) extra.push('[상품 정보 고시]\n' + nstate.legalNotice);
        if (nstate.makerIntro) extra.push('[메이커 소개]\n' + nstate.makerIntro);
        if (nstate.makerContact) extra.push('[문의처]\n' + nstate.makerContact);
        if (extra.length) blocks.push({ type: 'text', text: extra.join('\n\n') });

        // rewardTiers: API 계약 {title, price, desc, stock?}
        var rewards = nstate.rewardTiers.map(function (t) {
          var r = { title: t.title, price: t.price, desc: t.desc || '' };
          if (t.stock != null) r.stock = t.stock;
          return r;
        });

        var payload = {
          mode: 'normal',
          title: nstate.title,
          description: nstate.description,
          category: nstate.category,
          basePrice: Math.floor(Number(nstate.basePrice)),
          targetQuantity: Math.floor(Number(nstate.targetQuantity)),
          deadline: deadlineToIso(nstate.deadline),
          contentBlocks: blocks,
          rewardTiers: rewards,
        };
        // 대표 이미지: 업로드 data URL 우선 -> 없으면 AI 피팅 결과
        var cover = nstate.coverImage || nstate.tryonImage;
        if (cover) payload.designImageDataUrl = cover;
        // designFee 는 서버 계산. 클라가 보내지 않음.

        return window.api.post('/funds', payload)
          .then(function (res) {
            toast('프로젝트가 제출되었습니다');
            var id = res && res.id;
            setTimeout(function () {
              location.href = id ? ('/detail.html?id=' + encodeURIComponent(id)) : '/profile.html?tab=funds';
            }, 500);
          })
          .catch(function (err) {
            restore();
            toast((err && err.message) ? err.message : '제출에 실패했습니다. 잠시 후 다시 시도해 주세요.');
          });
      });
  }

  /* =====================================================================
   * 대리 개설
   * ===================================================================== */
  var pstate;
  function startProxy() {
    pstate = { title: '', category: '', contactPhone: '', requestNote: '', targetQuantity: '', deadline: '' };
    renderProxyForm();
  }

  function renderProxyForm() {
    root.replaceChildren();
    var wrap = W.el('div', { class: 'wc-proxy' });

    var head = W.el('div', { class: 'wc-proxy__head' });
    head.append(
      W.el('p', { class: 'wc-proxy__steplabel' }, '대리 개설 신청'),
      W.el('h1', { class: 'wc-proxy__title' }, '두띵이 대신 프로젝트를 만들어 드립니다'),
      W.el('p', { class: 'wc-proxy__sub' }, '필수 정보 몇 가지만 알려주시면 담당자가 검토 후 연락드립니다. 상세 기획·이미지·리워드 구성은 두띵이 대신 작성합니다.'),
    );
    wrap.appendChild(head);

    var notice = W.el('div', { class: 'wc-proxy__notice' });
    notice.append(
      W.el('span', { class: 'wc-proxy__notice-ic', html: IC.info }),
      W.el('p', {}, '대리 개설은 정산 수수료가 직접 개설보다 더 부과되며(참고: ' + MODE_INFO.proxy.feeHint + ' 수준), 상세 기획·이미지·리워드 구성은 두띵이 대신 작성합니다. 정확한 수수료는 검토 단계에서 안내됩니다.'),
    );
    wrap.appendChild(notice);

    var formCard = W.el('div', { class: 'wc-proxy__card' });

    /* 제목 */
    var titleIn = input({ type: 'text', value: pstate.title, maxlength: '80', placeholder: '예: 컴퓨터공학부 25학번 과잠' });
    formCard.appendChild(field('제목', true, titleIn, '만들고 싶은 굿즈를 짧게 적어 주세요. 최대 80자.'));

    /* 카테고리 select */
    var catSel = W.el('select', { class: 'wc-select' });
    catSel.appendChild(W.el('option', { value: '' }, '카테고리 선택'));
    (window.DT_CATEGORIES || []).forEach(function (c) {
      var opt = W.el('option', { value: c.slug }, c.label);
      if (pstate.category === c.slug) opt.setAttribute('selected', 'selected');
      catSel.appendChild(opt);
    });
    formCard.appendChild(field('카테고리', true, catSel));

    /* 연락처(숫자만 + 자동 하이픈) */
    var phoneIn = input({ type: 'tel', value: pstate.contactPhone, maxlength: '13', inputmode: 'numeric', placeholder: '010-1234-5678' });
    phoneIn.addEventListener('input', function () {
      var pos = phoneIn.selectionStart;
      var before = phoneIn.value;
      var formatted = formatPhone(phoneIn.value);
      phoneIn.value = formatted;
      // 커서 보정(끝에서 입력하는 일반적 케이스 위주)
      if (pos === before.length) phoneIn.setSelectionRange(formatted.length, formatted.length);
    });
    formCard.appendChild(field('연락처', true, phoneIn, '담당자가 연락드릴 휴대폰 번호입니다. 숫자만 입력하면 자동으로 하이픈이 들어갑니다.'));

    /* 요청 사항 */
    var noteIn = textarea({ maxlength: '2000', placeholder: '원하는 굿즈 종류·디자인 컨셉·예상 수량·필요한 일정 등을 자유롭게 적어 주세요.' });
    noteIn.value = pstate.requestNote || '';
    formCard.appendChild(field('요청 사항', true, noteIn, '구체적으로 적어 주실수록 빠르게 진행할 수 있습니다.'));

    /* 선택: 희망 목표 수량 / 마감일 */
    var optionalWrap = W.el('div', { class: 'wc-proxy__optional' });
    optionalWrap.appendChild(W.el('p', { class: 'wc-proxy__optional-title' }, '희망 사항 (선택)'));
    var grid2 = W.el('div', { class: 'wc-proxy__grid2' });
    var qtyIn = input({ type: 'number', value: pstate.targetQuantity, min: '1', max: '500', placeholder: '예: 50' });
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    var minDate = tomorrow.toISOString().slice(0, 10);
    var dlIn = input({ type: 'date', value: pstate.deadline, min: minDate });
    grid2.append(field('희망 목표 수량', false, qtyIn), field('희망 마감일', false, dlIn));
    optionalWrap.appendChild(grid2);
    formCard.appendChild(optionalWrap);

    wrap.appendChild(formCard);

    /* 액션 */
    var actions = W.el('div', { class: 'wc-proxy__actions' });
    var backBtn = W.el('button', { class: 'wz-btn wz-btn--ghost wz-btn--lg', type: 'button' }, '이전');
    backBtn.addEventListener('click', function () {
      // 입력 보존
      pstate.title = titleIn.value; pstate.category = catSel.value; pstate.contactPhone = phoneIn.value;
      pstate.requestNote = noteIn.value; pstate.targetQuantity = qtyIn.value; pstate.deadline = dlIn.value;
      renderPick();
    });
    var submitBtn = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg', type: 'button' }, '대리 개설 신청하기');
    submitBtn.addEventListener('click', function () {
      pstate.title = titleIn.value.trim();
      pstate.category = catSel.value;
      pstate.contactPhone = phoneIn.value.trim();
      pstate.requestNote = noteIn.value.trim();
      pstate.targetQuantity = qtyIn.value;
      pstate.deadline = dlIn.value;
      submitProxy(submitBtn);
    });
    actions.append(backBtn, submitBtn);
    wrap.appendChild(actions);

    root.appendChild(wrap);
  }

  function submitProxy(btn) {
    if (!pstate.title) { toast('제목을 입력해 주세요'); return; }
    if (!pstate.category) { toast('카테고리를 선택해 주세요'); return; }
    var phoneDigits = pstate.contactPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 11) { toast('연락처를 정확히 입력해 주세요'); return; }
    if (!pstate.requestNote) { toast('요청 사항을 입력해 주세요'); return; }
    if (pstate.targetQuantity !== '' && !validQty(pstate.targetQuantity)) { toast('희망 목표 수량은 1~500 사이로 입력해 주세요'); return; }
    if (pstate.deadline !== '' && !validDeadline(pstate.deadline)) { toast('희망 마감일은 오늘 이후 날짜로 선택해 주세요'); return; }

    function disable() { if (btn) { btn.disabled = true; btn.textContent = '신청 중...'; } }
    function restore() { if (btn) { btn.disabled = false; btn.textContent = '대리 개설 신청하기'; } }

    Promise.resolve(window.WZConsent && window.WZConsent.requireCreator ? window.WZConsent.requireCreator() : true)
      .then(function (agreed) {
        if (!agreed) { toast('창작자 약관에 동의해야 신청할 수 있어요'); return; }
        disable();

        var payload = {
          mode: 'proxy',
          title: pstate.title,
          category: pstate.category,
          contactPhone: pstate.contactPhone,
          requestNote: pstate.requestNote,
        };
        if (pstate.targetQuantity !== '') payload.targetQuantity = Math.floor(Number(pstate.targetQuantity));
        if (pstate.deadline !== '') payload.deadline = deadlineToIso(pstate.deadline);

        window.api.post('/funds', payload)
          .then(function () { renderProxyDone(); })
          .catch(function (err) {
            restore();
            toast((err && err.message) ? err.message : '신청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
          });
      });
  }

  function renderProxyDone() {
    root.replaceChildren();
    var box = W.el('div', { class: 'wc-done' });
    var ic = W.el('div', { class: 'wc-done__ic', html: IC.check });
    box.appendChild(ic);
    box.appendChild(W.el('h1', { class: 'wc-done__title' }, '대리 개설 신청이 접수되었습니다'));
    box.appendChild(W.el('p', { class: 'wc-done__sub' }, '담당자가 요청 내용을 검토한 뒤 입력하신 연락처로 연락드립니다. 상세 기획·이미지·리워드 구성은 두띵이 함께 준비하겠습니다.'));

    var card = W.el('div', { class: 'wc-done__card' });
    card.appendChild(DoneRow('제목', pstate.title));
    var cat = window.dtCategory ? window.dtCategory(pstate.category) : null;
    card.appendChild(DoneRow('카테고리', cat ? cat.label : pstate.category));
    card.appendChild(DoneRow('연락처', pstate.contactPhone));
    if (pstate.targetQuantity !== '') card.appendChild(DoneRow('희망 목표 수량', pstate.targetQuantity + '개'));
    if (pstate.deadline !== '') card.appendChild(DoneRow('희망 마감일', pstate.deadline));
    box.appendChild(card);

    var actions = W.el('div', { class: 'wc-done__actions' });
    actions.appendChild(W.el('a', { class: 'wz-btn wz-btn--primary wz-btn--lg', href: '/main.html' }, '홈으로'));
    actions.appendChild(W.el('a', { class: 'wz-btn wz-btn--outline wz-btn--lg', href: '/profile.html?tab=funds' }, '내 프로젝트 보기'));
    box.appendChild(actions);

    root.appendChild(box);
  }

  function DoneRow(k, v) {
    var row = W.el('div', { class: 'wc-done__row' });
    row.append(W.el('span', { class: 'wc-done__k' }, k), W.el('span', { class: 'wc-done__v' }, String(v == null ? '' : v)));
    return row;
  }

  /* =====================================================================
   * 유틸
   * ===================================================================== */
  function formatPhone(v) {
    var d = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 7) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length < 11) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }

  // 'YYYY-MM-DD' -> ISO (마감일 끝, 로컬 23:59:59 기준)
  function deadlineToIso(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return s;
    var p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2], 23, 59, 59).toISOString();
  }

  function readImage(file, cb) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast('PNG·JPG·WEBP 이미지만 업로드할 수 있어요'); return; }
    if (file.size > 8 * 1024 * 1024) { toast('이미지는 최대 8MB까지 가능합니다'); return; }
    var r = new FileReader();
    r.onload = function () { cb(String(r.result)); };
    r.onerror = function () { toast('이미지를 읽지 못했습니다'); };
    r.readAsDataURL(file);
  }

  var _toastTimer;
  function toast(msg) {
    var ex = document.querySelector('.wc-toast');
    if (ex) ex.remove();
    var t = W.el('div', { class: 'wc-toast' }, msg);
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-on'); });
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { t.classList.remove('is-on'); setTimeout(function () { if (t.parentNode) t.remove(); }, 250); }, 2400);
  }

  function renderNeedLogin() {
    root.replaceChildren();
    var box = W.el('div', { class: 'wc-needlogin' });
    box.append(
      W.el('h2', {}, '로그인이 필요합니다'),
      W.el('p', {}, '프로젝트를 만들려면 국민대학교 계정으로 로그인해 주세요.'),
      W.el('a', { class: 'wz-btn wz-btn--primary wz-btn--lg', href: '/login.html' }, '로그인하기'),
    );
    root.appendChild(box);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
