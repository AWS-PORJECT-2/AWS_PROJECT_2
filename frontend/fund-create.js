/**
 * 펀드 개설 화면 — 5단계 마법사
 *
 * 흐름:
 *  1. 옷 가져오기 (사진 업로드 또는 상품 URL)
 *  2. 설계도 편집 (Fabric.js 캔버스: 텍스트·도형·스티커·이미지 합성)
 *  3. AI 모델 피팅 (편집된 설계도 → CatVTON 등)
 *  4. 펀드 정보 입력 (제목·설명·학과·가격·마감일)
 *  5. 검토 + 등록 (POST /api/funds)
 *
 * 기술:
 *  - Fabric.js v6 (CDN으로 로드)
 *  - 모든 사용자 입력은 textContent / Fabric 객체 속성으로만 처리
 *  - api.js 의 전역 window.api 사용 (credentials, 401 자동 redirect)
 */

(function () {
  // ========== 상수 ==========
  const PRINT_FEE = 3000;
  const PLATFORM_FEE = 2000;
  const BASE_PRICE_DEFAULT = 20000;
  const MIN_DEADLINE_DAYS = 7;
  const RECOMMEND_DEADLINE_DAYS = 14;
  const CANVAS_SIZE = 540;

  // 스티커 — 단순한 SVG 도형 카탈로그. 옷 위에 어울리는 미니멀 그래픽.
  // 각 항목: { name, svg(button 안에 들어갈 SVG), shape(캔버스에 추가될 fabric 도형 정의 함수) }
  const STICKERS = [
    {
      name: 'star',
      svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.9 7.4.6-5.7 4.9 1.8 7.3L12 17.8l-6.4 3.9 1.8-7.3-5.7-4.9 7.4-.6z"/></svg>',
      shape: 'star',
    },
    {
      name: 'heart',
      svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
      shape: 'heart',
    },
    {
      name: 'circle',
      svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>',
      shape: 'circle-solid',
    },
    {
      name: 'triangle',
      svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l10 18H2z"/></svg>',
      shape: 'triangle',
    },
    {
      name: 'bolt',
      svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
      shape: 'bolt',
    },
    {
      name: 'diamond',
      svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l10 10-10 10L2 12z"/></svg>',
      shape: 'diamond',
    },
    {
      name: 'plus',
      svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/></svg>',
      shape: 'plus',
    },
    {
      name: 'ring',
      svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="8"/></svg>',
      shape: 'ring',
    },
    {
      name: 'square',
      svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
      shape: 'square',
    },
  ];

  // ========== 상태 ==========
  const state = {
    currentStep: 1,
    me: null,

    sourceImage: null,
    designImage: null,

    canvas: null,
    activeColor: '#1a1a1a',
    history: [],
    historyIndex: -1,
    suspendHistory: false,

    formValues: null,
    tryOnImages: [],
  };

  // ========== 초기화 ==========
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindStep1();
    bindStep2();
    bindStep3();
    bindStep4();
    bindStep5();
    bindNavigation();
    setDefaultDeadline();

    try {
      state.me = await api.get('/auth/me');
      const dept = state.me && state.me.department;
      if (dept) document.getElementById('fundDepartment').value = dept;
    } catch (err) {
      // 미로그인이면 api.js 가 /login.html로 보냄
    }
  }

  // ========== Step 네비게이션 ==========
  function bindNavigation() {
    document.getElementById('step1Next').addEventListener('click', () => goToStep(2));
    document.getElementById('step2Next').addEventListener('click', onStep2Next);
    document.getElementById('step3Next').addEventListener('click', () => goToStep(4));
    document.getElementById('step4Next').addEventListener('click', onStep4Next);
    document.querySelectorAll('.btn-prev').forEach((btn) => {
      btn.addEventListener('click', () => goToStep(Number(btn.dataset.go)));
    });
    document.getElementById('btnSubmit').addEventListener('click', onSubmit);
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

    if (step === 2) initCanvasIfNeeded();
    if (step === 3) renderTryOnSection();
    if (step === 5) renderReview();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ========== Step 1: 옷 가져오기 ==========
  function bindStep1() {
    document.querySelectorAll('.source-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.source-tab').forEach((t) => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.source-pane').forEach((p) => {
          p.hidden = p.dataset.pane !== tab.dataset.tab;
        });
      });
    });

    const fileInput = document.getElementById('garmentFile');
    const zone = document.getElementById('uploadZone');
    fileInput.addEventListener('change', (e) => onGarmentFile(e.target.files[0]));

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) onGarmentFile(f);
    });

    document.getElementById('btnFetchUrl').addEventListener('click', onFetchUrl);

    document.getElementById('btnExtract').addEventListener('click', onExtractDesign);
    document.getElementById('btnSkipExtract').addEventListener('click', () => {
      state.designImage = state.sourceImage;
      setStatus('step1Status', '원본 사진을 설계도로 사용합니다.', 'success');
      document.getElementById('step1Next').disabled = false;
    });
  }

  function onGarmentFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('step1Status', '이미지 파일만 업로드 가능합니다.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus('step1Status', '10MB 이하 파일만 업로드 가능합니다.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.sourceImage = reader.result;
      state.designImage = null;
      showGarmentPreview(reader.result);
      setStatus('step1Status', '사진을 가져왔습니다. 설계도 변환 또는 원본 사용을 선택하세요.', 'success');
    };
    reader.readAsDataURL(file);
  }

  async function onFetchUrl() {
    const url = document.getElementById('garmentUrl').value.trim();
    if (!url) {
      setStatus('step1Status', 'URL을 입력해 주세요.', 'error');
      return;
    }
    setStatus('step1Status', 'URL에서 사진을 가져오는 중...', '');
    try {
      const res = await api.post('/garments/fetch-from-url', { url: url });
      if (res && res.imageDataUrl) {
        state.sourceImage = res.imageDataUrl;
        state.designImage = null;
        showGarmentPreview(res.imageDataUrl);
        setStatus('step1Status', '사진을 가져왔습니다.', 'success');
      } else {
        throw new Error('imageDataUrl 누락');
      }
    } catch (err) {
      setStatus('step1Status',
        err && err.status === 503
          ? 'URL 가져오기 기능은 아직 준비 중입니다. 사진 업로드를 이용해 주세요.'
          : '사진을 가져오지 못했습니다.',
        'error');
    }
  }

  function showGarmentPreview(dataUrl) {
    document.getElementById('garmentImage').src = dataUrl;
    document.getElementById('garmentPreview').hidden = false;
  }

  async function onExtractDesign() {
    if (!state.sourceImage) return;
    const btn = document.getElementById('btnExtract');
    btn.disabled = true;
    btn.textContent = '추출 중... (10~30초)';
    setStatus('step1Status', 'AI가 배경을 제거하고 평면 도면으로 다듬고 있어요.', '');
    try {
      const res = await api.post('/ai/garments/extract', { imageDataUrl: state.sourceImage });
      const out = (res && res.previewImage) || (res && res.imageDataUrl);
      if (!out) throw new Error('previewImage 누락');
      state.designImage = out;
      document.getElementById('garmentImage').src = out;
      setStatus('step1Status', '설계도 변환 완료. 다음으로 진행하세요.', 'success');
      document.getElementById('step1Next').disabled = false;
    } catch (err) {
      setStatus('step1Status',
        err && err.status === 503
          ? 'AI 서버가 연결되어 있지 않습니다. "원본 그대로 사용" 으로 진행하세요.'
          : '설계도 추출에 실패했습니다.',
        'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '설계도 자동 추출 (AI)';
    }
  }

  // ========== Step 2: Fabric.js 에디터 ==========
  function bindStep2() {
    document.getElementById('toolText').addEventListener('click', addText);
    document.getElementById('toolRect').addEventListener('click', addRect);
    document.getElementById('toolCircle').addEventListener('click', addCircle);
    document.getElementById('toolImageInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) addImageFromFile(file);
      e.target.value = '';
    });
    document.getElementById('toolUndo').addEventListener('click', undo);
    document.getElementById('toolRedo').addEventListener('click', redo);
    document.getElementById('toolDelete').addEventListener('click', deleteSelected);

    document.querySelectorAll('.color-swatch').forEach((sw) => {
      sw.addEventListener('click', () => setActiveColor(sw.dataset.color, sw));
    });
    document.getElementById('colorPicker').addEventListener('input', (e) => setActiveColor(e.target.value));

    const grid = document.getElementById('stickerGrid');
    STICKERS.forEach((sticker) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sticker-btn';
      b.title = sticker.name;
      b.appendChild(parseSvg(sticker.svg));
      b.addEventListener('click', () => addSticker(sticker));
      grid.appendChild(b);
    });

    document.addEventListener('keydown', (e) => {
      if (state.currentStep !== 2) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
        e.preventDefault();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        undo(); e.preventDefault();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        redo(); e.preventDefault();
      }
    });
  }

  function initCanvasIfNeeded() {
    if (state.canvas) return;
    if (!window.fabric) {
      console.error('Fabric.js 로드 실패');
      return;
    }
    const canvas = new fabric.Canvas('garmentCanvas', {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    });
    state.canvas = canvas;

    const url = state.designImage || state.sourceImage;
    if (url) {
      fabric.Image.fromURL(url, { crossOrigin: 'anonymous' }).then((img) => {
        const scale = Math.min(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height);
        img.scale(scale);
        img.set({
          left: (CANVAS_SIZE - img.width * scale) / 2,
          top: (CANVAS_SIZE - img.height * scale) / 2,
          selectable: false,
          evented: false,
        });
        canvas.add(img);
        canvas.sendObjectToBack(img);
        canvas.renderAll();
        pushHistory();
      }).catch(() => { pushHistory(); });
    } else {
      pushHistory();
    }

    ['object:added', 'object:modified', 'object:removed'].forEach((ev) => {
      canvas.on(ev, () => {
        if (!state.suspendHistory) pushHistory();
      });
    });
  }

  function setActiveColor(color, btn) {
    state.activeColor = color;
    document.querySelectorAll('.color-swatch').forEach((s) => s.classList.toggle('active', s === btn));
    if (state.canvas) {
      const obj = state.canvas.getActiveObject();
      if (obj) {
        obj.set('fill', color);
        state.canvas.requestRenderAll();
      }
    }
  }

  function addText() {
    if (!state.canvas) return;
    const t = new fabric.IText('텍스트', {
      left: CANVAS_SIZE / 2 - 50,
      top: CANVAS_SIZE / 2 - 20,
      fontSize: 36,
      fill: state.activeColor,
      fontFamily: 'sans-serif',
      fontWeight: 700,
    });
    state.canvas.add(t);
    state.canvas.setActiveObject(t);
  }

  function addRect() {
    const r = new fabric.Rect({
      left: CANVAS_SIZE / 2 - 60,
      top: CANVAS_SIZE / 2 - 60,
      width: 120, height: 120,
      fill: state.activeColor,
      opacity: 0.85,
    });
    state.canvas.add(r);
    state.canvas.setActiveObject(r);
  }

  function addCircle() {
    const c = new fabric.Circle({
      left: CANVAS_SIZE / 2 - 60,
      top: CANVAS_SIZE / 2 - 60,
      radius: 60,
      fill: state.activeColor,
      opacity: 0.85,
    });
    state.canvas.add(c);
    state.canvas.setActiveObject(c);
  }

  function addSticker(sticker) {
    if (!state.canvas) return;
    // SVG 마크업에서 path d 추출 → fabric.Path 로 변환
    const doc = new DOMParser().parseFromString(sticker.svg, 'image/svg+xml');
    const root = doc.documentElement;
    const target = root.querySelector('path, circle, rect');
    if (!target) return;

    let pathData;
    if (target.tagName === 'path') {
      pathData = target.getAttribute('d');
    } else if (target.tagName === 'circle') {
      const cx = +target.getAttribute('cx'), cy = +target.getAttribute('cy'), r = +target.getAttribute('r');
      pathData = `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`;
    } else if (target.tagName === 'rect') {
      const x = +target.getAttribute('x'), y = +target.getAttribute('y'),
            w = +target.getAttribute('width'), h = +target.getAttribute('height');
      pathData = `M ${x} ${y} h ${w} v ${h} h ${-w} z`;
    }
    if (!pathData) return;

    const path = new fabric.Path(pathData, {
      fill: state.activeColor,
      stroke: target.getAttribute('stroke') || null,
      strokeWidth: parseFloat(target.getAttribute('stroke-width')) || 0,
      left: CANVAS_SIZE / 2 - 30,
      top: CANVAS_SIZE / 2 - 30,
    });
    // 24x24 viewBox 를 60x60 정도로 스케일
    path.scale(2.5);
    state.canvas.add(path);
    state.canvas.setActiveObject(path);
  }

  function parseSvg(svgString) {
    const wrap = document.createElement('span');
    wrap.innerHTML = svgString;
    return wrap.firstElementChild;
  }

  function addImageFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      fabric.Image.fromURL(reader.result, { crossOrigin: 'anonymous' }).then((img) => {
        const max = CANVAS_SIZE * 0.5;
        const scale = Math.min(max / img.width, max / img.height, 1);
        img.scale(scale);
        img.set({ left: CANVAS_SIZE / 2 - (img.width * scale) / 2, top: CANVAS_SIZE / 2 - (img.height * scale) / 2 });
        state.canvas.add(img);
        state.canvas.setActiveObject(img);
      });
    };
    reader.readAsDataURL(file);
  }

  function deleteSelected() {
    if (!state.canvas) return;
    const objs = state.canvas.getActiveObjects();
    objs.forEach((o) => {
      if (!o.evented && !o.selectable) return;
      state.canvas.remove(o);
    });
    state.canvas.discardActiveObject();
    state.canvas.requestRenderAll();
  }

  function pushHistory() {
    if (!state.canvas) return;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(JSON.stringify(state.canvas.toJSON()));
    state.historyIndex = state.history.length - 1;
    if (state.history.length > 30) {
      state.history.shift();
      state.historyIndex--;
    }
  }

  function undo() {
    if (state.historyIndex <= 0) return;
    state.historyIndex--;
    restoreFromHistory();
  }
  function redo() {
    if (state.historyIndex >= state.history.length - 1) return;
    state.historyIndex++;
    restoreFromHistory();
  }
  function restoreFromHistory() {
    const json = state.history[state.historyIndex];
    if (!json) return;
    state.suspendHistory = true;
    // Fabric.js v6는 loadFromJSON 이 Promise 기반. callback 인자는 미지원.
    state.canvas.loadFromJSON(json).then(() => {
      state.canvas.renderAll();
      state.suspendHistory = false;
    }).catch(() => {
      state.suspendHistory = false;
    });
  }

  function onStep2Next() {
    if (!state.canvas) { goToStep(3); return; }
    state.canvas.discardActiveObject();
    state.canvas.renderAll();
    state.designImage = state.canvas.toDataURL({ format: 'png', multiplier: 2 });
    goToStep(3);
  }

  // ========== Step 3: 모델 피팅 ==========
  function bindStep3() {
    document.getElementById('btnTryOn').addEventListener('click', requestTryOn);
  }

  function renderTryOnSection() {
    const img = document.getElementById('previewDesignImg');
    if (state.designImage) img.src = state.designImage;
    else img.removeAttribute('src');
  }

  async function requestTryOn() {
    if (!state.designImage) return;
    const btn = document.getElementById('btnTryOn');
    const area = document.getElementById('tryonResultArea');
    btn.disabled = true;
    btn.textContent = '생성 중... (10~30초)';
    try {
      const res = await api.post('/ai/try-on', {
        designImageDataUrl: state.designImage,
        modelType: document.getElementById('tryonModelType').value,
        background: document.getElementById('tryonBackground').value,
      });
      state.tryOnImages = (res && res.images) || [];
      renderTryOnResult(area, state.tryOnImages);
    } catch (err) {
      area.replaceChildren();
      const msg = document.createElement('p');
      msg.style.cssText = 'color:#ef4444;font-size:13px;';
      msg.textContent = err && err.status === 503
        ? 'AI 서버가 연결되어 있지 않습니다. 펀드 등록은 그대로 진행 가능합니다.'
        : '미리보기 생성에 실패했습니다.';
      area.appendChild(msg);
    } finally {
      // 성공·실패 어느 쪽이든 버튼이 비활성 + "생성 중..." 으로 남는 일이 없게 한다.
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
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:12px;border:1px solid #e5e7eb;';
      area.appendChild(img);
    });
  }

  // ========== Step 4: 펀드 정보 ==========
  function bindStep4() {
    document.getElementById('fundDesignFee').addEventListener('input', updatePricePreview);
  }

  function updatePricePreview() {
    const designFee = clampInt(document.getElementById('fundDesignFee').value, 0, 50000);
    document.getElementById('previewBasePrice').textContent = formatWon(BASE_PRICE_DEFAULT);
    document.getElementById('previewDesignFee').textContent = formatWon(designFee);
    document.getElementById('previewPrintFee').textContent = formatWon(PRINT_FEE);
    document.getElementById('previewPlatformFee').textContent = formatWon(PLATFORM_FEE);
    const finalPrice = BASE_PRICE_DEFAULT + PRINT_FEE + designFee + PLATFORM_FEE;
    document.getElementById('previewFinalPrice').textContent = formatWon(finalPrice);
  }

  function setDefaultDeadline() {
    const input = document.getElementById('fundDeadline');
    const recommend = new Date();
    recommend.setDate(recommend.getDate() + RECOMMEND_DEADLINE_DAYS);
    const min = new Date();
    min.setDate(min.getDate() + MIN_DEADLINE_DAYS);
    // toISOString() 은 UTC 기준 날짜라 한국(KST) 자정 직전엔 하루 빠진 날짜가 들어간다.
    // <input type="date"> 는 사용자 로컬 타임존 해석이므로 로컬 컴포넌트로 직접 포맷.
    input.value = formatLocalYmd(recommend);
    input.min = formatLocalYmd(min);
  }

  function formatLocalYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function onStep4Next() {
    const form = document.getElementById('fundForm');
    if (!form.reportValidity()) return;
    state.formValues = {
      title: document.getElementById('fundTitle').value.trim(),
      description: document.getElementById('fundDescription').value.trim(),
      department: document.getElementById('fundDepartment').value.trim(),
      designFee: clampInt(document.getElementById('fundDesignFee').value, 0, 50000),
      targetQuantity: clampInt(document.getElementById('fundTargetQuantity').value, 1, 500),
      deadline: document.getElementById('fundDeadline').value,
    };
    if (!state.formValues.title || !state.formValues.department) return;
    goToStep(5);
  }

  // ========== Step 5: 검토 + 등록 ==========
  function bindStep5() { /* nav 로 처리 */ }

  function renderReview() {
    if (state.designImage) document.getElementById('reviewDesignImg').src = state.designImage;
    const tryArea = document.getElementById('reviewTryonArea');
    tryArea.replaceChildren();
    if (state.tryOnImages.length > 0) {
      state.tryOnImages.forEach((url) => {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        tryArea.appendChild(img);
      });
    } else {
      const p = document.createElement('p');
      p.style.cssText = 'color:#9ca3af;font-size:13px;text-align:center;padding:40px 20px;';
      p.textContent = '모델 피팅 이미지 없음 (선택 사항)';
      tryArea.appendChild(p);
    }

    const summary = document.getElementById('finalSummary');
    summary.replaceChildren();
    const v = state.formValues || {};
    const finalPrice = BASE_PRICE_DEFAULT + PRINT_FEE + (v.designFee || 0) + PLATFORM_FEE;
    const rows = [
      ['제목', v.title || '-'],
      ['학과', v.department || '-'],
      ['목표 수량', (v.targetQuantity || 0) + '벌'],
      ['마감일', v.deadline || '-'],
      ['디자인 수수료', formatWon(v.designFee || 0)],
      ['최종 구매가', formatWon(finalPrice)],
      ['모델 피팅 이미지', state.tryOnImages.length + '장'],
    ];
    rows.forEach(([k, val]) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const a = document.createElement('span'); a.textContent = k;
      const b = document.createElement('span'); b.textContent = val;
      row.append(a, b);
      summary.appendChild(row);
    });
  }

  async function onSubmit() {
    if (!state.designImage) { goToStep(1); return; }
    if (!state.formValues) { goToStep(4); return; }

    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.textContent = '등록 중...';

    try {
      const res = await api.post('/funds', {
        title: state.formValues.title,
        description: state.formValues.description,
        department: state.formValues.department,
        designFee: state.formValues.designFee,
        targetQuantity: state.formValues.targetQuantity,
        deadline: state.formValues.deadline,
        designImageDataUrl: state.designImage,
        tryOnImages: state.tryOnImages,
      });
      window.location.href = '/detail.html?id=' + encodeURIComponent(res.id);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '펀드 개설하기';
      alert((err && err.message) || '펀드 등록에 실패했습니다.');
    }
  }

  // ========== 유틸 ==========
  function setStatus(id, message, type) {
    const el = document.getElementById(id);
    el.textContent = message || '';
    el.className = 'status-line' + (type ? ' ' + type : '');
  }
  function formatWon(n) {
    return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString() + '원';
  }
  function clampInt(v, min, max) {
    const n = typeof v === 'number' ? Math.floor(v) : Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(Math.max(n, min), max);
  }
})();
