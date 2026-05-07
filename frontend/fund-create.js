/**
 * 펀드 개설 화면 로직
 *
 * 흐름:
 *  1) 디자인 선택 (기존 디자인 목록 또는 AI 생성)
 *  2) 펀드 정보 입력 (제목·설명·학과·디자인수수료·목표수량·마감일)
 *  3) AI 모델 피팅 미리보기 (선택)
 *  4) 최종 확인 후 POST /api/funds
 *
 * 의존:
 *  - api.js (전역 window.api)
 *  - 백엔드 B-5: GET /api/me/designs, POST /api/funds
 *  - 백엔드 사장님 영역: POST /api/ai/designs/generate, POST /api/ai/try-on
 *
 * 모든 사용자 입력은 textContent / 안전한 setAttribute 로만 출력. innerHTML로 직접 보간 X.
 */

(function () {
  // ========== 상수 ==========
  const PRINT_FEE_DEFAULT = 3000;       // 인쇄/자수 (제품마다 다를 수 있으나 1차 고정)
  const PLATFORM_FEE_DEFAULT = 2000;    // 중개 수수료
  const MIN_DEADLINE_DAYS = 7;          // 마감일 최소 +7일
  const RECOMMEND_DEADLINE_DAYS = 14;

  // ========== 상태 ==========
  const state = {
    currentStep: 1,
    me: null,                           // /api/auth/me 응답
    designs: [],                        // 내 디자인 목록
    selectedDesignId: null,             // 선택된 디자인 id
    selectedDesign: null,               // 객체 (basePrice 등 포함)
    formValues: null,                   // step 2 입력값 캐시
    tryOnImages: [],                    // 피팅 결과 url[]
  };

  // ========== 초기화 ==========
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindNavigation();
    bindForm();
    bindAiModal();
    bindTryOn();
    setDefaultDeadline();

    try {
      state.me = await api.get('/auth/me');
      const dept = state.me && state.me.department;
      if (dept) document.getElementById('fundDepartment').value = dept;
    } catch (err) {
      // 401이면 api.js 가 자동으로 /login.html 리다이렉트. 그 외는 무시 (학과 수동 입력 가능)
      console.warn('me 조회 실패:', err);
    }

    await loadDesigns();

    // design-select.html → "AI 디자인" 진입점이 ?openAi=1 로 넘겨주면 즉시 모달 오픈
    const params = new URLSearchParams(window.location.search);
    if (params.get('openAi') === '1') {
      const cat = params.get('category');
      if (cat) {
        const sel = document.getElementById('aiProductCategory');
        const map = { '과잠': 'varsity', '후드티': 'hoodie', '에코백': 'ecobag', '키링': 'keyring', '스티커': 'sticker' };
        const v = map[cat];
        if (v) sel.value = v;
      }
      document.getElementById('aiDesignModal').hidden = false;
    }
  }

  // ========== Step 네비게이션 ==========
  function bindNavigation() {
    document.getElementById('step1Next').addEventListener('click', () => goToStep(2));
    document.getElementById('step2Next').addEventListener('click', onStep2Next);
    document.getElementById('step3Next').addEventListener('click', () => goToStep(4));
    document.querySelectorAll('.btn-prev').forEach((btn) => {
      btn.addEventListener('click', () => goToStep(Number(btn.dataset.go)));
    });
  }

  function goToStep(step) {
    state.currentStep = step;
    document.querySelectorAll('[data-step-panel]').forEach((p) => {
      p.hidden = Number(p.dataset.stepPanel) !== step;
    });
    document.querySelectorAll('.step').forEach((s) => {
      const num = Number(s.dataset.step);
      s.classList.toggle('active', num === step);
      s.classList.toggle('done', num < step);
    });
    if (step === 3) renderTryOnSection();
    if (step === 4) renderFinalSummary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ========== 디자인 목록 ==========
  async function loadDesigns() {
    const list = document.getElementById('designList');
    const empty = document.getElementById('designEmpty');

    try {
      const res = await api.get('/me/designs');
      state.designs = Array.isArray(res) ? res : (res.items || []);
    } catch (err) {
      console.warn('디자인 목록 조회 실패:', err);
      state.designs = [];
    }

    // 기존 카드 모두 제거 (empty placeholder는 보존하지 않고 새로 그림)
    list.replaceChildren();

    if (state.designs.length === 0) {
      list.appendChild(empty);
      return;
    }

    state.designs.forEach((design) => list.appendChild(buildDesignCard(design)));
  }

  function buildDesignCard(design) {
    const card = document.createElement('div');
    card.className = 'design-card';
    card.dataset.id = design.id;

    const img = document.createElement('img');
    img.alt = '';
    img.src = design.previewImage || '';
    card.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'design-card-meta';
    const left = document.createElement('span');
    left.textContent = design.aiGenerated ? 'AI 생성' : '직접 디자인';
    const right = document.createElement('span');
    right.textContent = formatDate(design.createdAt);
    meta.append(left, right);
    card.appendChild(meta);

    card.addEventListener('click', () => selectDesign(design.id));
    return card;
  }

  function selectDesign(id) {
    state.selectedDesignId = id;
    state.selectedDesign = state.designs.find((d) => d.id === id) || null;
    document.querySelectorAll('.design-card').forEach((c) => {
      c.classList.toggle('selected', c.dataset.id === id);
    });
    document.getElementById('step1Next').disabled = !id;
    updatePricePreview();
  }

  // ========== 폼 바인딩 ==========
  function bindForm() {
    const fee = document.getElementById('fundDesignFee');
    fee.addEventListener('input', updatePricePreview);

    const form = document.getElementById('fundCreateForm');
    form.addEventListener('submit', onSubmit);
  }

  function updatePricePreview() {
    const designFee = clampInt(document.getElementById('fundDesignFee').value, 0, 50000);
    const basePrice = (state.selectedDesign && state.selectedDesign.basePrice) || 0;

    document.getElementById('previewBasePrice').textContent = basePrice ? formatWon(basePrice) : '디자인 선택 시 표시';
    document.getElementById('previewDesignFee').textContent = formatWon(designFee);
    document.getElementById('previewPrintFee').textContent = formatWon(PRINT_FEE_DEFAULT);
    document.getElementById('previewPlatformFee').textContent = formatWon(PLATFORM_FEE_DEFAULT);

    const finalPrice = basePrice + PRINT_FEE_DEFAULT + designFee + PLATFORM_FEE_DEFAULT;
    document.getElementById('previewFinalPrice').textContent = basePrice ? formatWon(finalPrice) : '-';
  }

  function setDefaultDeadline() {
    const d = new Date();
    d.setDate(d.getDate() + RECOMMEND_DEADLINE_DAYS);
    const iso = d.toISOString().slice(0, 10);
    const input = document.getElementById('fundDeadline');
    input.value = iso;
    const min = new Date();
    min.setDate(min.getDate() + MIN_DEADLINE_DAYS);
    input.min = min.toISOString().slice(0, 10);
  }

  function onStep2Next() {
    const form = document.getElementById('fundCreateForm');
    if (!form.reportValidity()) return;

    state.formValues = {
      title: document.getElementById('fundTitle').value.trim(),
      description: document.getElementById('fundDescription').value.trim(),
      department: document.getElementById('fundDepartment').value.trim(),
      designFee: clampInt(document.getElementById('fundDesignFee').value, 0, 50000),
      targetQuantity: clampInt(document.getElementById('fundTargetQuantity').value, 1, 500),
      deadline: document.getElementById('fundDeadline').value,
    };
    if (!state.formValues.title || !state.formValues.department) {
      alert('필수 항목을 입력해 주세요.');
      return;
    }
    goToStep(3);
  }

  // ========== Step 3: 모델 피팅 미리보기 ==========
  function renderTryOnSection() {
    const img = document.getElementById('previewDesignImg');
    if (state.selectedDesign && state.selectedDesign.previewImage) {
      img.src = state.selectedDesign.previewImage;
    } else {
      img.removeAttribute('src');
    }
  }

  function bindTryOn() {
    document.getElementById('btnTryOn').addEventListener('click', requestTryOn);
  }

  async function requestTryOn() {
    if (!state.selectedDesignId) return;
    const btn = document.getElementById('btnTryOn');
    const area = document.getElementById('tryonResultArea');
    btn.disabled = true;
    btn.textContent = '생성 중... (10~30초 소요)';

    try {
      const res = await api.post('/ai/try-on', {
        designId: state.selectedDesignId,
        modelType: 'female',
        background: 'campus',
      });
      state.tryOnImages = (res && res.images) || [];
      renderTryOnResult(area, state.tryOnImages);
    } catch (err) {
      area.replaceChildren();
      const msg = document.createElement('p');
      msg.style.color = '#ef4444';
      msg.style.fontSize = '13px';
      msg.textContent =
        err && err.status === 503
          ? 'AI 서버가 연결되어 있지 않습니다. 펀드 등록은 그대로 진행 가능합니다.'
          : '미리보기 생성에 실패했습니다.';
      area.appendChild(msg);
      btn.disabled = false;
      btn.textContent = '🧥 다시 시도';
    }
  }

  function renderTryOnResult(area, images) {
    area.replaceChildren();
    if (!images || images.length === 0) {
      area.textContent = '결과가 없습니다.';
      return;
    }
    images.forEach((url) => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '모델 피팅 미리보기';
      img.style.cssText =
        'width:100%;height:100%;object-fit:cover;border-radius:12px;border:1px solid #e5e7eb;';
      area.appendChild(img);
    });
  }

  // ========== Step 4: 최종 확인 ==========
  function renderFinalSummary() {
    const container = document.getElementById('finalSummary');
    container.replaceChildren();
    const v = state.formValues || {};
    const basePrice = (state.selectedDesign && state.selectedDesign.basePrice) || 0;
    const finalPrice = basePrice + PRINT_FEE_DEFAULT + (v.designFee || 0) + PLATFORM_FEE_DEFAULT;

    const rows = [
      ['디자인', state.selectedDesign ? (state.selectedDesign.aiGenerated ? 'AI 생성' : '직접 디자인') : '-'],
      ['제목', v.title || '-'],
      ['학과', v.department || '-'],
      ['목표 수량', (v.targetQuantity || 0) + '벌'],
      ['마감일', v.deadline || '-'],
      ['디자인 수수료', formatWon(v.designFee || 0)],
      ['최종 구매가', basePrice ? formatWon(finalPrice) : '-'],
      ['모델 피팅 이미지', state.tryOnImages.length + '장'],
    ];
    rows.forEach(([k, val]) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const a = document.createElement('span');
      a.textContent = k;
      const b = document.createElement('span');
      b.textContent = val;
      row.append(a, b);
      container.appendChild(row);
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!state.selectedDesignId) {
      alert('디자인을 먼저 선택해 주세요.');
      goToStep(1);
      return;
    }
    const v = state.formValues;
    if (!v) { goToStep(2); return; }

    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.textContent = '등록 중...';

    try {
      const res = await api.post('/funds', {
        designId: state.selectedDesignId,
        title: v.title,
        description: v.description,
        department: v.department,
        designFee: v.designFee,
        targetQuantity: v.targetQuantity,
        deadline: v.deadline,
        tryOnImages: state.tryOnImages,
      });
      // 성공 → 상세 페이지로 이동
      window.location.href = '/detail.html?id=' + encodeURIComponent(res.id);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '펀드 개설하기';
      alert((err && err.message) || '펀드 등록에 실패했습니다.');
    }
  }

  // ========== AI 디자인 생성 모달 ==========
  function bindAiModal() {
    const open = document.getElementById('btnAiDesign');
    const close = document.getElementById('aiDesignClose');
    const modal = document.getElementById('aiDesignModal');
    const generate = document.getElementById('btnGenerate');

    open.addEventListener('click', () => { modal.hidden = false; });
    close.addEventListener('click', () => { modal.hidden = true; });
    modal.querySelector('.ai-modal-backdrop').addEventListener('click', () => { modal.hidden = true; });
    generate.addEventListener('click', requestAiDesigns);
  }

  async function requestAiDesigns() {
    const promptEl = document.getElementById('aiPrompt');
    const categoryEl = document.getElementById('aiProductCategory');
    const status = document.getElementById('aiStatusMessage');
    const gallery = document.getElementById('aiResultGallery');
    const btn = document.getElementById('btnGenerate');

    const prompt = promptEl.value.trim();
    if (!prompt) {
      status.textContent = '디자인 컨셉을 입력해 주세요.';
      status.className = 'ai-status error';
      return;
    }

    btn.disabled = true;
    status.textContent = '시안 생성 중... (15~40초 소요)';
    status.className = 'ai-status';
    gallery.replaceChildren();

    try {
      const res = await api.post('/ai/designs/generate', {
        prompt: prompt,
        productCategory: categoryEl.value,
        count: 3,
      });
      const designs = (res && res.designs) || [];
      designs.forEach((d) => gallery.appendChild(buildAiPreview(d)));
      status.textContent = '마음에 드는 시안을 클릭해서 선택하세요.';
      status.className = 'ai-status success';
    } catch (err) {
      status.textContent =
        err && err.status === 503
          ? 'AI 서버가 연결되어 있지 않습니다. 직접 디자인 만들기를 이용해 주세요.'
          : '시안 생성에 실패했습니다.';
      status.className = 'ai-status error';
    } finally {
      btn.disabled = false;
    }
  }

  function buildAiPreview(design) {
    const img = document.createElement('img');
    img.src = design.previewImage;
    img.alt = '';
    img.dataset.id = design.id;
    img.addEventListener('click', () => onSelectAiDesign(design));
    return img;
  }

  function onSelectAiDesign(design) {
    // 갤러리에 새 디자인 추가하고 자동 선택 + 모달 닫기
    state.designs.unshift(design);
    selectDesign(design.id);
    document.getElementById('aiDesignModal').hidden = true;
    loadDesigns().then(() => selectDesign(design.id));   // 서버 측 목록과 동기화
  }

  // ========== 유틸 ==========
  function formatWon(n) {
    return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString() + '원';
  }
  function clampInt(v, min, max) {
    const n = Math.floor(Number(v) || 0);
    return Math.min(Math.max(n, min), max);
  }
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }
})();
