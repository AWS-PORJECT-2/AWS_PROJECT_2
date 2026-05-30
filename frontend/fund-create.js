/**
 * 펀드 개설 화면 — 3단계 마법사
 *
 * 흐름:
 *  1. AI 모델 피팅 (이미지 업로드 → Amazon Try-On placeholder)
 *  2. 펀드 정보 입력 (제목·설명·학과·가격·마감일)
 *  3. 검토 + 등록 (POST /api/funds)
 *
 * 기술:
 *  - api.js 의 전역 window.api 사용 (credentials, 401 자동 redirect)
 */

(function () {
  // ========== 상수 ==========
  const PLATFORM_FEE = 5000; // 인쇄/중개 통합 수수료
  const BASE_PRICE_DEFAULT = 20000;
  const MIN_DEADLINE_DAYS = 7;
  const RECOMMEND_DEADLINE_DAYS = 14;

  // ========== 상태 ==========
  const state = {
    currentStep: 1,
    me: null,
    designImages: [],   // 업로드한 디자인 이미지 (dataURL 배열, 최대 5장)
    tryOnImage: null,
    contentBlocks: [],  // 게시글 본문 블록 [{type:'text'|'image', value}]
    formValues: null,
  };
  const MAX_IMAGES = 5;

  // ========== 초기화 ==========
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindStep1();
    bindStep2();
    bindNavigation();
    setDefaultDeadline();
    presetCategoryFromUrl();

    try {
      state.me = await api.get('/auth/me');
      // 소속·단체는 선택 입력 — 학과 자동주입 제거(일반인 확장 대비)
    } catch (err) {
      // 미로그인이면 api.js 가 /login.html로 보냄
    }
  }

  // #fundCategory 셀렉트를 DT_CATEGORIES 로 채우고, URL ?category= 기본 선택, 타입별 AI 블록 토글.
  function presetCategoryFromUrl() {
    var sel = document.getElementById('fundCategory');
    if (!sel) return;
    var cats = (window.DT_CATEGORIES || []);
    sel.innerHTML = cats.map(function (c) {
      return '<option value="' + c.slug + '">' + c.label + '</option>';
    }).join('');

    var raw = new URLSearchParams(window.location.search).get('category') || '';
    var matched = (typeof window.dtCategory === 'function') ? window.dtCategory(raw) : null;
    if (matched) sel.value = matched.slug;

    sel.addEventListener('change', updateAiSection);
    updateAiSection();
  }

  // 선택 카테고리 타입에 따라 AI 블록을 전환: 의류=가상피팅 / 굿즈=전시 이미지 / 기타=AI 없음
  function updateAiSection() {
    var sel = document.getElementById('fundCategory');
    var type = (typeof window.dtCategoryType === 'function') ? window.dtCategoryType(sel.value) : 'none';
    var aiBlock = document.getElementById('aiBlock');
    var noAiNote = document.getElementById('noAiNote');
    var modelField = document.getElementById('modelTypeField');
    var btn = document.getElementById('btnAiTryOn');
    var help = document.getElementById('aiHelpText');
    var hint = document.getElementById('categoryHint');

    if (type === 'none') {
      aiBlock.style.display = 'none';
      noAiNote.style.display = 'block';
      hint.textContent = '';
      return;
    }
    aiBlock.style.display = 'block';
    noAiNote.style.display = 'none';

    if (type === 'apparel') {
      modelField.style.display = '';
      btn.textContent = 'AI 가상피팅 생성';
      help.textContent = '업로드한 디자인을 선택한 모델·배경에 입혀 앞/뒤 모습을 생성합니다. (선택)';
      hint.textContent = '의류 카테고리 — 모델이 착용한 가상피팅 이미지를 만들 수 있어요.';
    } else { // goods
      modelField.style.display = 'none';
      btn.textContent = 'AI 전시 이미지 생성';
      help.textContent = '업로드한 굿즈를 깔끔한 전시 컷처럼 생성합니다. (선택)';
      hint.textContent = '굿즈 카테고리 — 제품을 전시·진열 컷처럼 생성할 수 있어요.';
    }
  }

  // ========== Step 네비게이션 ==========
  function bindNavigation() {
    document.getElementById('step1Next').addEventListener('click', function () { goToStep(2); });
    document.getElementById('step2Next').addEventListener('click', onStep2Next);
    document.querySelectorAll('.btn-prev').forEach(function (btn) {
      btn.addEventListener('click', function () { goToStep(Number(btn.dataset.go)); });
    });
    document.getElementById('btnSubmit').addEventListener('click', onSubmit);
  }

  function goToStep(step) {
    state.currentStep = step;
    document.querySelectorAll('[data-step-panel]').forEach(function (p) {
      p.hidden = Number(p.dataset.stepPanel) !== step;
    });
    document.querySelectorAll('.step').forEach(function (s) {
      var num = Number(s.dataset.step);
      s.classList.toggle('active', num === step);
      s.classList.toggle('done', num < step);
    });

    if (step === 3) renderReview();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ========== Step 1: AI 모델 피팅 ==========
  function bindStep1() {
    var fileInput = document.getElementById('tryonGarmentFile');
    fileInput.addEventListener('change', function (e) {
      onGarmentFilesSelected(e.target.files);
      e.target.value = ''; // 같은 파일 재선택 허용
    });
  }

  function onGarmentFilesSelected(fileList) {
    if (!fileList || !fileList.length) return;
    var files = Array.prototype.slice.call(fileList);
    var slotsLeft = MAX_IMAGES - state.designImages.length;
    if (slotsLeft <= 0) {
      alert('최대 ' + MAX_IMAGES + '장까지만 첨부할 수 있습니다.');
      return;
    }
    if (files.length > slotsLeft) {
      alert('남은 ' + slotsLeft + '장만 추가됩니다.');
      files = files.slice(0, slotsLeft);
    }
    var loaded = 0, errors = 0;
    files.forEach(function (file) {
      if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
        errors++; loaded++;
        if (loaded === files.length) afterGarmentLoad(errors);
        return;
      }
      var reader = new FileReader();
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
    // 디자인이 바뀌면 이전 피팅 결과 무효화
    state.tryOnImage = null;
    var tryonArea = document.getElementById('tryonResultArea');
    if (tryonArea) tryonArea.style.display = 'none';
    renderGarmentThumbs();
  }

  function removeGarmentImage(idx) {
    state.designImages.splice(idx, 1);
    state.tryOnImage = null;
    var tryonArea = document.getElementById('tryonResultArea');
    if (tryonArea) tryonArea.style.display = 'none';
    renderGarmentThumbs();
  }
  window.removeGarmentImage = removeGarmentImage;

  function renderGarmentThumbs() {
    var preview = document.getElementById('tryonUploadPreview');
    var thumbs = document.getElementById('tryonThumbs');
    var count = document.getElementById('tryonUploadCount');
    var hasImages = state.designImages.length > 0;
    // AI 피팅 버튼은 이미지가 있을 때만 동작. 단, 피팅은 선택사항이라 '다음'은 항상 가능.
    document.getElementById('btnAiTryOn').disabled = !hasImages;
    document.getElementById('step1Next').disabled = false;
    if (!hasImages) { preview.style.display = 'none'; thumbs.innerHTML = ''; return; }
    preview.style.display = 'block';
    count.textContent = '첨부 ' + state.designImages.length + ' / ' + MAX_IMAGES + '장';
    thumbs.innerHTML = '';
    state.designImages.forEach(function (dataUrl, idx) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:90px;height:90px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fff;';
      var img = document.createElement('img');
      img.src = dataUrl;
      img.alt = '디자인 ' + (idx + 1);
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = '삭제';
      del.style.cssText = 'position:absolute;top:2px;right:2px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;font-size:14px;line-height:1;cursor:pointer;padding:0;';
      del.onclick = function () { removeGarmentImage(idx); };
      wrap.appendChild(img);
      wrap.appendChild(del);
      thumbs.appendChild(wrap);
    });
  }

  // 생성 중 로딩 스피너 (가짜 % 대신). 버튼 아래에 표시, 완료 시 제거.
  function startAiLoading(btn) {
    if (!document.getElementById('ai-spin-style')) {
      var st = document.createElement('style');
      st.id = 'ai-spin-style';
      st.textContent = '@keyframes aiSpin{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
    var prev = btn.parentNode.querySelector('.ai-loading');
    if (prev) prev.remove();
    var box = document.createElement('div');
    box.className = 'ai-loading';
    box.style.cssText = 'margin-top:14px;display:flex;flex-direction:column;align-items:center;gap:10px;color:#6b7280;font-size:14px;';
    box.innerHTML =
      '<div style="width:36px;height:36px;border:3px solid #ede9fe;border-top-color:#7c3aed;border-radius:50%;animation:aiSpin 0.8s linear infinite;"></div>' +
      '<span>AI가 모델에 입히는 중… 잠시만 기다려 주세요</span>';
    btn.insertAdjacentElement('afterend', box);
    return function () { box.remove(); };
  }

  // AI 모델 피팅 — 업로드한 디자인 + 모델타입/배경 → Gemini 가 모델 착용 사진 생성
  window.requestAiTryOn = function () {
    if (!state.designImages.length) {
      alert('먼저 이미지를 업로드해 주세요.');
      return;
    }
    var btn = document.getElementById('btnAiTryOn');
    var modelSel = document.getElementById('tryonModelSelect');
    var bgSel = document.getElementById('tryonBgSelect');
    var catSel = document.getElementById('fundCategory');
    var modelType = (modelSel && modelSel.value) || 'female';
    var background = (bgSel && bgSel.value) || 'studio';
    var category = (catSel && catSel.value) || 'etc'; // 카테고리 slug → 백엔드가 의류/굿즈 모드로 매핑
    btn.disabled = true;
    var stop = startAiLoading(btn);
    api.post('/ai/try-on', { imageDataUrls: state.designImages, modelType: modelType, background: background, category: category })
      .then(function (res) {
        if (!res || !res.tryOnDataUrl) throw new Error('NO_TRYON');
        state.tryOnImage = res.tryOnDataUrl;
        document.getElementById('tryonResultImg').src = res.tryOnDataUrl;
        document.getElementById('tryonResultArea').style.display = 'block';
      })
      .catch(function (err) {
        console.error('try-on error', err);
        alert('AI 모델 피팅 실패: ' + ((err && err.message) || '알 수 없는 오류'));
      })
      .finally(function () {
        btn.disabled = false;
        stop();
      });
  };

  // ========== Step 2: 펀드 정보 ==========
  function bindStep2() {
    document.getElementById('fundDesignFee').addEventListener('input', updatePricePreview);
    bindContentComposer();
  }

  // 게시글 본문 작성기 — 텍스트/사진 블록을 원하는 순서로 추가
  function bindContentComposer() {
    document.getElementById('addTextBlock').addEventListener('click', function () {
      state.contentBlocks.push({ type: 'text', value: '' });
      renderContentBlocks();
    });
    document.getElementById('addImageBlock').addEventListener('click', function () {
      document.getElementById('contentImageInput').click();
    });
    document.getElementById('contentImageInput').addEventListener('change', function (e) {
      var file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
        alert('이미지 파일(10MB 이하)만 추가할 수 있습니다.');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        state.contentBlocks.push({ type: 'image', value: reader.result });
        renderContentBlocks();
      };
      reader.readAsDataURL(file);
    });
  }

  function renderContentBlocks() {
    var wrap = document.getElementById('contentBlocks');
    wrap.innerHTML = '';
    state.contentBlocks.forEach(function (block, idx) {
      var row = document.createElement('div');
      row.style.cssText = 'position:relative;border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#fff;';
      if (block.type === 'text') {
        var ta = document.createElement('textarea');
        ta.rows = 3;
        ta.value = block.value;
        ta.placeholder = '본문 내용을 입력하세요';
        ta.style.cssText = 'width:100%;border:none;resize:vertical;font-size:14px;line-height:1.6;outline:none;background:transparent;box-sizing:border-box;';
        // 재렌더 없이 값만 갱신 (포커스 유지)
        ta.addEventListener('input', function () { state.contentBlocks[idx].value = ta.value; });
        row.appendChild(ta);
      } else {
        var img = document.createElement('img');
        img.src = block.value;
        img.alt = '본문 이미지';
        img.style.cssText = 'max-width:100%;max-height:240px;border-radius:8px;display:block;margin:0 auto;';
        row.appendChild(img);
      }
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = '삭제';
      del.style.cssText = 'position:absolute;top:6px;right:6px;width:24px;height:24px;border:none;border-radius:50%;background:rgba(0,0,0,0.55);color:#fff;font-size:15px;line-height:1;cursor:pointer;padding:0;';
      del.onclick = function () { state.contentBlocks.splice(idx, 1); renderContentBlocks(); };
      row.appendChild(del);
      wrap.appendChild(row);
    });
  }

  function updatePricePreview() {
    var designFee = clampInt(document.getElementById('fundDesignFee').value, 0, 50000);
    document.getElementById('previewBasePrice').textContent = formatWon(BASE_PRICE_DEFAULT);
    document.getElementById('previewDesignFee').textContent = formatWon(designFee);
    document.getElementById('previewPlatformFee').textContent = formatWon(PLATFORM_FEE);
    var finalPrice = BASE_PRICE_DEFAULT + designFee + PLATFORM_FEE;
    document.getElementById('previewFinalPrice').textContent = formatWon(finalPrice);
  }

  function setDefaultDeadline() {
    var input = document.getElementById('fundDeadline');
    var recommend = new Date();
    recommend.setDate(recommend.getDate() + RECOMMEND_DEADLINE_DAYS);
    var min = new Date();
    min.setDate(min.getDate() + MIN_DEADLINE_DAYS);
    input.value = formatLocalYmd(recommend);
    input.min = formatLocalYmd(min);
  }

  function formatLocalYmd(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function onStep2Next() {
    var form = document.getElementById('fundForm');
    if (!form.reportValidity()) return;
    state.formValues = {
      title: document.getElementById('fundTitle').value.trim(),
      description: document.getElementById('fundDescription').value.trim(),
      department: document.getElementById('fundDepartment').value.trim(),
      designFee: clampInt(document.getElementById('fundDesignFee').value, 0, 50000),
      targetQuantity: clampInt(document.getElementById('fundTargetQuantity').value, 1, 500),
      deadline: document.getElementById('fundDeadline').value,
    };
    if (!state.formValues.title) return; // 소속·단체(department)는 선택
    goToStep(3);
  }

  // ========== Step 3: 검토 + 등록 ==========
  function renderReview() {
    // 생성된 모델 피팅이 있으면 그걸, 없으면 첫 업로드 디자인을 보여줌
    var reviewSrc = state.tryOnImage || state.designImages[0];
    if (reviewSrc) {
      document.getElementById('reviewDesignImg').src = reviewSrc;
    }

    var summary = document.getElementById('finalSummary');
    summary.innerHTML = '';
    var v = state.formValues || {};
    var finalPrice = BASE_PRICE_DEFAULT + (v.designFee || 0) + PLATFORM_FEE;
    var catSel = document.getElementById('fundCategory');
    var catObj = (catSel && typeof window.dtCategory === 'function') ? window.dtCategory(catSel.value) : null;
    var rows = [
      ['제목', v.title || '-'],
      ['카테고리', catObj ? catObj.label : '-'],
      ['소속·단체', v.department || '-'],
      ['목표 수량', (v.targetQuantity || 0) + '개'],
      ['마감일', v.deadline || '-'],
      ['디자인 수수료', formatWon(v.designFee || 0)],
      ['최종 구매가', formatWon(finalPrice)],
    ];
    rows.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'summary-row';
      var a = document.createElement('span');
      a.textContent = item[0];
      var b = document.createElement('span');
      b.textContent = item[1];
      row.appendChild(a);
      row.appendChild(b);
      summary.appendChild(row);
    });
  }

  async function onSubmit() {
    if (!state.formValues) { goToStep(2); return; } // 이미지는 선택 — 디자인 이미지 강제 제거

    var catSel = document.getElementById('fundCategory');
    var btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.textContent = '등록 중...';

    try {
      var res = await api.post('/funds', {
        title: state.formValues.title,
        description: state.formValues.description,
        department: state.formValues.department,
        category: (catSel && catSel.value) || 'etc',
        designFee: state.formValues.designFee,
        targetQuantity: state.formValues.targetQuantity,
        deadline: state.formValues.deadline,
        designImageDataUrl: state.designImages[0] || null,       // 옷 디자인 사진(있으면)
        tryOnImages: state.tryOnImage ? [state.tryOnImage] : [], // AI 미리보기 사진(있으면)
        contentBlocks: state.contentBlocks                       // 게시글 본문 (글/사진 블록)
          .filter(function (b) { return b.type === 'image' || (b.value && b.value.trim()); }),
      });
      window.location.href = '/detail.html?id=' + encodeURIComponent(res.id);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '펀드 개설하기';
      alert((err && err.message) || '펀드 등록에 실패했습니다.');
    }
  }

  // ========== 유틸 ==========
  function formatWon(n) {
    return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString() + '원';
  }
  function clampInt(v, min, max) {
    var n = typeof v === 'number' ? Math.floor(v) : Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(Math.max(n, min), max);
  }
})();
