/**
 * 프로젝트 올리기 — 작업실(워크스페이스) 방식
 *
 * 흐름(스펙 §3.2):
 *  1. "무엇을 만들까요?" — 유형/카테고리 카드 + 진행방식(직접/대리) 선택 → 다음
 *  2. 프로젝트 작업실 — 상단 요약(대표이미지·[카테고리]·제목·"기획중·N% 완료") +
 *     섹션 카드 그리드(기본정보 / 목표·일정 / 선물구성 / 프로젝트계획 / 창작자정보 / 신뢰와안전).
 *     각 카드 클릭 → 슬라이드오버 폼 패널. AI 가상피팅은 "별도 모달"로만 진입(메인 흐름 임베드 금지).
 *  3. 모든 섹션 충족 시 "검토 후 개설하기" → 검토 모달 → 제출(POST /funds).
 *
 * 보존(기존 그대로 유지):
 *  - 제출 페이로드: title/description/department/category/rewardTiers/delegated/
 *    targetQuantity/deadline/designImageDataUrl/tryOnImages/contentBlocks
 *  - reward composer / content composer / AI try-on 호출(/ai/try-on) / 제출 핸들러(POST /funds)
 *  - api.js 의 전역 window.api 사용
 */

(function () {
  // ========== 상수 ==========
  const MIN_DEADLINE_DAYS = 7;
  const RECOMMEND_DEADLINE_DAYS = 14;
  const MAX_IMAGES = 5;
  const MAX_TIERS = 12;

  // 섹션 정의 — 카드 그리드/패널 공통 메타. icon 은 인라인 SVG path 콘텐츠(정적, 안전).
  const SECTIONS = [
    { id: 'basic',   label: '기본 정보',        desc: '제목·한줄소개·대표이미지', icon: '<path d="M4 5h16v14H4z"/><path d="M4 9h16"/><path d="M8 13h6"/>' },
    { id: 'goal',    label: '목표 금액 및 일정', desc: '목표 수량·마감일',          icon: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>' },
    { id: 'rewards', label: '선물 구성',        desc: '리워드 티어·금액',          icon: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7"/><path d="M12 8S10.5 3 8 3a2.5 2.5 0 000 5h4z"/>' },
    { id: 'story',   label: '프로젝트 계획',    desc: '스토리 본문·사진',          icon: '<path d="M5 4h11l4 4v12H5z"/><path d="M15 4v4h4"/><path d="M9 13h6M9 17h6"/>' },
    { id: 'creator', label: '창작자 정보',      desc: '소개·연락 수단',            icon: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-1a6 6 0 0112 0v1"/>' },
    { id: 'trust',   label: '신뢰와 안전',      desc: '주의사항 확인',            icon: '<path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z"/><path d="M9 12l2 2 4-4"/>' },
  ];

  // ========== 상태 ==========
  const state = {
    category: '',       // 선택 카테고리 slug
    delegated: false,   // 대리 개설 여부
    started: false,     // 작업실 진입 여부
    designImages: [],   // 업로드한 디자인 이미지 (dataURL 배열, 최대 5장)
    tryOnImage: null,   // AI 가상피팅 결과
    coverImage: null,   // 대표 이미지 (직접 업로드 or AI 결과)
    contentBlocks: [],  // 게시글 본문 블록 [{type:'text'|'image', value}]
    rewardTiers: [],    // 리워드(선물) [{title, price, description, stockLimit}]
    creator: { name: '', intro: '', contact: '' },
    trust: { 1: false, 2: false, 3: false },
    me: null,
    formValues: null,   // 검토/제출용 정제 값
  };

  // ========== 초기화 ==========
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    buildCategoryGrid();
    bindModeCards();
    bindChooseNav();
    bindWorkspaceChrome();
    bindPanel();
    bindCoverUpload();
    bindAiModal();
    bindReviewModal();

    bindAiGarmentInput();
    bindRewardComposer();
    bindContentComposer();
    setDefaultDeadline();

    presetCategoryFromUrl();

    try {
      state.me = await api.get('/auth/me');
    } catch (err) {
      // 미로그인이면 api.js 가 /login.html 로 보냄
    }
  }

  // ====================================================================
  // 화면 1: "무엇을 만들까요?"
  // ====================================================================
  function buildCategoryGrid() {
    const grid = document.getElementById('fcCatGrid');
    if (!grid) return;
    const cats = window.DT_CATEGORIES || [];
    grid.innerHTML = '';
    cats.forEach(function (c) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'fc-cat-card';
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', 'false');
      card.dataset.slug = c.slug;

      const ic = document.createElement('span');
      ic.className = 'fc-cat-card__ic';
      const svg = (typeof window.categoryIconSvg === 'function') ? window.categoryIconSvg(c.key) : '';
      if (svg) ic.innerHTML = svg; // 정적 아이콘 콘텐츠(에셋/폴백 SVG)

      const label = document.createElement('span');
      label.className = 'fc-cat-card__label';
      label.textContent = c.label; // XSS 안전

      card.appendChild(ic);
      card.appendChild(label);
      card.addEventListener('click', function () { selectCategory(c.slug); });
      grid.appendChild(card);
    });
  }

  function selectCategory(slug) {
    state.category = slug;
    document.querySelectorAll('#fcCatGrid .fc-cat-card').forEach(function (el) {
      const on = el.dataset.slug === slug;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    refreshChooseNext();
  }

  // URL ?category= 로 진입 시 기본 선택
  function presetCategoryFromUrl() {
    const raw = new URLSearchParams(window.location.search).get('category') || '';
    const matched = (typeof window.dtCategory === 'function') ? window.dtCategory(raw) : null;
    if (matched) selectCategory(matched.slug);
  }

  function bindModeCards() {
    document.querySelectorAll('.fc-mode-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.delegated = btn.dataset.mode === 'delegate';
        paintModeCards();
        refreshChooseNext();
      });
    });
    paintModeCards();
  }

  function paintModeCards() {
    document.querySelectorAll('.fc-mode-card').forEach(function (btn) {
      const on = (btn.dataset.mode === 'delegate') === state.delegated;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function refreshChooseNext() {
    const btn = document.getElementById('fcChooseNext');
    if (btn) btn.disabled = !state.category;
  }

  function bindChooseNav() {
    const next = document.getElementById('fcChooseNext');
    if (next) next.addEventListener('click', enterWorkspace);
    const back = document.getElementById('fcBackToChoose');
    if (back) back.addEventListener('click', backToChoose);
  }

  // ====================================================================
  // 화면 2: 작업실(워크스페이스)
  // ====================================================================
  function enterWorkspace() {
    if (!state.category) return;
    state.started = true;
    // 대리 개설이면 선물구성 섹션은 두띵이 담당 → 숨김
    syncDelegateUi();
    document.getElementById('fcChoose').hidden = true;
    document.getElementById('fcWorkspace').hidden = false;
    buildSectionGrid();
    renderWorkspaceHead();
    updateProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function backToChoose() {
    state.started = false;
    document.getElementById('fcWorkspace').hidden = true;
    document.getElementById('fcChoose').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 대리 개설 여부에 따라 리워드 섹션/안내 토글
  function syncDelegateUi() {
    const note = document.getElementById('rewardDelegateNote');
    const rewardField = document.getElementById('rewardField');
    if (note) note.hidden = !state.delegated;
    if (rewardField) rewardField.style.display = state.delegated ? 'none' : '';
  }

  // 활성 섹션 목록(대리 개설 시 선물구성 제외)
  function activeSections() {
    return SECTIONS.filter(function (s) {
      if (s.id === 'rewards' && state.delegated) return false;
      return true;
    });
  }

  function buildSectionGrid() {
    const grid = document.getElementById('fcSectionGrid');
    if (!grid) return;
    grid.innerHTML = '';
    activeSections().forEach(function (sec) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'fc-sec-card';
      card.dataset.section = sec.id;

      const ic = document.createElement('span');
      ic.className = 'fc-sec-card__ic';
      ic.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + sec.icon + '</svg>';

      const body = document.createElement('span');
      body.className = 'fc-sec-card__body';
      const title = document.createElement('span');
      title.className = 'fc-sec-card__title';
      title.textContent = sec.label;
      const desc = document.createElement('span');
      desc.className = 'fc-sec-card__desc';
      desc.textContent = sec.desc;
      body.appendChild(title);
      body.appendChild(desc);

      const status = document.createElement('span');
      status.className = 'fc-sec-card__status';
      status.dataset.statusFor = sec.id;
      status.textContent = '0% 작성완료';

      card.appendChild(ic);
      card.appendChild(body);
      card.appendChild(status);
      card.addEventListener('click', function () { openPanel(sec.id); });
      grid.appendChild(card);
    });
  }

  function renderWorkspaceHead() {
    const catObj = (typeof window.dtCategory === 'function') ? window.dtCategory(state.category) : null;
    const catEl = document.getElementById('fcWsCat');
    if (catEl) catEl.textContent = catObj ? catObj.label : '카테고리';

    const titleEl = document.getElementById('fcWsTitle');
    const title = (document.getElementById('fundTitle').value || '').trim();
    if (titleEl) titleEl.textContent = title || '내 프로젝트';

    const thumb = document.getElementById('fcWsThumb');
    if (thumb) {
      thumb.innerHTML = '';
      if (state.coverImage) {
        const img = document.createElement('img');
        img.src = state.coverImage;
        img.alt = '대표 이미지';
        thumb.appendChild(img);
        thumb.classList.remove('is-empty');
      } else {
        thumb.classList.add('is-empty');
        const ic = document.createElement('div');
        ic.className = 'fc-ws-head__thumb-ic';
        const key = catObj ? catObj.key : 'etc';
        ic.innerHTML = (typeof window.categoryIconSvg === 'function') ? window.categoryIconSvg(key) : '';
        thumb.appendChild(ic);
      }
    }

    // AI 가상피팅 안내 — 의류/굿즈 타입별 문구
    const type = (typeof window.dtCategoryType === 'function') ? window.dtCategoryType(state.category) : 'none';
    const ctaDesc = document.getElementById('fcAiCtaDesc');
    const aiWrap = document.getElementById('fcAiCtaWrap');
    if (aiWrap) {
      if (type === 'none') {
        aiWrap.style.display = 'none';
      } else {
        aiWrap.style.display = '';
        if (ctaDesc) {
          ctaDesc.textContent = (type === 'apparel')
            ? '디자인을 올리면 AI가 모델 착용 미리보기를 만들어줘요. 결과를 대표이미지로 쓸 수 있어요.'
            : '디자인을 올리면 AI가 깔끔한 전시 컷을 만들어줘요. 결과를 대표이미지로 쓸 수 있어요.';
        }
      }
    }
  }

  // ====================================================================
  // 섹션 완료 판정 + 진행률
  // ====================================================================
  function isSectionComplete(id) {
    if (id === 'basic') {
      return !!(document.getElementById('fundTitle').value || '').trim();
    }
    if (id === 'goal') {
      const q = parseInt(document.getElementById('fundTargetQuantity').value, 10);
      const d = document.getElementById('fundDeadline').value;
      return Number.isFinite(q) && q >= 1 && !!d;
    }
    if (id === 'rewards') {
      if (state.delegated) return true; // 대리 개설은 두띵이 담당
      return !!collectRewardTiers();
    }
    if (id === 'story') {
      return state.contentBlocks.some(function (b) {
        return b.type === 'image' || (b.value && b.value.trim());
      });
    }
    if (id === 'creator') {
      // 선택 섹션 — 하나라도 입력하면 완료, 비어도 진행은 가능(필수 아님)
      return !!(state.creator.name || state.creator.intro || state.creator.contact);
    }
    if (id === 'trust') {
      return state.trust[1] && state.trust[2] && state.trust[3];
    }
    return false;
  }

  // 필수 섹션(검토 진입 게이트). 창작자 정보는 선택.
  const REQUIRED_SECTIONS = ['basic', 'goal', 'rewards', 'story', 'trust'];

  function requiredSections() {
    return REQUIRED_SECTIONS.filter(function (id) {
      if (id === 'rewards' && state.delegated) return false;
      return true;
    });
  }

  function updateProgress() {
    const secs = activeSections();
    let done = 0;
    secs.forEach(function (sec) {
      const complete = isSectionComplete(sec.id);
      if (complete) done++;
      const statusEl = document.querySelector('[data-status-for="' + sec.id + '"]');
      const card = document.querySelector('.fc-sec-card[data-section="' + sec.id + '"]');
      if (statusEl) statusEl.textContent = complete ? '100% 작성완료' : '0% 작성완료';
      if (card) card.classList.toggle('is-done', complete);
    });
    const pct = secs.length ? Math.round((done / secs.length) * 100) : 0;

    const bar = document.getElementById('fcWsProgressBar');
    if (bar) bar.style.width = pct + '%';
    const status = document.getElementById('fcWsStatus');
    if (status) status.textContent = pct >= 100 ? ('준비 완료 · ' + pct + '% 완료') : ('기획중 · ' + pct + '% 완료');

    // 검토 버튼 활성화 — 필수 섹션이 모두 완료돼야
    const allReq = requiredSections().every(isSectionComplete);
    const reviewBtn = document.getElementById('fcReview');
    if (reviewBtn) reviewBtn.disabled = !allReq;
    const hint = document.getElementById('fcWsFootHint');
    if (hint) {
      if (allReq) hint.textContent = '필수 항목을 모두 채웠어요. 검토 후 개설할 수 있어요.';
      else {
        const left = requiredSections().filter(function (id) { return !isSectionComplete(id); })
          .map(function (id) { const s = SECTIONS.find(function (x) { return x.id === id; }); return s ? s.label : id; });
        hint.textContent = '남은 필수 항목: ' + left.join(' · ');
      }
    }
  }

  // ====================================================================
  // 섹션 폼 패널(슬라이드오버)
  // ====================================================================
  function bindPanel() {
    const close = document.getElementById('fcPanelClose');
    const overlay = document.getElementById('fcPanelOverlay');
    const save = document.getElementById('fcPanelSave');
    if (close) close.addEventListener('click', closePanel);
    if (overlay) overlay.addEventListener('click', closePanel);
    if (save) save.addEventListener('click', function () { commitPanel(); closePanel(); });

    // 입력 변경 시 실시간 반영(저장 안 눌러도 진행률 동기화)
    document.getElementById('fundTitle').addEventListener('input', function () { updateProgress(); renderWorkspaceHead(); });
    document.getElementById('fundTargetQuantity').addEventListener('input', updateProgress);
    document.getElementById('fundDeadline').addEventListener('change', updateProgress);

    // 창작자 정보 입력 바인딩
    bindCreatorInputs();
    bindTrustInputs();
  }

  function openPanel(id) {
    const sec = SECTIONS.find(function (s) { return s.id === id; });
    if (!sec) return;
    document.getElementById('fcPanelTitle').textContent = sec.label;
    document.querySelectorAll('#fundForm .fc-form-group').forEach(function (g) {
      g.hidden = g.dataset.group !== id;
    });
    if (id === 'rewards') syncDelegateUi();
    document.getElementById('fcPanelOverlay').hidden = false;
    const panel = document.getElementById('fcPanel');
    panel.hidden = false;
    panel.classList.add('is-open');
    document.body.classList.add('fc-no-scroll');
  }

  function closePanel() {
    const panel = document.getElementById('fcPanel');
    panel.classList.remove('is-open');
    panel.hidden = true;
    document.getElementById('fcPanelOverlay').hidden = true;
    document.body.classList.remove('fc-no-scroll');
  }

  // 패널 닫기 직전 상태 동기화(창작자/신뢰 등 즉시반영형은 이미 동기화됨)
  function commitPanel() {
    updateProgress();
    renderWorkspaceHead();
  }

  function bindCreatorInputs() {
    const name = document.getElementById('creatorName');
    const intro = document.getElementById('creatorIntro');
    const contact = document.getElementById('creatorContact');
    if (name) name.addEventListener('input', function () { state.creator.name = name.value; updateProgress(); });
    if (intro) intro.addEventListener('input', function () { state.creator.intro = intro.value; updateProgress(); });
    if (contact) contact.addEventListener('input', function () { state.creator.contact = contact.value; updateProgress(); });
  }

  function bindTrustInputs() {
    document.querySelectorAll('.fc-trust-chk').forEach(function (chk) {
      chk.addEventListener('change', function () {
        state.trust[chk.dataset.trust] = chk.checked;
        updateProgress();
      });
    });
  }

  // ====================================================================
  // 워크스페이스 크롬(검토 CTA) + 대표이미지 업로드
  // ====================================================================
  function bindWorkspaceChrome() {
    const review = document.getElementById('fcReview');
    if (review) review.addEventListener('click', openReview);
    const openAi = document.getElementById('fcOpenAi');
    if (openAi) openAi.addEventListener('click', openAiModal);
  }

  function bindCoverUpload() {
    const input = document.getElementById('fundCoverInput');
    if (!input) return;
    input.addEventListener('change', function (e) {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
        alert('이미지 파일(10MB 이하)만 추가할 수 있습니다.');
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        setCoverImage(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  // 대표이미지 지정 — 직접 업로드 또는 AI 결과. designImages[0] 동기화(제출 페이로드 보존).
  function setCoverImage(dataUrl) {
    state.coverImage = dataUrl;
    if (dataUrl) {
      if (state.designImages.length === 0) state.designImages.push(dataUrl);
      else state.designImages[0] = dataUrl;
    }
    renderCoverPreview();
    renderWorkspaceHead();
    updateProgress();
  }

  function renderCoverPreview() {
    const box = document.getElementById('fundCoverPreview');
    if (!box) return;
    box.innerHTML = '';
    if (!state.coverImage) { box.hidden = true; return; }
    box.hidden = false;
    const img = document.createElement('img');
    img.src = state.coverImage;
    img.alt = '대표 이미지 미리보기';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'fc-cover-preview__del';
    del.textContent = '×';
    del.setAttribute('aria-label', '대표 이미지 삭제');
    del.addEventListener('click', function () {
      state.coverImage = null;
      renderCoverPreview();
      renderWorkspaceHead();
    });
    box.appendChild(img);
    box.appendChild(del);
  }

  // ====================================================================
  // AI 가상피팅 — 별도 모달 (메인 흐름과 분리)
  // ====================================================================
  function bindAiModal() {
    const close = document.getElementById('fcAiClose');
    const overlay = document.getElementById('fcAiOverlay');
    const useCover = document.getElementById('fcUseAsCover');
    if (close) close.addEventListener('click', closeAiModal);
    if (overlay) overlay.addEventListener('click', closeAiModal);
    if (useCover) useCover.addEventListener('click', function () {
      if (state.tryOnImage) { setCoverImage(state.tryOnImage); closeAiModal(); }
    });
  }

  function openAiModal() {
    // 타입별 모델/배경 옵션·라벨 조정
    const type = (typeof window.dtCategoryType === 'function') ? window.dtCategoryType(state.category) : 'none';
    const modelField = document.getElementById('modelTypeField');
    const btn = document.getElementById('btnAiTryOn');
    const help = document.getElementById('aiHelpText');
    const desc = document.getElementById('fcAiModalDesc');
    if (type === 'apparel') {
      if (modelField) modelField.style.display = '';
      btn.textContent = 'AI 가상피팅 생성';
      if (help) help.textContent = '업로드한 디자인을 선택한 모델·배경에 입혀 착용 모습을 생성합니다.';
      if (desc) desc.textContent = '의류 디자인을 올리면 AI가 모델 착용 미리보기를 만들어줘요. 결과는 대표이미지로 쓸 수 있어요.';
    } else {
      if (modelField) modelField.style.display = 'none';
      btn.textContent = 'AI 전시 이미지 생성';
      if (help) help.textContent = '업로드한 굿즈를 깔끔한 전시 컷처럼 생성합니다.';
      if (desc) desc.textContent = '굿즈 디자인을 올리면 AI가 전시·진열 컷을 만들어줘요. 결과는 대표이미지로 쓸 수 있어요.';
    }
    document.getElementById('fcAiOverlay').hidden = false;
    const modal = document.getElementById('fcAiModal');
    modal.hidden = false;
    modal.classList.add('is-open');
    document.body.classList.add('fc-no-scroll');
  }

  function closeAiModal() {
    const modal = document.getElementById('fcAiModal');
    modal.classList.remove('is-open');
    modal.hidden = true;
    document.getElementById('fcAiOverlay').hidden = true;
    document.body.classList.remove('fc-no-scroll');
  }

  function bindAiGarmentInput() {
    const fileInput = document.getElementById('tryonGarmentFile');
    if (!fileInput) return;
    fileInput.addEventListener('change', function (e) {
      onGarmentFilesSelected(e.target.files);
      e.target.value = ''; // 같은 파일 재선택 허용
    });
  }

  function onGarmentFilesSelected(fileList) {
    if (!fileList || !fileList.length) return;
    let files = Array.prototype.slice.call(fileList);
    const slotsLeft = MAX_IMAGES - state.designImages.length;
    if (slotsLeft <= 0) {
      alert('최대 ' + MAX_IMAGES + '장까지만 첨부할 수 있습니다.');
      return;
    }
    if (files.length > slotsLeft) {
      alert('남은 ' + slotsLeft + '장만 추가됩니다.');
      files = files.slice(0, slotsLeft);
    }
    let loaded = 0, errors = 0;
    files.forEach(function (file) {
      if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
        errors++; loaded++;
        if (loaded === files.length) afterGarmentLoad(errors);
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        state.designImages.push(reader.result);
        loaded++;
        if (loaded === files.length) afterGarmentLoad(errors);
      };
      reader.onerror = function () { errors++; loaded++; if (loaded === files.length) afterGarmentLoad(errors); };
      reader.readAsDataURL(file);
    });
  }

  function afterGarmentLoad(errors) {
    if (errors > 0) alert(errors + '장은 형식/용량(이미지·10MB 이하) 문제로 제외됐습니다.');
    state.tryOnImage = null;
    const tryonArea = document.getElementById('tryonResultArea');
    if (tryonArea) tryonArea.hidden = true;
    renderGarmentThumbs();
  }

  function removeGarmentImage(idx) {
    state.designImages.splice(idx, 1);
    state.tryOnImage = null;
    const tryonArea = document.getElementById('tryonResultArea');
    if (tryonArea) tryonArea.hidden = true;
    renderGarmentThumbs();
  }
  window.removeGarmentImage = removeGarmentImage;

  function renderGarmentThumbs() {
    const preview = document.getElementById('tryonUploadPreview');
    const thumbs = document.getElementById('tryonThumbs');
    const count = document.getElementById('tryonUploadCount');
    const hasImages = state.designImages.length > 0;
    document.getElementById('btnAiTryOn').disabled = !hasImages;
    if (!hasImages) { preview.hidden = true; thumbs.innerHTML = ''; return; }
    preview.hidden = false;
    count.textContent = '첨부 ' + state.designImages.length + ' / ' + MAX_IMAGES + '장';
    thumbs.innerHTML = '';
    state.designImages.forEach(function (dataUrl, idx) {
      const wrap = document.createElement('div');
      wrap.className = 'fc-aithumb';
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = '디자인 ' + (idx + 1);
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = '삭제';
      del.className = 'fc-aithumb__del';
      del.onclick = function () { removeGarmentImage(idx); };
      wrap.appendChild(img);
      wrap.appendChild(del);
      thumbs.appendChild(wrap);
    });
  }

  // 생성 중 로딩 스피너
  function startAiLoading(btn) {
    if (!document.getElementById('ai-spin-style')) {
      const st = document.createElement('style');
      st.id = 'ai-spin-style';
      st.textContent = '@keyframes aiSpin{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
    const prev = btn.parentNode.querySelector('.ai-loading');
    if (prev) prev.remove();
    const box = document.createElement('div');
    box.className = 'ai-loading';
    box.innerHTML =
      '<div class="ai-loading__spin"></div>' +
      '<span>AI가 미리보기를 만드는 중… 잠시만 기다려 주세요</span>';
    btn.insertAdjacentElement('afterend', box);
    return function () { box.remove(); };
  }

  // AI 가상피팅 — 업로드한 디자인 + 모델타입/배경 → /ai/try-on (보존)
  window.requestAiTryOn = function () {
    if (!state.designImages.length) {
      alert('먼저 이미지를 업로드해 주세요.');
      return;
    }
    const btn = document.getElementById('btnAiTryOn');
    const modelSel = document.getElementById('tryonModelSelect');
    const bgSel = document.getElementById('tryonBgSelect');
    const modelType = (modelSel && modelSel.value) || 'female';
    const background = (bgSel && bgSel.value) || 'studio';
    const category = state.category || 'etc';
    btn.disabled = true;
    const stop = startAiLoading(btn);
    api.post('/ai/try-on', { imageDataUrls: state.designImages, modelType: modelType, background: background, category: category })
      .then(function (res) {
        if (!res || !res.tryOnDataUrl) throw new Error('NO_TRYON');
        state.tryOnImage = res.tryOnDataUrl;
        document.getElementById('tryonResultImg').src = res.tryOnDataUrl;
        document.getElementById('tryonResultArea').hidden = false;
      })
      .catch(function (err) {
        console.error('try-on error', err);
        alert('AI 가상피팅 실패: ' + ((err && err.message) || '알 수 없는 오류'));
      })
      .finally(function () {
        btn.disabled = false;
        stop();
      });
  };

  // ====================================================================
  // 리워드(선물) 구성 — 기존 composer 보존
  // ====================================================================
  function bindRewardComposer() {
    document.getElementById('addRewardTier').addEventListener('click', function () {
      if (state.rewardTiers.length >= MAX_TIERS) { alert('리워드는 최대 ' + MAX_TIERS + '개까지 추가할 수 있어요.'); return; }
      state.rewardTiers.push({ title: '', price: '', description: '', stockLimit: '' });
      renderRewardTiers();
    });
    if (state.rewardTiers.length === 0) {
      state.rewardTiers.push({ title: '', price: '', description: '', stockLimit: '' });
    }
    renderRewardTiers();
  }

  function renderRewardTiers() {
    const box = document.getElementById('rewardTiers');
    box.innerHTML = '';
    state.rewardTiers.forEach(function (tier, idx) {
      const row = document.createElement('div');
      row.className = 'fc-tier-row';

      const grid = document.createElement('div');
      grid.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';

      grid.appendChild(tierInput('선물명', 'text', tier.title, '예) [얼리버드] 네이비 과잠', '2 1 200px', function (v) { tier.title = v; updateProgress(); }));
      grid.appendChild(tierInput('금액(원)', 'number', tier.price, '예) 39000', '1 1 120px', function (v) { tier.price = v; updateProgress(); }));
      grid.appendChild(tierInput('한정수량(선택)', 'number', tier.stockLimit, '비우면 무제한', '1 1 120px', function (v) { tier.stockLimit = v; }));

      const descWrap = tierInput('제공 내용(선택)', 'text', tier.description, '후원자에게 제공할 내용', '1 1 100%', function (v) { tier.description = v; });
      descWrap.style.marginTop = '10px';

      row.appendChild(grid);
      row.appendChild(descWrap);

      if (state.rewardTiers.length > 1) {
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '×';
        del.setAttribute('aria-label', '리워드 삭제');
        del.className = 'fc-tier-del';
        del.onclick = function () { state.rewardTiers.splice(idx, 1); renderRewardTiers(); updateProgress(); };
        row.appendChild(del);
      }
      box.appendChild(row);
    });
  }

  function tierInput(labelText, type, value, placeholder, flex, onInput) {
    const wrap = document.createElement('label');
    wrap.className = 'fc-tier-field';
    wrap.style.flex = flex;
    const span = document.createElement('span');
    span.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    if (type === 'number') { input.min = '0'; input.step = (labelText.indexOf('금액') >= 0) ? '100' : '1'; }
    input.value = value == null ? '' : value;
    input.placeholder = placeholder;
    input.addEventListener('input', function () { onInput(input.value); });
    wrap.appendChild(span); wrap.appendChild(input);
    return wrap;
  }

  // 입력된 리워드를 검증·정제하여 페이로드용 배열 반환(빈 행 제외). 유효 0개면 null.
  function collectRewardTiers() {
    const out = [];
    state.rewardTiers.forEach(function (t) {
      const title = (t.title || '').trim();
      const price = parseInt(t.price, 10);
      if (!title || !Number.isFinite(price) || price < 0) return;
      const tier = { title: title, price: price, description: (t.description || '').trim() };
      const stock = parseInt(t.stockLimit, 10);
      if (Number.isFinite(stock) && stock >= 1) tier.stockLimit = stock;
      out.push(tier);
    });
    return out.length ? out : null;
  }

  // ====================================================================
  // 게시글 본문 작성기 — 기존 composer 보존
  // ====================================================================
  function bindContentComposer() {
    document.getElementById('addTextBlock').addEventListener('click', function () {
      state.contentBlocks.push({ type: 'text', value: '' });
      renderContentBlocks();
      updateProgress();
    });
    document.getElementById('addImageBlock').addEventListener('click', function () {
      document.getElementById('contentImageInput').click();
    });
    document.getElementById('contentImageInput').addEventListener('change', function (e) {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
        alert('이미지 파일(10MB 이하)만 추가할 수 있습니다.');
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        state.contentBlocks.push({ type: 'image', value: reader.result });
        renderContentBlocks();
        updateProgress();
      };
      reader.readAsDataURL(file);
    });
  }

  function renderContentBlocks() {
    const wrap = document.getElementById('contentBlocks');
    wrap.innerHTML = '';
    state.contentBlocks.forEach(function (block, idx) {
      const row = document.createElement('div');
      row.className = 'fc-block-row';
      if (block.type === 'text') {
        const ta = document.createElement('textarea');
        ta.rows = 3;
        ta.value = block.value;
        ta.placeholder = '본문 내용을 입력하세요';
        ta.className = 'fc-block-text';
        ta.addEventListener('input', function () { state.contentBlocks[idx].value = ta.value; updateProgress(); });
        row.appendChild(ta);
      } else {
        const img = document.createElement('img');
        img.src = block.value;
        img.alt = '본문 이미지';
        img.className = 'fc-block-img';
        row.appendChild(img);
      }
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = '삭제';
      del.className = 'fc-block-del';
      del.onclick = function () { state.contentBlocks.splice(idx, 1); renderContentBlocks(); updateProgress(); };
      row.appendChild(del);
      wrap.appendChild(row);
    });
  }

  function setDefaultDeadline() {
    const input = document.getElementById('fundDeadline');
    const recommend = new Date();
    recommend.setDate(recommend.getDate() + RECOMMEND_DEADLINE_DAYS);
    const min = new Date();
    min.setDate(min.getDate() + MIN_DEADLINE_DAYS);
    input.value = formatLocalYmd(recommend);
    input.min = formatLocalYmd(min);
  }

  function formatLocalYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  // ====================================================================
  // 검토 모달 + 제출 (POST /funds 보존)
  // ====================================================================
  function bindReviewModal() {
    const close = document.getElementById('fcReviewClose');
    const overlay = document.getElementById('fcReviewOverlay');
    const back = document.getElementById('fcReviewBack');
    const submit = document.getElementById('btnSubmit');
    if (close) close.addEventListener('click', closeReview);
    if (overlay) overlay.addEventListener('click', closeReview);
    if (back) back.addEventListener('click', closeReview);
    if (submit) submit.addEventListener('click', onSubmit);
  }

  // 폼 값을 모아 검증 후 state.formValues 채움. 실패 시 false.
  function collectFormValues() {
    const tiers = collectRewardTiers();
    if (!state.delegated && !tiers) {
      alert('리워드(선물)를 최소 1개 입력해 주세요. (선물명과 금액 필수)');
      openPanel('rewards');
      return false;
    }
    const title = document.getElementById('fundTitle').value.trim();
    if (!title) { alert('제목을 입력해 주세요.'); openPanel('basic'); return false; }
    const deadline = document.getElementById('fundDeadline').value;
    if (!deadline) { alert('마감일을 선택해 주세요.'); openPanel('goal'); return false; }

    state.formValues = {
      title: title,
      description: document.getElementById('fundDescription').value.trim(),
      department: document.getElementById('fundDepartment').value.trim(),
      targetQuantity: clampInt(document.getElementById('fundTargetQuantity').value, 1, 500),
      deadline: deadline,
      rewardTiers: state.delegated ? [] : tiers,
    };
    return true;
  }

  function openReview() {
    if (!requiredSections().every(isSectionComplete)) return;
    if (!collectFormValues()) return;
    renderReview();
    document.getElementById('fcReviewOverlay').hidden = false;
    const modal = document.getElementById('fcReviewModal');
    modal.hidden = false;
    modal.classList.add('is-open');
    document.body.classList.add('fc-no-scroll');
  }

  function closeReview() {
    const modal = document.getElementById('fcReviewModal');
    modal.classList.remove('is-open');
    modal.hidden = true;
    document.getElementById('fcReviewOverlay').hidden = true;
    document.body.classList.remove('fc-no-scroll');
  }

  function renderReview() {
    const reviewSrc = state.coverImage || state.tryOnImage || state.designImages[0];
    const img = document.getElementById('reviewDesignImg');
    const empty = document.getElementById('reviewCoverEmpty');
    if (reviewSrc) {
      img.src = reviewSrc;
      img.hidden = false;
      if (empty) empty.hidden = true;
    } else {
      img.hidden = true;
      if (empty) empty.hidden = false;
    }

    const summary = document.getElementById('finalSummary');
    summary.innerHTML = '';
    const v = state.formValues || {};
    const tiers = v.rewardTiers || [];
    const catObj = (typeof window.dtCategory === 'function') ? window.dtCategory(state.category) : null;
    const minPrice = tiers.length ? Math.min.apply(null, tiers.map(function (t) { return t.price; })) : 0;
    const rows = [
      ['제목', v.title || '-'],
      ['카테고리', catObj ? catObj.label : '-'],
      ['진행 방식', state.delegated ? '대리 개설 (두띵이 설정)' : '직접 개설'],
      ['소속·단체', v.department || '-'],
      ['목표 수량', (v.targetQuantity || 0) + '개'],
      ['마감일', v.deadline || '-'],
      ['리워드', state.delegated ? '두띵이 설정 (대리 개설)' : (tiers.length + '종 (최저 ' + formatWon(minPrice) + ')')],
    ];
    if (state.creator.name) rows.push(['창작자', state.creator.name]);
    rows.forEach(function (item) {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const a = document.createElement('span');
      a.textContent = item[0];
      const b = document.createElement('span');
      b.textContent = item[1];
      row.appendChild(a);
      row.appendChild(b);
      summary.appendChild(row);
    });
    tiers.forEach(function (t) {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const a = document.createElement('span');
      a.textContent = '· ' + t.title + (t.stockLimit ? ' (한정 ' + t.stockLimit + ')' : '');
      const b = document.createElement('span');
      b.textContent = formatWon(t.price);
      row.appendChild(a); row.appendChild(b);
      summary.appendChild(row);
    });
  }

  async function onSubmit() {
    if (!state.formValues) { closeReview(); return; }

    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.textContent = '등록 중...';

    try {
      const res = await api.post('/funds', {
        title: state.formValues.title,
        description: state.formValues.description,
        department: state.formValues.department,
        category: state.category || 'etc',
        rewardTiers: state.formValues.rewardTiers,
        delegated: state.delegated,
        targetQuantity: state.formValues.targetQuantity,
        deadline: state.formValues.deadline,
        designImageDataUrl: state.coverImage || state.designImages[0] || null,  // 대표/디자인 사진(있으면)
        tryOnImages: state.tryOnImage ? [state.tryOnImage] : [],                // AI 미리보기 사진(있으면)
        contentBlocks: state.contentBlocks                                       // 게시글 본문 (글/사진 블록)
          .filter(function (b) { return b.type === 'image' || (b.value && b.value.trim()); }),
      });
      window.location.href = '/detail.html?id=' + encodeURIComponent(res.id);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '프로젝트 개설하기';
      alert((err && err.message) || '프로젝트 등록에 실패했습니다.');
    }
  }

  // ========== 유틸 ==========
  function formatWon(n) {
    return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString() + '원';
  }
  function clampInt(v, min, max) {
    const n = typeof v === 'number' ? Math.floor(v) : Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(Math.max(n, min), max);
  }
})();
