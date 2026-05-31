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
    tier: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 12h18M3 17h18"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="14" height="14" rx="2"/><path d="M22 7l-6 5 6 5V7z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    resume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    drag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>',
    alignLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h12M3 18h15"/></svg>',
    alignCenter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M6 12h12M5 18h14"/></svg>',
    alignRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 12h12M6 18h15"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/></svg>',
  };

  /* ---- 요금제(서버가 최종 수수료율 계산; 표시는 참고용) ---- */
  var PLAN_INFO = {
    start: {
      key: 'start', name: 'Start', feePct: 5, feeRate: 0.05,
      tagline: '처음 시작하는 창작자를 위한 기본 요금제',
      points: ['플랫폼 수수료 5% (가장 낮음)', '프로젝트 공개 및 후원 모집', '기본 결제·정산 지원'],
    },
    run: {
      key: 'run', name: 'Run', feePct: 9, feeRate: 0.09,
      tagline: '더 많은 후원자에게 닿고 싶은 창작자를 위한 요금제',
      points: ['플랫폼 수수료 9%', '공개 예정(오픈 알림) 페이지 제공', '후원·유입 데이터 분석 리포트'],
    },
    boost: {
      key: 'boost', name: 'Boost', feePct: 15, feeRate: 0.15,
      tagline: '최대 노출로 펀딩을 끌어올리는 요금제',
      points: ['플랫폼 수수료 15%', '홈·카테고리 상단 노출 부스팅', 'SNS 광고 집행 및 데이터 분석', '공개 예정 페이지 제공'],
    },
  };
  function planInfo(key) { return PLAN_INFO[key] || PLAN_INFO.start; }

  /* 임시저장 자동 저장 디바운스(ms) */
  var DRAFT_DEBOUNCE_MS = 1500;

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
      var draftId = q.get('draft');
      if (draftId) { resumeDraft(draftId); return; }
      var mode = q.get('mode');
      if (mode === 'normal') startNormal();
      else if (mode === 'proxy') startProxy();
      else renderPick();
    });
  }

  /* ?draft=<id> 로 진입 — 서버에서 임시저장 불러와 작성 현황으로 복원 */
  function resumeDraft(id) {
    root.replaceChildren();
    root.appendChild(W.el('div', { class: 'wc-loading' }, '임시저장을 불러오는 중...'));
    window.api.get('/me/drafts/' + encodeURIComponent(id))
      .then(function (d) {
        if (!restoreFromDraft(d)) { toast('임시저장을 불러올 수 없어 새로 시작합니다'); renderPick(); return; }
        renderStudio();
      })
      .catch(function (err) {
        toast(err && err.status === 404 ? '임시저장을 찾을 수 없습니다' : '임시저장을 불러오지 못했습니다');
        renderPick();
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

    // 임시저장(이어서 만들기) 영역 — 있을 때만 표시
    var draftsWrap = W.el('div', {});
    wrap.appendChild(draftsWrap);
    loadDraftsInto(draftsWrap);

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

  /* ---- 임시저장 목록(이어서 만들기) ---- */
  function loadDraftsInto(container) {
    window.api.get('/me/drafts')
      .then(function (res) {
        var items = (res && Array.isArray(res.items)) ? res.items : [];
        if (!items.length) return;
        renderDraftsResume(container, items);
      })
      .catch(function () { /* 임시저장 불러오기 실패는 조용히 무시 — 신규 작성 흐름 유지 */ });
  }

  function renderDraftsResume(container, items) {
    container.replaceChildren();
    var sec = W.el('section', { class: 'wc-drafts' });
    var head = W.el('div', { class: 'wc-drafts__head' });
    head.append(
      W.el('span', { class: 'wc-drafts__ic', html: IC.resume }),
      W.el('div', {},
        W.el('p', { class: 'wc-drafts__title' }, '만들던 프로젝트가 있습니다'),
        W.el('p', { class: 'wc-drafts__sub' }, '이어서 작성하거나 삭제할 수 있어요. 임시저장은 직접 개설 프로젝트에만 적용됩니다.'),
      ),
    );
    sec.appendChild(head);

    var list = W.el('div', { class: 'wc-drafts__list' });
    items.forEach(function (d) {
      list.appendChild(DraftRow(d, function () { loadDraftsInto(container); }));
    });
    sec.appendChild(list);
    container.appendChild(sec);
  }

  function DraftRow(d, onChange) {
    var row = W.el('div', { class: 'wc-draft' });
    var info = W.el('div', { class: 'wc-draft__info' });
    var title = (d.title && String(d.title).trim()) ? String(d.title) : '제목 없는 프로젝트';
    info.appendChild(W.el('p', { class: 'wc-draft__title' }, title));
    var meta = W.el('p', { class: 'wc-draft__meta' });
    var catLabel = '';
    if (d.category) { var c = window.dtCategory ? window.dtCategory(d.category) : null; catLabel = c ? c.label : ''; }
    if (catLabel) meta.append(W.el('span', {}, catLabel), W.el('span', { class: 'wc-draft__dot' }, '·'));
    meta.append(W.el('span', {}, '수정 ' + formatDraftDate(d.updatedAt)));
    info.appendChild(meta);
    row.appendChild(info);

    var actions = W.el('div', { class: 'wc-draft__actions' });
    var resumeBtn = W.el('button', { class: 'wz-btn wz-btn--primary', type: 'button' }, '이어서 만들기');
    resumeBtn.addEventListener('click', function () { resumeDraft(d.id); });
    var delBtn = W.el('button', { class: 'wc-draft__del', type: 'button', 'aria-label': '임시저장 삭제', html: IC.trash });
    delBtn.addEventListener('click', function () {
      delBtn.disabled = true;
      window.api.del('/me/drafts/' + encodeURIComponent(d.id))
        .then(function () { toast('임시저장을 삭제했습니다'); if (onChange) onChange(); })
        .catch(function () { delBtn.disabled = false; toast('삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.'); });
    });
    actions.append(resumeBtn, delBtn);
    row.appendChild(actions);
    return row;
  }

  function formatDraftDate(iso) {
    var dt = new Date(iso);
    if (isNaN(dt.getTime())) return '';
    var y = dt.getFullYear(), m = dt.getMonth() + 1, day = dt.getDate();
    var hh = String(dt.getHours()).padStart(2, '0'), mm = String(dt.getMinutes()).padStart(2, '0');
    return y + '.' + m + '.' + day + ' ' + hh + ':' + mm;
  }

  /* =====================================================================
   * 일반(직접) 개설
   * ===================================================================== */
  var nstate;
  // 임시저장 추적: 현재 작성 중인 draft 의 서버 id(없으면 null) + 자동저장 상태
  var draftId = null, draftSaving = false, draftTimer = null, lastSavedJson = '';

  function newNState() {
    return {
      mode: 'normal',
      plan: 'start',          // 요금제: start|run|boost
      category: '',
      title: '',
      description: '',
      coverImage: null,       // data URL
      videoUrl: '',           // 대표 영상: data URL(mp4/webm) 또는 http(s) 링크
      basePrice: '',
      targetQuantity: '',
      deadline: '',
      openScheduled: false,   // 공개 예정으로 등록(run·boost 전용)
      openAt: '',             // 공개 예정일 'YYYY-MM-DD' (openScheduled 일 때만 사용)
      rewardTiers: [],        // [{title, price, desc, stock}]
      storyBlocks: [],        // [{type:'text'|'image', value}]
      refundPolicy: '',
      legalNotice: '',
      makerIntro: '',
      makerContact: '',
      creatorName: '',
      creatorImage: null,     // data URL 또는 http(s)
      creatorIntro: '',
      creatorSido: '',
      creatorSigungu: '',
      tryonImage: null,
    };
  }

  function startNormal() {
    nstate = newNState();
    draftId = null; lastSavedJson = '';
    renderCategoryPick();
  }

  /* 서버 draft.data 로부터 nstate 복원. 성공 시 true */
  function restoreFromDraft(d) {
    if (!d || !d.data || typeof d.data !== 'object' || Array.isArray(d.data)) return false;
    nstate = Object.assign(newNState(), d.data);
    nstate.mode = 'normal';
    // 배열/객체 필드 방어적 정규화
    if (!Array.isArray(nstate.rewardTiers)) nstate.rewardTiers = [];
    if (!Array.isArray(nstate.storyBlocks)) nstate.storyBlocks = [];
    draftId = d.id || null;
    lastSavedJson = draftPayloadJson();
    return true;
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
        key: 'plan', name: '요금제', required: true,
        done: function () { return !!PLAN_INFO[nstate.plan]; },
        open: openPlanForm,
      },
      {
        key: 'goal', name: '기본가 · 목표 · 일정', required: true,
        done: function () { return validPrice(nstate.basePrice) && validQty(nstate.targetQuantity) && validDeadline(nstate.deadline); },
        open: openGoalForm,
      },
      {
        key: 'story', name: '스토리', required: true,
        done: function () { return nstate.storyBlocks.some(storyBlockHasContent); },
        open: openStoryForm,
      },
      {
        key: 'reward', name: '리워드', required: true,
        done: function () { return nstate.rewardTiers.length > 0 && nstate.rewardTiers.every(validTier); },
        open: openRewardForm,
      },
      {
        key: 'creator', name: '창작자 정보', required: true,
        done: function () { return !!nstate.creatorName.trim() && !!nstate.creatorIntro.trim(); },
        open: openCreatorForm,
      },
      {
        key: 'policy', name: '정책', required: true,
        done: function () { return !!nstate.refundPolicy.trim() && !!nstate.legalNotice.trim(); },
        open: openPolicyForm,
      },
      {
        key: 'maker', name: '메이커 정보', required: true,
        done: function () { return !!nstate.makerIntro.trim() && !!nstate.makerContact.trim(); },
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
  // 공개 예정일: 마감일과 동일하게 오늘 이후 날짜만 허용(미래 검증).
  function validOpenAt(s) { return validDeadline(s); }

  /* =====================================================================
   * 리치 스토리 블록 — 스키마(content_blocks)와 1:1.
   *   text:  { type:'text',  value, variant(heading|subheading|body|quote), align(left|center|right) }
   *   image: { type:'image', value, width(sm|md|lg|full), align(left|center|right) }
   *   split: { type:'split', text, image, imageSide(left|right), align(left|center|right) }
   * 서버 normalizeContentBlocks 와 동일한 enum·기본값을 사용한다(미통과 → 기본값 강등).
   * ===================================================================== */
  var STORY_TEXT_VARIANTS = ['heading', 'subheading', 'body', 'quote'];
  var STORY_ALIGNS = ['left', 'center', 'right'];
  var STORY_IMG_WIDTHS = ['sm', 'md', 'lg', 'full'];
  var STORY_IMG_SIDES = ['left', 'right'];

  var STORY_VARIANT_LABEL = { heading: '제목', subheading: '소제목', body: '본문', quote: '인용' };
  var STORY_WIDTH_LABEL = { sm: '작게', md: '보통', lg: '크게', full: '꽉차게' };
  var STORY_ALIGN_LABEL = { left: '왼쪽', center: '가운데', right: '오른쪽' };
  var STORY_ALIGN_ICON = { left: IC.alignLeft, center: IC.alignCenter, right: IC.alignRight };

  // 허용 enum 이면 그대로, 아니면 기본값으로 강등(서버 pickEnum 과 동일 정책).
  function storyEnum(v, allowed, fallback) { return (allowed.indexOf(v) !== -1) ? v : fallback; }

  // 블록 타입 라벨(에디터 헤더 표시용).
  function storyBlockTypeLabel(b) {
    if (b.type === 'image') return '이미지';
    if (b.type === 'split') return '글+사진';
    return '글';
  }

  // 블록에 표시할 내용이 있는지(빈 블록 판정 — 서버 검증과 동일 기준).
  function storyBlockHasContent(b) {
    if (!b) return false;
    if (b.type === 'image') return !!b.value;
    if (b.type === 'split') return !!String(b.text || '').trim() && !!b.image;
    return !!String(b.value || '').trim();
  }

  // 임의 블록(드래프트/AI 결과 포함)을 스키마 형태로 정규화. 빈 블록은 null.
  function normalizeStoryBlock(b) {
    if (!b || typeof b !== 'object') return null;
    if (b.type === 'image') {
      if (!b.value) return null;
      return { type: 'image', value: b.value, width: storyEnum(b.width, STORY_IMG_WIDTHS, 'full'), align: storyEnum(b.align, STORY_ALIGNS, 'center') };
    }
    if (b.type === 'split') {
      var stext = String(b.text || '').trim();
      if (!stext || !b.image) return null;
      return { type: 'split', text: stext.slice(0, 5000), image: b.image, imageSide: storyEnum(b.imageSide, STORY_IMG_SIDES, 'right'), align: storyEnum(b.align, STORY_ALIGNS, 'left') };
    }
    var t = String(b.value || '').trim();
    if (!t) return null;
    return { type: 'text', value: t.slice(0, 5000), variant: storyEnum(b.variant, STORY_TEXT_VARIANTS, 'body'), align: storyEnum(b.align, STORY_ALIGNS, 'left') };
  }

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

  // 섹션 key → 사이드바 아이콘
  var SECTION_ICON = {
    basic: IC.doc, plan: IC.tier, goal: IC.calendar, story: IC.pen,
    reward: IC.wallet, creator: IC.user, policy: IC.shield, maker: IC.mega,
  };

  function Sidebar() {
    var side = W.el('nav', { class: 'wc-side', 'aria-label': '메이커 스튜디오' });
    side.appendChild(W.el('p', { class: 'wc-side__title' }, '프로젝트 작성 단계'));
    var ul = W.el('ul', { class: 'wc-side__nav' });
    sections().forEach(function (sec) {
      var done = sec.done();
      var li = W.el('li', { class: 'wc-side__item is-active' + (done ? ' is-done' : '') });
      var sp = W.el('span', { html: SECTION_ICON[sec.key] || IC.doc, class: 'wc-side__ic' });
      sp.style.display = 'inline-flex'; sp.style.width = '18px'; sp.style.height = '18px';
      li.appendChild(sp);
      li.appendChild(W.el('span', {}, sec.name));
      if (done) li.appendChild(W.el('span', { class: 'wc-side__tick', html: IC.check }));
      else if (sec.required) li.appendChild(W.el('span', { class: 'wc-side__req' }, '필수'));
      li.addEventListener('click', function () { sec.open(); });
      ul.appendChild(li);
    });
    side.appendChild(ul);
    var change = W.el('button', { class: 'wc-side__change', type: 'button' }, '진행 방식 다시 선택');
    change.addEventListener('click', function () { stopAutosave(); renderPick(); });
    side.appendChild(change);
    return side;
  }

  function MainColumn() {
    var col = W.el('div', { class: 'wc-main' });
    col.append(
      DraftBar(),
      W.el('h1', { class: 'wc-main__title' }, '작성 현황'),
      W.el('p', { class: 'wc-main__sub' }, '프로젝트를 공개하는 데 필요한 내용을 작성해 주세요'),
      ProgressCard(),
      SectionList(),
      AiFittingCard(),
      SubmitArea(),
    );
    return col;
  }

  /* 임시저장 상태 + 수동 저장 버튼 바 */
  var _draftStatusEl;
  function DraftBar() {
    var bar = W.el('div', { class: 'wc-draftbar' });
    var left = W.el('div', { class: 'wc-draftbar__left' });
    left.append(W.el('span', { class: 'wc-draftbar__ic', html: IC.save }));
    _draftStatusEl = W.el('span', { class: 'wc-draftbar__status' }, draftStatusText());
    left.appendChild(_draftStatusEl);
    var saveBtn = W.el('button', { class: 'wz-btn wz-btn--outline', type: 'button' }, '임시저장');
    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true;
      saveDraftNow(true).then(function () { saveBtn.disabled = false; }).catch(function () { saveBtn.disabled = false; });
    });
    bar.append(left, saveBtn);
    return bar;
  }
  function draftStatusText() {
    if (draftSaving) return '임시저장 중...';
    if (draftId) return '임시저장됨 · 작성 내용은 자동으로 저장됩니다';
    return '작성을 시작하면 자동으로 임시저장됩니다';
  }
  function updateDraftStatus() { if (_draftStatusEl) _draftStatusEl.textContent = draftStatusText(); }

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

  // 카테고리 타입에 따라 AI 기능을 분기: 의류(apparel)=가상 피팅(모델 착용), 그 외(굿즈/기타)=가상 전시(제품 연출).
  function aiIsApparel() {
    return (typeof window.dtCategoryType === 'function') && window.dtCategoryType(nstate.category) === 'apparel';
  }
  function aiLabel() { return aiIsApparel() ? 'AI 가상 피팅' : 'AI 가상 전시'; }

  function AiFittingCard() {
    var apparel = aiIsApparel();
    var card = W.el('div', { class: 'wc-aicard' });
    var ic = W.el('div', { class: 'wc-aicard__ic', html: IC.sparkle });
    var body = W.el('div', { class: 'wc-aicard__body' });
    body.append(
      W.el('p', { class: 'wc-aicard__name' }, aiLabel() + ' (선택)'),
      W.el('p', { class: 'wc-aicard__desc' }, apparel
        ? '디자인 이미지를 모델 착용 사진으로 만들어 대표 이미지로 사용할 수 있습니다.'
        : '디자인 이미지를 멋진 전시·연출 사진으로 만들어 대표 이미지로 사용할 수 있습니다.'),
    );
    var btn = W.el('button', { class: 'wz-btn wz-btn--outline', type: 'button' }, apparel ? 'AI 피팅 열기' : 'AI 전시 열기');
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
            : '필수 항목(기본 정보 · 요금제 · 기본가/목표/일정 · 스토리 · 리워드 · 창작자 정보 · 정책 · 메이커 정보)을 모두 작성해 주세요.'));
    return wrap;
  }

  function AsideBanners() {
    var aside = W.el('aside', { class: 'wc-aside' });
    var cat = window.dtCategory ? window.dtCategory(nstate.category) : null;

    var planI = planInfo(nstate.plan);
    var b1 = W.el('div', { class: 'wc-banner wc-banner--accent' });
    b1.appendChild(W.el('p', { class: 'wc-banner__title', html: IC.info + '<span>선택한 항목</span>' }));
    b1.appendChild(W.el('p', { class: 'wc-banner__text' }, (cat ? cat.label : '미지정') + ' · 직접 개설'));
    b1.appendChild(W.el('p', { class: 'wc-banner__text', style: 'margin-top:6px' }, planI.name + ' 요금제 · 플랫폼 수수료 ' + planI.feePct + '% (참고)'));
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
    b3.appendChild(W.el('p', { class: 'wc-banner__text' }, '제출된 프로젝트는 관리자 심사 후 공개됩니다. 가격과 수수료는 서버에서 최종 계산됩니다. 교환·환불 정책과 상품 정보 고시는 스토리와 별도로 저장되어 상세 페이지 맨 끝에 따로 표시됩니다.'));
    b3.appendChild(W.el('a', { class: 'wc-banner__link', href: '/review-policy.html' }, '프로젝트 심사 기준 보기'));
    aside.appendChild(b3);

    return aside;
  }

  function refreshStudio() { renderStudio(); scheduleAutosave(); }

  /* =====================================================================
   * 임시저장(자동/수동)
   * ===================================================================== */
  // draft 로 저장할 폼 상태(nstate) — JSON 직렬화 가능한 평범한 객체.
  function draftData() { return Object.assign({}, nstate); }
  function draftPayloadJson() { try { return JSON.stringify(draftData()); } catch (_) { return ''; } }
  // 목록·제목 요약을 위해 title 도 함께 보냄(서버는 data.category 로 카테고리 요약).
  function draftTitle() { var t = String(nstate.title || '').trim(); return t ? t.slice(0, 120) : null; }

  function stopAutosave() { if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; } }

  function scheduleAutosave() {
    stopAutosave();
    // 빈 상태(아무 것도 입력 안 함)면 굳이 생성하지 않음
    if (!hasAnyInput()) return;
    var cur = draftPayloadJson();
    if (cur === lastSavedJson) return;   // 변경 없음
    // 서버 임시저장이 아직 없으면 즉시 생성(빠르게 이탈해도 "개설 중인 프로젝트"에 남도록). 이후 변경은 디바운스.
    if (!draftId) { saveDraftNow(false); return; }
    draftTimer = setTimeout(function () { saveDraftNow(false); }, DRAFT_DEBOUNCE_MS);
  }

  function hasAnyInput() {
    return !!(String(nstate.title || '').trim() || String(nstate.description || '').trim() ||
      nstate.coverImage || String(nstate.videoUrl || '').trim() ||
      String(nstate.basePrice) !== '' || String(nstate.targetQuantity) !== '' || nstate.deadline ||
      (nstate.rewardTiers && nstate.rewardTiers.length) || (nstate.storyBlocks && nstate.storyBlocks.length) ||
      String(nstate.creatorName || '').trim() || nstate.creatorImage || String(nstate.creatorIntro || '').trim());
  }

  // manual=true 면 사용자 명시 저장(토스트), false 면 자동 디바운스 저장(조용히).
  function saveDraftNow(manual) {
    if (draftSaving) return Promise.resolve();
    if (!hasAnyInput()) { if (manual) toast('저장할 내용을 먼저 입력해 주세요'); return Promise.resolve(); }
    var data = draftData();
    var json = draftPayloadJson();
    draftSaving = true; updateDraftStatus();
    var body = { title: draftTitle(), data: data };
    // window.api 는 put 헬퍼가 없어 post 에 method: 'PUT' 을 덮어써 사용(401 자동 갱신 로직 재사용).
    var p = draftId
      ? window.api.post('/me/drafts/' + encodeURIComponent(draftId), body, { method: 'PUT' })
      : window.api.post('/me/drafts', body);
    return p.then(function (res) {
      if (res && res.id) draftId = res.id;
      lastSavedJson = json;
      draftSaving = false; updateDraftStatus();
      if (manual) toast('임시저장되었습니다');
    }).catch(function (err) {
      draftSaving = false; updateDraftStatus();
      // draft 가 서버에서 사라진 경우(404) → id 비우고 다음 저장 때 새로 생성
      if (err && err.status === 404) { draftId = null; }
      if (manual) toast((err && err.message) ? err.message : '임시저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    });
  }

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
    _applyAiBlocks = null;   // 슬라이드오버 닫힘 → AI 초안 콜백 무효화
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

  /* ---- 기본 정보 (대표 이미지 + 대표 영상 포함) ---- */
  function openBasicForm() {
    var titleIn, descIn, coverState = nstate.coverImage, previewWrap;
    var videoState = nstate.videoUrl || '', videoWrap, linkIn;
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
          up.appendChild(W.el('div', { class: 'wc-upload__hint' }, '클릭 또는 끌어다 놓기 · PNG · JPG · WEBP (최대 8MB)'));
          var fileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
          fileIn.addEventListener('change', function () {
            readImage(fileIn.files && fileIn.files[0], function (dataUrl) { coverState = dataUrl; renderCover(); });
          });
          up.appendChild(fileIn);
          enableDrop(up, function (dataUrl) { coverState = dataUrl; renderCover(); });
          previewWrap.appendChild(up);
        }
      }
      renderCover();
      body.appendChild(field('대표 이미지', false, previewWrap, '목록·상세 썸네일로 사용됩니다. 비우면 AI 피팅 결과나 스토리 첫 이미지가 사용됩니다.'));

      // ---- 대표 영상(선택): 파일 업로드(data URL) 또는 링크(http) 택1 ----
      videoWrap = W.el('div', {});
      function renderVideo() {
        videoWrap.replaceChildren();
        if (videoState) {
          var box = W.el('div', { class: 'wc-vpreview' });
          if (/^data:video\//.test(videoState)) {
            var v = W.el('video', { src: videoState, controls: 'controls', playsinline: 'playsinline' });
            box.appendChild(v);
          } else {
            var lk = W.el('div', { class: 'wc-vlink' });
            lk.append(W.el('span', { class: 'wc-vlink__ic', html: IC.play }), W.el('span', { class: 'wc-vlink__url' }, videoState));
            box.appendChild(lk);
          }
          var del = W.el('button', { class: 'wc-preview__del', type: 'button', 'aria-label': '영상 삭제', html: IC.close });
          del.addEventListener('click', function () { videoState = ''; if (linkIn) linkIn.value = ''; renderVideo(); });
          box.appendChild(del);
          videoWrap.appendChild(box);
        } else {
          var up = W.el('label', { class: 'wc-upload' });
          up.appendChild(W.el('div', { html: IC.video }));
          up.appendChild(W.el('div', { class: 'wc-upload__text' }, '대표 영상 업로드'));
          up.appendChild(W.el('div', { class: 'wc-upload__hint' }, '클릭 또는 끌어다 놓기 · MP4 · WEBP · MOV (최대 30MB)'));
          var fileIn = W.el('input', { type: 'file', accept: 'video/mp4,video/webm,video/quicktime', style: 'display:none' });
          fileIn.addEventListener('change', function () {
            readVideo(fileIn.files && fileIn.files[0], function (dataUrl) { videoState = dataUrl; if (linkIn) linkIn.value = ''; renderVideo(); });
            fileIn.value = '';
          });
          up.appendChild(fileIn);
          enableVideoDrop(up, function (dataUrl) { videoState = dataUrl; if (linkIn) linkIn.value = ''; renderVideo(); });
          videoWrap.appendChild(up);
        }
      }
      renderVideo();
      body.appendChild(field('대표 영상 (선택)', false, videoWrap, '영상 파일을 올리거나 아래에 영상 링크를 넣어 주세요. 둘 중 하나만 사용됩니다.'));

      linkIn = input({ type: 'url', value: /^https?:\/\//.test(videoState) ? videoState : '', maxlength: '2000', placeholder: 'YouTube·Vimeo 등 영상 링크(선택)' });
      linkIn.addEventListener('input', function () {
        var u = linkIn.value.trim();
        if (u && /^https?:\/\//.test(u)) { videoState = u; renderVideo(); }
        else if (!u && /^https?:\/\//.test(videoState)) { videoState = ''; renderVideo(); }
      });
      body.appendChild(field('영상 링크 (선택)', false, linkIn, 'YouTube·Vimeo 등 영상 페이지 주소를 붙여넣으면 링크로 등록됩니다.'));

      body.appendChild(W.el('div', { class: 'wc-fld__notice wc-fld__notice--info' },
        '대표 이미지와 영상을 모두 올리면 상세 페이지에서 영상이 먼저 표시됩니다.'));
    }, function () {
      var t = titleIn.value.trim(), d = descIn.value.trim();
      if (!t) { toast('제목을 입력해 주세요'); return false; }
      if (!d) { toast('한 줄 소개를 입력해 주세요'); return false; }
      nstate.title = t; nstate.description = d; nstate.coverImage = coverState;
      nstate.videoUrl = normalizeVideo(videoState);
      return true;
    });
  }

  /* ---- 요금제 ---- */
  function openPlanForm() {
    var picked = PLAN_INFO[nstate.plan] ? nstate.plan : 'start';
    var cardsWrap, previewEl;
    openOver('요금제', function (body) {
      body.appendChild(W.el('p', { class: 'wc-fld__help', style: 'margin:0 0 16px' },
        '프로젝트에 적용할 요금제를 선택하세요. 요금제에 따라 플랫폼 수수료율과 제공 기능이 달라집니다. 최종 수수료는 서버에서 계산됩니다.'));

      cardsWrap = W.el('div', { class: 'wc-plans' });
      ['start', 'run', 'boost'].forEach(function (key) {
        var p = PLAN_INFO[key];
        var card = W.el('button', { class: 'wc-plan' + (picked === key ? ' is-on' : ''), type: 'button', 'aria-pressed': picked === key ? 'true' : 'false' });
        var top = W.el('div', { class: 'wc-plan__top' });
        top.append(
          W.el('span', { class: 'wc-plan__name' }, p.name),
          W.el('span', { class: 'wc-plan__fee' }, '수수료 ' + p.feePct + '%'),
        );
        card.appendChild(top);
        card.appendChild(W.el('p', { class: 'wc-plan__tagline' }, p.tagline));
        var ul = W.el('ul', { class: 'wc-plan__list' });
        p.points.forEach(function (pt) {
          var li = W.el('li', {});
          li.append(W.el('span', { class: 'wc-plan__dot', html: IC.check }), W.el('span', {}, pt));
          ul.appendChild(li);
        });
        card.appendChild(ul);
        var sel = W.el('span', { class: 'wc-plan__select' }, picked === key ? '선택됨' : '선택하기');
        card.appendChild(sel);
        card.addEventListener('click', function () {
          picked = key;
          cardsWrap.querySelectorAll('.wc-plan').forEach(function (x) { x.classList.remove('is-on'); x.setAttribute('aria-pressed', 'false'); });
          cardsWrap.querySelectorAll('.wc-plan__select').forEach(function (x) { x.textContent = '선택하기'; });
          card.classList.add('is-on'); card.setAttribute('aria-pressed', 'true');
          sel.textContent = '선택됨';
          renderPreview();
        });
        cardsWrap.appendChild(card);
      });
      body.appendChild(cardsWrap);

      previewEl = W.el('div', { class: 'wc-fld__notice wc-fld__notice--info' });
      renderPreview();
      body.appendChild(previewEl);

      function renderPreview() {
        var info = PLAN_INFO[picked];
        previewEl.replaceChildren();
        var base = Number(nstate.basePrice);
        var lowestReward = null;
        (nstate.rewardTiers || []).forEach(function (t) {
          var pr = Number(t.price);
          if (Number.isFinite(pr) && (lowestReward === null || pr < lowestReward)) lowestReward = pr;
        });
        var refPrice = (lowestReward !== null) ? lowestReward : (Number.isFinite(base) && String(nstate.basePrice).trim() !== '' ? base : null);
        if (refPrice !== null && Number.isFinite(refPrice)) {
          var fee = Math.round(refPrice * info.feeRate);
          previewEl.textContent = info.name + ' 요금제 기준 수수료 ' + info.feePct + '% — '
            + '최저 리워드가 ' + W.money(refPrice) + ' 기준 약 ' + W.money(fee) + ' (참고용, 최종 금액은 서버에서 계산됩니다)';
        } else {
          previewEl.textContent = info.name + ' 요금제 · 플랫폼 수수료 ' + info.feePct + '%. 리워드·기본가를 입력하면 예상 수수료가 표시됩니다. 최종 금액은 서버에서 계산됩니다.';
        }
      }
    }, function () {
      nstate.plan = picked;
      // Start 요금제는 공개 예정 옵션이 없으므로 예약 상태를 해제.
      if (picked !== 'run' && picked !== 'boost') { nstate.openScheduled = false; nstate.openAt = ''; }
      return true;
    });
  }

  /* ---- 기본가 · 목표 · 일정 ---- */
  function openGoalForm() {
    var priceIn, qtyIn, dlIn, openToggle, openDateIn;
    var schedulable = nstate.plan === 'run' || nstate.plan === 'boost';
    var scheduled = schedulable && !!nstate.openScheduled;
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

      // ---- 공개 예정 등록(Run·Boost 전용, 선택) ----
      if (schedulable) {
        var sched = W.el('div', { class: 'wc-sched' });
        var schedRow = W.el('div', { class: 'wc-sched__row' });
        var schedText = W.el('div', { class: 'wc-sched__text' });
        schedText.append(
          W.el('p', { class: 'wc-sched__title' }, '공개 예정으로 등록 (선택)'),
          W.el('p', { class: 'wc-sched__desc' }, '공개 예정으로 올리면 오픈 전 알림신청을 받을 수 있어요. 설정한 날짜 전까지는 공개 예정 페이지로 노출됩니다.'),
        );
        openToggle = W.el('button', { class: 'wc-toggle' + (scheduled ? ' is-on' : ''), type: 'button', role: 'switch', 'aria-checked': scheduled ? 'true' : 'false', 'aria-label': '공개 예정으로 등록' });
        openToggle.appendChild(W.el('span', { class: 'wc-toggle__knob' }));
        schedRow.append(schedText, openToggle);
        sched.appendChild(schedRow);

        var dateWrap = W.el('div', { class: 'wc-sched__date' });
        openDateIn = input({ type: 'date', value: nstate.openAt, min: minDate });
        dateWrap.appendChild(field('공개 예정일', true, openDateIn, '이 날짜에 프로젝트가 자동으로 공개됩니다. 마감일보다 앞서야 합니다.'));
        dateWrap.style.display = scheduled ? '' : 'none';
        sched.appendChild(dateWrap);

        openToggle.addEventListener('click', function () {
          scheduled = !scheduled;
          openToggle.classList.toggle('is-on', scheduled);
          openToggle.setAttribute('aria-checked', scheduled ? 'true' : 'false');
          dateWrap.style.display = scheduled ? '' : 'none';
        });
        body.appendChild(sched);
      }
    }, function () {
      if (!validPrice(priceIn.value)) { toast('기본가를 0원 이상으로 입력해 주세요'); return false; }
      if (!validQty(qtyIn.value)) { toast('목표 수량은 1~500 사이로 입력해 주세요'); return false; }
      if (!validDeadline(dlIn.value)) { toast('마감일은 오늘 이후 날짜로 선택해 주세요'); return false; }
      if (schedulable && scheduled) {
        if (!validOpenAt(openDateIn.value)) { toast('공개 예정일은 오늘 이후 날짜로 선택해 주세요'); return false; }
        if (openDateIn.value >= dlIn.value) { toast('공개 예정일은 마감일보다 앞선 날짜여야 합니다'); return false; }
      }
      nstate.basePrice = priceIn.value; nstate.targetQuantity = qtyIn.value; nstate.deadline = dlIn.value;
      nstate.openScheduled = schedulable && scheduled;
      nstate.openAt = (schedulable && scheduled) ? openDateIn.value : '';
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

  /* ---- 스토리 (블록 기반 리치 에디터) ---- */
  function openStoryForm() {
    // 기존 블록을 스키마 형태로 정규화해 복제(하위호환: variant/align/width 누락분은 기본값 채움).
    var draft = nstate.storyBlocks.map(function (b) {
      if (b.type === 'image') return { type: 'image', value: b.value, width: storyEnum(b.width, STORY_IMG_WIDTHS, 'full'), align: storyEnum(b.align, STORY_ALIGNS, 'center') };
      if (b.type === 'split') return { type: 'split', text: String(b.text || ''), image: b.image, imageSide: storyEnum(b.imageSide, STORY_IMG_SIDES, 'right'), align: storyEnum(b.align, STORY_ALIGNS, 'left') };
      return { type: 'text', value: String(b.value || ''), variant: storyEnum(b.variant, STORY_TEXT_VARIANTS, 'body'), align: storyEnum(b.align, STORY_ALIGNS, 'left') };
    });
    var listEl;
    var dragFrom = -1;   // 드래그 이동 시작 인덱스
    openOver('스토리', function (body) {
      body.appendChild(W.el('p', { class: 'wc-fld__help', style: 'margin:0 0 14px' },
        '프로젝트의 이야기를 글·이미지·글+사진 블록으로 자유롭게 구성하세요. 글은 제목·소제목·본문·인용 스타일과 정렬을, 이미지는 크기·정렬을 고를 수 있습니다. 블록은 끌어서 순서를 바꿀 수 있어요. 최소 1개 블록이 필요합니다.'));

      // ---- AI 스토리 초안 ----
      var aiCard = W.el('div', { class: 'wc-aidraft' });
      var aiTop = W.el('div', { class: 'wc-aidraft__top' });
      aiTop.append(
        W.el('span', { class: 'wc-aidraft__ic', html: IC.sparkle }),
        W.el('div', {},
          W.el('p', { class: 'wc-aidraft__name' }, 'AI로 초안 작성'),
          W.el('p', { class: 'wc-aidraft__desc' }, '입력한 기본 정보(제목·카테고리·소개·기본가·목표수량)를 바탕으로 스토리 본문 초안을 만들어 드립니다.'),
        ),
      );
      aiCard.appendChild(aiTop);
      var aiBtn = W.el('button', { class: 'wz-btn wz-btn--outline', type: 'button', html: IC.sparkle + '<span>AI로 초안 작성</span>' });
      var aiStatus = W.el('p', { class: 'wc-aidraft__status' });
      aiStatus.style.display = 'none';
      aiBtn.addEventListener('click', function () { runStoryDraft(aiBtn, aiStatus); });
      aiCard.append(aiBtn, aiStatus);
      body.appendChild(aiCard);

      // 초안 결과를 현재 draft 블록에 반영(덮어쓸지/추가할지 확인). AI 초안은 본문(body) 텍스트 블록으로 삽입.
      function applyAiBlocks(blocks) {
        var textBlocks = blocks.filter(function (b) { return b && b.type === 'text' && String(b.value || '').trim(); })
          .map(function (b) { return { type: 'text', value: String(b.value).slice(0, 5000), variant: 'body', align: 'left' }; });
        if (!textBlocks.length) { toast('AI 초안을 받지 못했습니다'); return; }
        var hasContent = draft.some(storyBlockHasContent);
        if (!hasContent) {
          draft = textBlocks; renderBlocks();
          toast('AI 초안을 불러왔습니다');
          return;
        }
        confirmModal('AI 초안 적용', '이미 작성한 스토리 내용이 있습니다. 어떻게 할까요?',
          [
            { label: '기존 내용 덮어쓰기', kind: 'primary', onClick: function () { draft = textBlocks; renderBlocks(); toast('AI 초안으로 교체했습니다'); } },
            { label: '뒤에 추가하기', kind: 'outline', onClick: function () { textBlocks.forEach(function (b) { draft.push(b); }); renderBlocks(); toast('AI 초안을 추가했습니다'); } },
          ]);
      }

      // 외부에서 결과를 넘기기 위한 클로저 등록
      _applyAiBlocks = applyAiBlocks;

      listEl = W.el('div', { class: 'wc-blocks' });
      renderBlocks();
      body.appendChild(listEl);

      // ---- 블록 추가 3종: 글 / 이미지 / 글+사진 ----
      var add = W.el('div', { class: 'wc-blockadd' });
      var addText = W.el('button', { class: 'wz-btn wz-btn--outline', type: 'button', html: IC.pen + '<span>글 추가</span>' });
      addText.addEventListener('click', function () {
        if (draft.length >= 40) { toast('블록은 최대 40개까지 추가할 수 있어요'); return; }
        draft.push({ type: 'text', value: '', variant: 'body', align: 'left' }); renderBlocks();
      });
      var addImg = W.el('label', { class: 'wz-btn wz-btn--outline', html: IC.upload + '<span>이미지 추가</span>' });
      var imgFileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
      imgFileIn.addEventListener('change', function () {
        if (draft.length >= 40) { toast('블록은 최대 40개까지 추가할 수 있어요'); imgFileIn.value = ''; return; }
        readImage(imgFileIn.files && imgFileIn.files[0], function (dataUrl) { draft.push({ type: 'image', value: dataUrl, width: 'full', align: 'center' }); renderBlocks(); });
        imgFileIn.value = '';
      });
      addImg.appendChild(imgFileIn);
      var addSplit = W.el('button', { class: 'wz-btn wz-btn--outline', type: 'button', html: IC.swap + '<span>글+사진 추가</span>' });
      addSplit.addEventListener('click', function () {
        if (draft.length >= 40) { toast('블록은 최대 40개까지 추가할 수 있어요'); return; }
        draft.push({ type: 'split', text: '', image: null, imageSide: 'right', align: 'left' }); renderBlocks();
      });
      add.append(addText, addImg, addSplit);
      body.appendChild(add);

      // 글(text) 블록 편집 UI
      function buildTextBlock(box, b) {
        var tools = W.el('div', { class: 'wc-btools' });
        // 스타일(variant) 칩 그룹
        var styleGroup = W.el('div', { class: 'wc-chipset', role: 'group', 'aria-label': '글 스타일' });
        var styleChips = {};
        STORY_TEXT_VARIANTS.forEach(function (v) {
          var chip = W.el('button', { class: 'wc-chip' + (b.variant === v ? ' is-on' : ''), type: 'button', 'aria-pressed': b.variant === v ? 'true' : 'false' }, STORY_VARIANT_LABEL[v]);
          chip.addEventListener('click', function () {
            b.variant = v;
            STORY_TEXT_VARIANTS.forEach(function (k) { styleChips[k].classList.toggle('is-on', k === v); styleChips[k].setAttribute('aria-pressed', k === v ? 'true' : 'false'); });
            applyTextStyle();
          });
          styleChips[v] = chip;
          styleGroup.appendChild(chip);
        });
        tools.appendChild(styleGroup);
        // 정렬(align) 아이콘 그룹
        var alignGroup = alignChipset(b, function () { applyTextStyle(); });
        tools.appendChild(alignGroup);
        box.appendChild(tools);

        var ta = textarea({ maxlength: '5000', placeholder: '내용을 입력하세요' });
        ta.value = b.value || '';
        ta.addEventListener('input', function () { b.value = ta.value; });
        box.appendChild(ta);

        function applyTextStyle() {
          ta.className = 'wc-textarea wc-textarea--' + b.variant + ' wc-al-' + b.align;
        }
        applyTextStyle();
      }

      // 이미지(image) 블록 편집 UI
      function buildImageBlock(box, b, idx) {
        var preview = W.el('div', { class: 'wc-bimg' });
        function renderImg() {
          preview.replaceChildren();
          if (b.value) {
            var holder = W.el('div', { class: 'wc-bimg__holder wc-al-' + b.align });
            var fig = W.el('div', { class: 'wc-bimg__fig wc-w-' + b.width });
            fig.appendChild(W.el('img', { src: b.value, alt: '스토리 이미지' }));
            // 우측 하단 핸들 드래그로 width 단계(sm→md→lg→full) 조절
            var handle = W.el('span', { class: 'wc-bimg__handle', 'aria-hidden': 'true' });
            enableWidthHandle(handle, b, function () { fig.className = 'wc-bimg__fig wc-w-' + b.width; syncWidthChips(); });
            fig.appendChild(handle);
            holder.appendChild(fig);
            preview.appendChild(holder);
          } else {
            var up = W.el('label', { class: 'wc-upload' });
            up.appendChild(W.el('div', { html: IC.upload }));
            up.appendChild(W.el('div', { class: 'wc-upload__text' }, '이미지 업로드'));
            up.appendChild(W.el('div', { class: 'wc-upload__hint' }, '클릭 또는 끌어다 놓기 · PNG · JPG · WEBP (최대 8MB)'));
            var fileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
            fileIn.addEventListener('change', function () { readImage(fileIn.files && fileIn.files[0], function (d) { b.value = d; renderImg(); }); fileIn.value = ''; });
            up.appendChild(fileIn);
            enableDrop(up, function (d) { b.value = d; renderImg(); });
            preview.appendChild(up);
          }
        }
        renderImg();
        box.appendChild(preview);

        var tools = W.el('div', { class: 'wc-btools' });
        // 크기(width) 칩 그룹
        var widthChips = {};
        var widthGroup = W.el('div', { class: 'wc-chipset', role: 'group', 'aria-label': '이미지 크기' });
        STORY_IMG_WIDTHS.forEach(function (w) {
          var chip = W.el('button', { class: 'wc-chip' + (b.width === w ? ' is-on' : ''), type: 'button', 'aria-pressed': b.width === w ? 'true' : 'false' }, STORY_WIDTH_LABEL[w]);
          chip.addEventListener('click', function () { b.width = w; syncWidthChips(); renderImg(); });
          widthChips[w] = chip;
          widthGroup.appendChild(chip);
        });
        tools.appendChild(widthGroup);
        tools.appendChild(alignChipset(b, function () { renderImg(); }));
        box.appendChild(tools);

        function syncWidthChips() {
          STORY_IMG_WIDTHS.forEach(function (w) { widthChips[w].classList.toggle('is-on', w === b.width); widthChips[w].setAttribute('aria-pressed', w === b.width ? 'true' : 'false'); });
        }
      }

      // 분할(split) 블록 편집 UI — 글 + 이미지 + 이미지 위치 토글
      function buildSplitBlock(box, b) {
        // 이미지 위치(imageSide) 토글
        var tools = W.el('div', { class: 'wc-btools' });
        var sideLabel = W.el('span', { class: 'wc-btools__label' }, '이미지 위치');
        var sideGroup = W.el('div', { class: 'wc-chipset', role: 'group', 'aria-label': '이미지 위치' });
        var sideChips = {};
        STORY_IMG_SIDES.forEach(function (s) {
          var chip = W.el('button', { class: 'wc-chip' + (b.imageSide === s ? ' is-on' : ''), type: 'button', 'aria-pressed': b.imageSide === s ? 'true' : 'false' }, s === 'left' ? '사진 왼쪽' : '사진 오른쪽');
          chip.addEventListener('click', function () {
            b.imageSide = s;
            STORY_IMG_SIDES.forEach(function (k) { sideChips[k].classList.toggle('is-on', k === s); sideChips[k].setAttribute('aria-pressed', k === s ? 'true' : 'false'); });
            renderPair();
          });
          sideChips[s] = chip;
          sideGroup.appendChild(chip);
        });
        tools.append(sideLabel, sideGroup, alignChipset(b, function () { applyTextAlign(); }));
        box.appendChild(tools);

        var pair = W.el('div', { class: 'wc-split' });
        var textCell, imgCell, taEl;
        function buildTextCell() {
          var cell = W.el('div', { class: 'wc-split__text' });
          taEl = textarea({ maxlength: '5000', placeholder: '사진 옆에 들어갈 글을 입력하세요' });
          taEl.value = b.text || '';
          taEl.addEventListener('input', function () { b.text = taEl.value; });
          cell.appendChild(taEl);
          return cell;
        }
        function buildImageCell() {
          var cell = W.el('div', { class: 'wc-split__img' });
          if (b.image) {
            var pv = W.el('div', { class: 'wc-preview' });
            pv.appendChild(W.el('img', { src: b.image, alt: '스토리 이미지' }));
            var del = W.el('button', { class: 'wc-preview__del', type: 'button', 'aria-label': '이미지 삭제', html: IC.close });
            del.addEventListener('click', function () { b.image = null; renderPair(); });
            pv.appendChild(del);
            cell.appendChild(pv);
          } else {
            var up = W.el('label', { class: 'wc-upload' });
            up.appendChild(W.el('div', { html: IC.upload }));
            up.appendChild(W.el('div', { class: 'wc-upload__text' }, '이미지 업로드'));
            up.appendChild(W.el('div', { class: 'wc-upload__hint' }, '클릭 또는 끌어다 놓기 · PNG · JPG · WEBP (최대 8MB)'));
            var fileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
            fileIn.addEventListener('change', function () { readImage(fileIn.files && fileIn.files[0], function (d) { b.image = d; renderPair(); }); fileIn.value = ''; });
            up.appendChild(fileIn);
            enableDrop(up, function (d) { b.image = d; renderPair(); });
            cell.appendChild(up);
          }
          return cell;
        }
        function renderPair() {
          pair.replaceChildren();
          pair.className = 'wc-split wc-split--' + b.imageSide;
          textCell = buildTextCell();
          imgCell = buildImageCell();
          // imageSide=right → 글 먼저(왼쪽), 사진 나중(오른쪽). left → 사진 먼저. DOM 순서로 좌우 결정.
          if (b.imageSide === 'left') pair.append(imgCell, textCell);
          else pair.append(textCell, imgCell);
          applyTextAlign();
        }
        function applyTextAlign() { if (taEl) taEl.className = 'wc-textarea wc-al-' + b.align; }
        renderPair();
        box.appendChild(pair);
      }

      // 정렬(align) 아이콘 칩 그룹(text/image/split 공용). onChange 후 b.align 갱신 + 콜백.
      function alignChipset(b, onChange) {
        var group = W.el('div', { class: 'wc-chipset wc-chipset--align', role: 'group', 'aria-label': '정렬' });
        var chips = {};
        STORY_ALIGNS.forEach(function (a) {
          var chip = W.el('button', { class: 'wc-chip wc-chip--icon' + (b.align === a ? ' is-on' : ''), type: 'button', 'aria-pressed': b.align === a ? 'true' : 'false', 'aria-label': STORY_ALIGN_LABEL[a] + ' 정렬', title: STORY_ALIGN_LABEL[a] + ' 정렬', html: STORY_ALIGN_ICON[a] });
          chip.addEventListener('click', function () {
            b.align = a;
            STORY_ALIGNS.forEach(function (k) { chips[k].classList.toggle('is-on', k === a); chips[k].setAttribute('aria-pressed', k === a ? 'true' : 'false'); });
            if (onChange) onChange();
          });
          chips[a] = chip;
          group.appendChild(chip);
        });
        return group;
      }

      // 모달 전체에 이미지를 끌어다 놓으면 이미지 블록으로 추가
      enableDrop(body, function (dataUrl) {
        if (draft.length >= 40) { toast('블록은 최대 40개까지 추가할 수 있어요'); return; }
        draft.push({ type: 'image', value: dataUrl, width: 'full', align: 'center' }); renderBlocks();
      }, true);

      function renderBlocks() {
        listEl.replaceChildren();
        draft.forEach(function (b, i) {
          // 블록 순서 이동: 핸들을 잡았을 때만 draggable 활성(textarea 텍스트 선택 방해 방지).
          var box = W.el('div', { class: 'wc-block wc-block--' + b.type, draggable: 'false' });
          box.addEventListener('dragstart', function (e) { dragFrom = i; box.classList.add('is-dragging'); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch (_) {} } });
          box.addEventListener('dragend', function () { dragFrom = -1; box.setAttribute('draggable', 'false'); box.classList.remove('is-dragging'); listEl.querySelectorAll('.wc-block').forEach(function (x) { x.classList.remove('is-dropover'); }); });
          box.addEventListener('dragover', function (e) { if (dragFrom === -1 || dragFrom === i) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; box.classList.add('is-dropover'); });
          box.addEventListener('dragleave', function () { box.classList.remove('is-dropover'); });
          box.addEventListener('drop', function (e) {
            e.preventDefault(); box.classList.remove('is-dropover');
            if (dragFrom === -1 || dragFrom === i) return;
            var moved = draft.splice(dragFrom, 1)[0];
            draft.splice(i, 0, moved);
            dragFrom = -1; renderBlocks();
          });

          var head = W.el('div', { class: 'wc-block__head' });
          var handle = W.el('span', { class: 'wc-block__handle', html: IC.drag, 'aria-label': '끌어서 순서 변경', role: 'button' });
          // 핸들을 누르고 있는 동안에만 블록을 draggable 로 — 누르면 enable, 떼면 disable.
          handle.addEventListener('mousedown', function () { box.setAttribute('draggable', 'true'); });
          handle.addEventListener('touchstart', function () { box.setAttribute('draggable', 'true'); }, { passive: true });
          handle.addEventListener('mouseup', function () { box.setAttribute('draggable', 'false'); });
          var typeWrap = W.el('div', { class: 'wc-block__typewrap' });
          typeWrap.append(handle, W.el('span', { class: 'wc-block__type' }, storyBlockTypeLabel(b)));
          var del = W.el('button', { class: 'wc-block__del', type: 'button' }, '삭제');
          del.addEventListener('click', function () { draft.splice(i, 1); renderBlocks(); });
          head.append(typeWrap, del);
          box.appendChild(head);

          if (b.type === 'image') buildImageBlock(box, b, i);
          else if (b.type === 'split') buildSplitBlock(box, b);
          else buildTextBlock(box, b);

          listEl.appendChild(box);
        });
        if (!draft.length) listEl.appendChild(W.el('p', { class: 'wc-fld__help' }, '아직 추가된 블록이 없습니다. 위 버튼으로 글·이미지·글+사진 블록을 추가해 보세요.'));
      }
    }, function () {
      // 스키마 형태로 정규화 + 빈/무효 블록 제외(서버 normalizeContentBlocks 와 동일 기준).
      var cleaned = [];
      draft.forEach(function (b) { var n = normalizeStoryBlock(b); if (n) cleaned.push(n); });
      cleaned = cleaned.slice(0, 40);
      if (!cleaned.length) { toast('스토리에 최소 1개 블록을 작성해 주세요'); return false; }
      nstate.storyBlocks = cleaned;
      return true;
    });
  }

  // 이미지 우측 하단 핸들 드래그 → width 단계(sm→md→lg→full) 조절. 가로 이동량 기준.
  function enableWidthHandle(handle, b, onChange) {
    var dragging = false, startX = 0, startIdx = 0;
    function idxOf(w) { var i = STORY_IMG_WIDTHS.indexOf(w); return i === -1 ? 3 : i; }
    function onMove(e) {
      if (!dragging) return;
      var x = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
      var step = Math.round((x - startX) / 70);   // 70px 당 한 단계
      var next = Math.max(0, Math.min(3, startIdx + step));
      var w = STORY_IMG_WIDTHS[next];
      if (w !== b.width) { b.width = w; if (onChange) onChange(); }
      if (e.cancelable) e.preventDefault();
    }
    function onUp() { dragging = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp); }
    function onDown(e) {
      dragging = true;
      startX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
      startIdx = idxOf(b.width);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
    // 핸들에서 시작하는 드래그가 블록 순서 이동(draggable)과 충돌하지 않도록.
    handle.addEventListener('dragstart', function (e) { e.preventDefault(); e.stopPropagation(); });
  }

  // 현재 열린 스토리 폼의 블록 적용 콜백(폼이 열려 있을 때만 유효)
  var _applyAiBlocks = null;

  /* AI 스토리 초안 호출 — 비용 가드: 사용자 클릭 시에만 호출 */
  function runStoryDraft(btn, statusEl) {
    var title = String(nstate.title || '').trim();
    var category = String(nstate.category || '').trim();
    var summary = String(nstate.description || '').trim();
    var basicInfo = { title: title, category: category, summary: summary };
    if (String(nstate.basePrice).trim() !== '' && Number.isFinite(Number(nstate.basePrice))) basicInfo.basePrice = Math.floor(Number(nstate.basePrice));
    if (String(nstate.targetQuantity).trim() !== '' && Number.isFinite(Number(nstate.targetQuantity))) basicInfo.targetQuantity = Math.floor(Number(nstate.targetQuantity));

    btn.disabled = true;
    statusEl.style.display = '';
    statusEl.className = 'wc-aidraft__status';
    statusEl.replaceChildren(W.el('span', { class: 'wc-spin wc-spin--sm' }), document.createTextNode('AI가 스토리 초안을 작성하고 있어요...'));

    window.api.post('/ai/story-draft', { basicInfo: basicInfo })
      .then(function (res) {
        btn.disabled = false;
        statusEl.style.display = 'none';
        var blocks = (res && Array.isArray(res.blocks)) ? res.blocks : [];
        if (_applyAiBlocks) _applyAiBlocks(blocks);
        else toast('AI 초안을 불러왔습니다');
      })
      .catch(function (err) {
        btn.disabled = false;
        statusEl.style.display = 'none';
        if (err && err.code === 'NEED_BASIC_INFO') {
          // 기본 정보 부족 → 안내 후 기본 정보 단계로 유도
          toast('제목·카테고리·소개를 먼저 입력해 주세요');
          confirmModal('기본 정보가 필요해요', 'AI 초안을 만들려면 제목·카테고리·한 줄 소개가 필요합니다. 기본 정보부터 입력할까요?',
            [{ label: '기본 정보 입력하기', kind: 'primary', onClick: function () { closeOver(); openBasicForm(); } }]);
          return;
        }
        if (err && (err.status === 503 || err.code === 'AI_UNAVAILABLE')) {
          toast('지금은 AI 초안을 사용할 수 없어요');
          return;
        }
        toast((err && err.message) ? err.message : 'AI 초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      });
  }

  /* 간단 확인 모달(버튼 1~2개). actions: [{label, kind:'primary'|'outline', onClick}] */
  function confirmModal(title, message, actions) {
    var modal = W.el('div', { class: 'wc-modal is-open' });
    var dim = W.el('div', { class: 'wc-modal__dim' });
    dim.addEventListener('click', close);
    var box = W.el('div', { class: 'wc-modal__box wc-confirm', role: 'dialog', 'aria-label': title });
    var head = W.el('div', { class: 'wc-modal__head' });
    var closeBtn = W.el('button', { class: 'wc-modal__close', type: 'button', 'aria-label': '닫기', html: IC.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h2', { class: 'wc-modal__title' }, title), closeBtn);
    box.appendChild(head);
    box.appendChild(W.el('p', { class: 'wc-modal__sub' }, message));
    var foot = W.el('div', { class: 'wc-confirm__foot' });
    (actions || []).forEach(function (a) {
      var b = W.el('button', { class: 'wz-btn ' + (a.kind === 'outline' ? 'wz-btn--outline' : 'wz-btn--primary'), type: 'button' }, a.label);
      b.addEventListener('click', function () { close(); if (a.onClick) a.onClick(); });
      foot.appendChild(b);
    });
    var cancel = W.el('button', { class: 'wz-btn wz-btn--ghost', type: 'button' }, '취소');
    cancel.addEventListener('click', close);
    foot.appendChild(cancel);
    box.appendChild(foot);
    modal.append(dim, box);
    document.body.appendChild(modal);
    function close() { if (modal.parentNode) modal.parentNode.removeChild(modal); }
  }

  /* ---- 창작자 정보 ---- */
  function openCreatorForm() {
    var nameIn, introIn, imageState = nstate.creatorImage, imageWrap;
    var sidoSel, sigunguSel;
    var regions = window.KR_REGIONS || {};
    openOver('창작자 정보', function (body) {
      body.appendChild(W.el('p', { class: 'wc-fld__help', style: 'margin:0 0 16px' },
        '후원자에게 보일 창작자(팀) 정보입니다. 이름과 소개는 필수입니다.'));

      nameIn = input({ type: 'text', value: nstate.creatorName, maxlength: '20', placeholder: '창작자 또는 팀 이름' });
      body.appendChild(field('창작자 이름', true, nameIn, '후원자에게 표시되는 이름입니다. 최대 20자.'));

      imageWrap = W.el('div', {});
      function renderImage() {
        imageWrap.replaceChildren();
        if (imageState) {
          var pv = W.el('div', { class: 'wc-preview wc-preview--avatar' });
          pv.appendChild(W.el('img', { src: imageState, alt: '프로필 이미지 미리보기' }));
          var del = W.el('button', { class: 'wc-preview__del', type: 'button', 'aria-label': '이미지 삭제', html: IC.close });
          del.addEventListener('click', function () { imageState = null; renderImage(); });
          pv.appendChild(del);
          imageWrap.appendChild(pv);
        } else {
          var up = W.el('label', { class: 'wc-upload' });
          up.appendChild(W.el('div', { html: IC.upload }));
          up.appendChild(W.el('div', { class: 'wc-upload__text' }, '프로필 이미지 업로드'));
          up.appendChild(W.el('div', { class: 'wc-upload__hint' }, '클릭 또는 끌어다 놓기 · PNG · JPG · WEBP (최대 8MB)'));
          var fileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
          fileIn.addEventListener('change', function () {
            readImage(fileIn.files && fileIn.files[0], function (dataUrl) { imageState = dataUrl; renderImage(); });
          });
          up.appendChild(fileIn);
          enableDrop(up, function (dataUrl) { imageState = dataUrl; renderImage(); });
          imageWrap.appendChild(up);
        }
      }
      renderImage();
      body.appendChild(field('프로필 이미지', false, imageWrap, '창작자 페이지·메이커 정보에 표시됩니다.'));

      introIn = textarea({ maxlength: '300', placeholder: '어떤 창작자(팀)인지, 어떤 작업을 해왔는지 소개해 주세요.' });
      introIn.value = nstate.creatorIntro || '';
      body.appendChild(field('창작자 소개', true, introIn, '최대 300자.'));

      // 주 활동 지역: 시·도 → 시·군·구 종속 select
      var regionGrid = W.el('div', { class: 'wc-region' });
      sidoSel = W.el('select', { class: 'wc-select' });
      sidoSel.appendChild(W.el('option', { value: '' }, '시·도 선택'));
      Object.keys(regions).forEach(function (sido) {
        var opt = W.el('option', { value: sido }, sido);
        if (nstate.creatorSido === sido) opt.setAttribute('selected', 'selected');
        sidoSel.appendChild(opt);
      });
      sigunguSel = W.el('select', { class: 'wc-select' });
      function fillSigungu(keepValue) {
        sigunguSel.replaceChildren();
        sigunguSel.appendChild(W.el('option', { value: '' }, '시·군·구 선택'));
        var list = regions[sidoSel.value] || [];
        list.forEach(function (sg) {
          var opt = W.el('option', { value: sg }, sg);
          if (keepValue && nstate.creatorSigungu === sg) opt.setAttribute('selected', 'selected');
          sigunguSel.appendChild(opt);
        });
        sigunguSel.disabled = !sidoSel.value;
      }
      fillSigungu(true);
      sidoSel.addEventListener('change', function () { fillSigungu(false); });
      regionGrid.append(sidoSel, sigunguSel);
      body.appendChild(field('주 활동 지역 (선택)', false, regionGrid, '시·도를 먼저 선택하면 시·군·구를 고를 수 있습니다.'));
    }, function () {
      var name = nameIn.value.trim(), intro = introIn.value.trim();
      if (!name) { toast('창작자 이름을 입력해 주세요'); return false; }
      if (!intro) { toast('창작자 소개를 입력해 주세요'); return false; }
      nstate.creatorName = name.slice(0, 20);
      nstate.creatorIntro = intro.slice(0, 300);
      nstate.creatorImage = imageState;
      nstate.creatorSido = sidoSel.value || '';
      nstate.creatorSigungu = sidoSel.value ? (sigunguSel.value || '') : '';
      return true;
    });
  }

  /* ---- 정책 ---- */
  function openPolicyForm() {
    var refundIn, legalIn;
    openOver('정책', function (body) {
      body.appendChild(W.el('div', { class: 'wc-fld__notice wc-fld__notice--info' },
        '교환·환불 정책과 상품 정보 고시는 스토리와 별도로 저장되어, 상세 페이지 맨 끝에 따로 표시됩니다. 두 항목 모두 필수입니다.'));
      refundIn = textarea({ maxlength: '5000', placeholder: '교환·환불 기준, 배송 지연 시 처리 방법 등' });
      refundIn.value = nstate.refundPolicy || '';
      body.appendChild(field('교환·환불 정책', true, refundIn, '후원자가 알아야 할 교환·환불·배송 지연 처리 기준을 적어 주세요. 최대 5000자.'));
      legalIn = textarea({ maxlength: '5000', placeholder: '제품 소재·치수, 제조국, A/S 안내 등 정보 고시' });
      legalIn.value = nstate.legalNotice || '';
      body.appendChild(field('상품 정보 고시', true, legalIn, '제품 소재·치수·제조국·A/S 등 법정 정보 고시 내용을 적어 주세요. 최대 5000자.'));
    }, function () {
      var refund = refundIn.value.trim(), legal = legalIn.value.trim();
      if (!refund) { toast('교환·환불 정책을 입력해 주세요'); return false; }
      if (!legal) { toast('상품 정보 고시를 입력해 주세요'); return false; }
      nstate.refundPolicy = refund;
      nstate.legalNotice = legal;
      return true;
    });
  }

  /* ---- 메이커 정보 ---- */
  function openMakerForm() {
    var introIn, contactIn;
    openOver('메이커 정보', function (body) {
      body.appendChild(W.el('div', { class: 'wc-fld__notice wc-fld__notice--info' },
        '메이커 정보는 스토리와 별도로 저장되어, 상세 페이지 맨 끝에 따로 표시됩니다. 소개와 문의처 모두 필수입니다.'));
      introIn = textarea({ maxlength: '1000', placeholder: '메이커(팀) 소개' });
      introIn.value = nstate.makerIntro || '';
      body.appendChild(field('메이커 소개', true, introIn, '어떤 메이커(팀)가 만드는지 후원자에게 소개해 주세요. 최대 1000자.'));
      contactIn = input({ type: 'text', maxlength: '200', placeholder: '문의 이메일 또는 오픈채팅 링크' });
      contactIn.value = nstate.makerContact || '';
      body.appendChild(field('문의처', true, contactIn, '후원자 문의를 받을 연락 수단입니다.'));
    }, function () {
      var intro = introIn.value.trim(), contact = contactIn.value.trim();
      if (!intro) { toast('메이커 소개를 입력해 주세요'); return false; }
      if (!contact) { toast('문의처를 입력해 주세요'); return false; }
      nstate.makerIntro = intro;
      nstate.makerContact = contact;
      return true;
    });
  }

  /* ---- AI 가상 피팅/전시 모달(별도) — 카테고리에 따라 분기 ---- */
  function openAiModal() {
    var apparel = aiIsApparel();
    var label = aiLabel();
    var modal = W.el('div', { class: 'wc-modal' });
    var dim = W.el('div', { class: 'wc-modal__dim' });
    dim.addEventListener('click', close);
    var box = W.el('div', { class: 'wc-modal__box', role: 'dialog', 'aria-label': label });

    var head = W.el('div', { class: 'wc-modal__head' });
    var closeBtn = W.el('button', { class: 'wc-modal__close', type: 'button', 'aria-label': '닫기', html: IC.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h2', { class: 'wc-modal__title' }, label), closeBtn);
    box.appendChild(head);
    box.appendChild(W.el('p', { class: 'wc-modal__sub' }, apparel
      ? '디자인(의류) 이미지를 업로드하면 모델 착용 사진을 생성합니다. 결과는 대표 이미지로 사용할 수 있습니다.'
      : '디자인 이미지를 업로드하면 제품 전시·연출 사진을 생성합니다. 결과는 대표 이미지로 사용할 수 있습니다.'));

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
        up.appendChild(W.el('div', { class: 'wc-upload__hint' }, '클릭 또는 끌어다 놓기 · PNG · JPG · WEBP (최대 8MB)'));
        var fileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
        fileIn.addEventListener('change', function () { readImage(fileIn.files && fileIn.files[0], function (d) { sourceState = d; renderSource(); }); });
        up.appendChild(fileIn);
        enableDrop(up, function (d) { sourceState = d; renderSource(); });
        previewWrap.appendChild(up);
      }
    }
    renderSource();
    box.appendChild(field('디자인 이미지', false, previewWrap));

    var opts = W.el('div', { class: 'wc-opts' });
    // 모델 선택은 의류(가상 피팅)일 때만. 굿즈(가상 전시)는 배경만 고른다.
    var modelSel = W.el('select', { class: 'wc-select' });
    [['female', '여성 모델'], ['male', '남성 모델'], ['female_athletic', '여성(운동)'], ['male_athletic', '남성(운동)']]
      .forEach(function (o) { modelSel.appendChild(W.el('option', { value: o[0] }, o[1])); });
    var bgSel = W.el('select', { class: 'wc-select' });
    [['studio', '스튜디오'], ['campus', '캠퍼스'], ['classroom', '강의실'], ['outdoor', '야외']]
      .forEach(function (o) { bgSel.appendChild(W.el('option', { value: o[0] }, o[1])); });
    if (apparel) opts.append(field('모델', false, modelSel), field('배경', false, bgSel));
    else opts.append(field('배경', false, bgSel));
    box.appendChild(opts);

    var statusEl = W.el('div', {});
    var resultWrap = W.el('div', { class: 'wc-modal__result', style: 'display:none' });
    box.append(statusEl, resultWrap);

    var foot = W.el('div', { class: 'wc-over__foot', style: 'border:0;padding:18px 0 0' });
    var genBtn = W.el('button', { class: 'wz-btn wz-btn--primary', type: 'button' }, apparel ? 'AI 피팅 생성' : 'AI 전시 생성');
    var useBtn = W.el('button', { class: 'wz-btn wz-btn--outline', type: 'button' }, '대표 이미지로 사용');
    useBtn.disabled = true;
    genBtn.addEventListener('click', function () {
      if (!sourceState) { toast('디자인 이미지를 업로드해 주세요'); return; }
      statusEl.className = 'wc-modal__status';
      statusEl.replaceChildren(W.el('div', { class: 'wc-spin' }), document.createTextNode('AI가 이미지를 생성하고 있어요. 잠시만 기다려 주세요.'));
      genBtn.disabled = true;
      // category 전달 → 서버가 의류=착용 / 굿즈=전시 모드로 생성. 굿즈는 modelType 생략.
      var aiBody = { imageDataUrls: [sourceState], background: bgSel.value, category: nstate.category };
      if (apparel) aiBody.modelType = modelSel.value;
      window.api.post('/ai/try-on', aiBody)
        .then(function (res) {
          var url = res && res.tryOnDataUrl;
          if (!url) throw new Error('NO_RESULT');
          resultState = url;
          statusEl.replaceChildren();
          resultWrap.style.display = '';
          resultWrap.replaceChildren(W.el('img', { src: url, alt: label + ' 결과' }));
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
      toast(label + ' 결과를 대표 이미지로 적용했습니다');
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

        // contentBlocks: 리치 스키마 그대로 전송(서버 normalizeContentBlocks 가 재검증·정규화).
        //   text  → {type, value, variant, align}   image → {type, value, width, align}
        //   split → {type, text, image, imageSide, align}
        // 정책·메이커 정보는 스토리에 합치지 않고 별도 필드로 전송(상세에서 따로 표시).
        var blocks = nstate.storyBlocks.map(function (b) {
          if (b.type === 'image') return { type: 'image', value: b.value, width: b.width, align: b.align };
          if (b.type === 'split') return { type: 'split', text: b.text, image: b.image, imageSide: b.imageSide, align: b.align };
          return { type: 'text', value: b.value, variant: b.variant, align: b.align };
        });

        // rewardTiers: API 계약 {title, price, desc, stock?}
        var rewards = nstate.rewardTiers.map(function (t) {
          var r = { title: t.title, price: t.price, desc: t.desc || '' };
          if (t.stock != null) r.stock = t.stock;
          return r;
        });

        var payload = {
          mode: 'normal',
          plan: PLAN_INFO[nstate.plan] ? nstate.plan : 'start',
          title: nstate.title,
          description: nstate.description,
          category: nstate.category,
          basePrice: Math.floor(Number(nstate.basePrice)),
          targetQuantity: Math.floor(Number(nstate.targetQuantity)),
          deadline: deadlineToIso(nstate.deadline),
          contentBlocks: blocks,
          rewardTiers: rewards,
          // 정책: 스토리와 분리된 별도 필드(서버가 refund_policy/legal_notice 컬럼에 저장).
          refundPolicy: String(nstate.refundPolicy || '').trim(),
          legalNotice: String(nstate.legalNotice || '').trim(),
        };
        // 공개 예정(run·boost 전용): openAt 을 보내면 서버가 status=scheduled 로 처리.
        if ((nstate.plan === 'run' || nstate.plan === 'boost') && nstate.openScheduled && nstate.openAt) {
          payload.openAt = nstate.openAt;
        }
        // 대표 이미지: 업로드 data URL 우선 -> 없으면 AI 피팅 결과
        var cover = nstate.coverImage || nstate.tryonImage;
        if (cover) payload.designImageDataUrl = cover;
        // 대표 영상(선택): 서버 검증 형태만
        var video = normalizeVideo(nstate.videoUrl);
        if (video) payload.videoUrl = video;
        // 창작자·메이커 정보(별도 JSONB) — 유효한 값만 추려 보냄
        var creator = buildCreatorInfo();
        if (creator) payload.creatorInfo = creator;
        // designFee·platformFee 는 서버 계산. 클라가 보내지 않음.

        return window.api.post('/funds', payload)
          .then(function (res) {
            stopAutosave();
            // 제출 성공 시 임시저장 정리(있으면)
            if (draftId) { window.api.del('/me/drafts/' + encodeURIComponent(draftId)).catch(function () {}); draftId = null; }
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

  // 창작자·메이커 정보 payload(별도 JSONB) — 서버 검증 한도에 맞춰 유효 필드만. 하나도 없으면 null.
  function buildCreatorInfo() {
    var out = {};
    var name = String(nstate.creatorName || '').trim();
    if (name) out.name = name.slice(0, 20);
    var intro = String(nstate.creatorIntro || '').trim();
    if (intro) out.intro = intro.slice(0, 300);
    var sido = String(nstate.creatorSido || '').trim();
    if (sido) out.sido = sido.slice(0, 30);
    var sigungu = String(nstate.creatorSigungu || '').trim();
    if (sigungu) out.sigungu = sigungu.slice(0, 30);
    var img = String(nstate.creatorImage || '').trim();
    if (img && (/^data:image\/(png|jpe?g|webp);base64,/.test(img) || /^https?:\/\//.test(img)) && img.length <= 12000000) out.image = img;
    // 메이커 정보(필수 단계) — 창작자 정보와 동일한 JSONB 에 함께 보관.
    var makerIntro = String(nstate.makerIntro || '').trim();
    if (makerIntro) out.makerIntro = makerIntro.slice(0, 1000);
    var makerContact = String(nstate.makerContact || '').trim();
    if (makerContact) out.makerContact = makerContact.slice(0, 200);
    return Object.keys(out).length ? out : null;
  }

  /* =====================================================================
   * 대리 개설
   * ===================================================================== */
  var pstate;
  function startProxy() {
    pstate = { title: '', category: '', contactPhone: '', requestNote: '', targetQuantity: '', deadline: '', attachments: [] };
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

    /* 첨부 파일 (선택) — 디자인 시안·로고·참고 이미지. 드래그앤드롭 지원. */
    if (!Array.isArray(pstate.attachments)) pstate.attachments = [];
    var attachWrap = W.el('div', { class: 'wc-proxy__attach' });
    attachWrap.appendChild(W.el('p', { class: 'wc-proxy__optional-title' }, '첨부 파일 (선택)'));
    var attachGrid = W.el('div', { class: 'wc-attach-grid' });
    function renderAttach() {
      attachGrid.replaceChildren();
      pstate.attachments.forEach(function (src, i) {
        var pv = W.el('div', { class: 'wc-attach-item' });
        pv.appendChild(W.el('img', { src: src, alt: '첨부 이미지' }));
        var del = W.el('button', { class: 'wc-preview__del', type: 'button', 'aria-label': '첨부 삭제', html: IC.close });
        del.addEventListener('click', function () { pstate.attachments.splice(i, 1); renderAttach(); });
        pv.appendChild(del);
        attachGrid.appendChild(pv);
      });
      if (pstate.attachments.length < 6) {
        var up = W.el('label', { class: 'wc-upload wc-attach-add' });
        up.appendChild(W.el('div', { html: IC.upload }));
        up.appendChild(W.el('div', { class: 'wc-upload__text' }, '파일 추가'));
        up.appendChild(W.el('div', { class: 'wc-upload__hint' }, '클릭 또는 끌어다 놓기'));
        var fileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: 'multiple', style: 'display:none' });
        function addFiles(files) {
          files.slice(0, 6).forEach(function (f) {
            readImage(f, function (d) { if (pstate.attachments.length < 6) { pstate.attachments.push(d); renderAttach(); } });
          });
        }
        fileIn.addEventListener('change', function () { addFiles(Array.prototype.slice.call(fileIn.files || [])); fileIn.value = ''; });
        up.appendChild(fileIn);
        enableDrop(up, function (d) { if (pstate.attachments.length < 6) { pstate.attachments.push(d); renderAttach(); } }, true);
        attachGrid.appendChild(up);
      }
    }
    renderAttach();
    attachWrap.appendChild(attachGrid);
    attachWrap.appendChild(W.el('p', { class: 'wc-fld__help' }, '디자인 시안·로고·참고 이미지를 첨부하면 더 빠르게 진행됩니다. 이미지 최대 6장.'));
    formCard.appendChild(attachWrap);

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
        if (Array.isArray(pstate.attachments) && pstate.attachments.length) payload.attachments = pstate.attachments.slice(0, 6);

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

  // 대표 영상 파일 → data URL. mp4/webm/quicktime, 최대 30MB.
  function readVideo(file, cb) {
    if (!file) return;
    if (!/^video\/(mp4|webm|quicktime)$/.test(file.type)) { toast('MP4·WEBM·MOV 영상만 업로드할 수 있어요'); return; }
    if (file.size > 30 * 1024 * 1024) { toast('영상은 최대 30MB까지 가능합니다'); return; }
    var r = new FileReader();
    r.onload = function () { cb(String(r.result)); };
    r.onerror = function () { toast('영상을 읽지 못했습니다'); };
    r.readAsDataURL(file);
  }

  // 영상 드래그앤드롭(단일 파일).
  function enableVideoDrop(el, cb) {
    if (!el) return el;
    el.classList.add('wc-drop');
    el.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); el.classList.add('is-drag'); });
    el.addEventListener('dragleave', function (e) { e.preventDefault(); e.stopPropagation(); el.classList.remove('is-drag'); });
    el.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation(); el.classList.remove('is-drag');
      var files = (e.dataTransfer && e.dataTransfer.files) ? Array.prototype.slice.call(e.dataTransfer.files) : [];
      if (files.length) readVideo(files[0], cb);
    });
    return el;
  }

  // 서버 검증과 동일한 형태만 통과시키고, 아니면 ''(저장 안 함).
  function normalizeVideo(v) {
    var s = String(v || '').trim();
    if (!s) return '';
    if (/^data:video\/(mp4|webm|quicktime);base64,/.test(s)) return s.length <= 48000000 ? s : '';
    if (/^https?:\/\//.test(s)) return s.length <= 48000000 ? s : '';
    return '';
  }

  // 드래그앤드롭: 대상 요소에 부착 → 파일을 떨어뜨리면 readImage 로 처리.
  // multi=true 면 떨어뜨린 파일을 모두(최대 6장) 콜백으로 넘긴다.
  function enableDrop(el, cb, multi) {
    if (!el) return el;
    el.classList.add('wc-drop');
    el.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); el.classList.add('is-drag'); });
    el.addEventListener('dragleave', function (e) { e.preventDefault(); e.stopPropagation(); el.classList.remove('is-drag'); });
    el.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation(); el.classList.remove('is-drag');
      var files = (e.dataTransfer && e.dataTransfer.files) ? Array.prototype.slice.call(e.dataTransfer.files) : [];
      if (!files.length) return;
      if (multi) files.slice(0, 6).forEach(function (f) { readImage(f, cb); });
      else readImage(files[0], cb);
    });
    return el;
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
