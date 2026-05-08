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
  const PRINT_FEE = 3000;
  const PLATFORM_FEE = 2000;
  const BASE_PRICE_DEFAULT = 20000;
  const MIN_DEADLINE_DAYS = 7;
  const RECOMMEND_DEADLINE_DAYS = 14;

  // ========== 상태 ==========
  const state = {
    currentStep: 1,
    me: null,
    designImage: null,
    formValues: null,
  };

  // ========== 초기화 ==========
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindStep1();
    bindStep2();
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
      var file = e.target.files[0];
      if (file) onTryonFileSelected(file);
    });
  }

  function onTryonFileSelected(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('10MB 이하 파일만 업로드 가능합니다.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      state.designImage = reader.result;
      // 미리보기 표시
      var preview = document.getElementById('tryonUploadPreview');
      var img = document.getElementById('tryonPreviewImg');
      img.src = reader.result;
      preview.style.display = 'block';
      // AI 피팅 버튼 활성화
      document.getElementById('btnAiTryOn').disabled = false;
      // 다음 버튼 활성화
      document.getElementById('step1Next').disabled = false;
    };
    reader.readAsDataURL(file);
  }

  // 전역 함수 — HTML onclick에서 호출
  window.requestAiTryOn = function () {
    if (!state.designImage) {
      alert('먼저 이미지를 업로드해 주세요.');
      return;
    }
    // Placeholder: Amazon Try-On API 연동 예정
    // 현재는 업로드된 이미지를 그대로 결과로 사용
    var resultArea = document.getElementById('tryonResultArea');
    var resultImg = document.getElementById('tryonResultImg');
    resultImg.src = state.designImage;
    resultArea.style.display = 'block';

    alert('Amazon Try-On API 연동 예정\n\n현재는 업로드된 이미지가 그대로 사용됩니다.');
  };

  // ========== Step 2: 펀드 정보 ==========
  function bindStep2() {
    document.getElementById('fundDesignFee').addEventListener('input', updatePricePreview);
  }

  function updatePricePreview() {
    var designFee = clampInt(document.getElementById('fundDesignFee').value, 0, 50000);
    document.getElementById('previewBasePrice').textContent = formatWon(BASE_PRICE_DEFAULT);
    document.getElementById('previewDesignFee').textContent = formatWon(designFee);
    document.getElementById('previewPrintFee').textContent = formatWon(PRINT_FEE);
    document.getElementById('previewPlatformFee').textContent = formatWon(PLATFORM_FEE);
    var finalPrice = BASE_PRICE_DEFAULT + PRINT_FEE + designFee + PLATFORM_FEE;
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
    if (!state.formValues.title || !state.formValues.department) return;
    goToStep(3);
  }

  // ========== Step 3: 검토 + 등록 ==========
  function renderReview() {
    if (state.designImage) {
      document.getElementById('reviewDesignImg').src = state.designImage;
    }

    var summary = document.getElementById('finalSummary');
    summary.innerHTML = '';
    var v = state.formValues || {};
    var finalPrice = BASE_PRICE_DEFAULT + PRINT_FEE + (v.designFee || 0) + PLATFORM_FEE;
    var rows = [
      ['제목', v.title || '-'],
      ['학과', v.department || '-'],
      ['목표 수량', (v.targetQuantity || 0) + '벌'],
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
    if (!state.designImage) { goToStep(1); return; }
    if (!state.formValues) { goToStep(2); return; }

    var btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.textContent = '등록 중...';

    try {
      var res = await api.post('/funds', {
        title: state.formValues.title,
        description: state.formValues.description,
        department: state.formValues.department,
        designFee: state.formValues.designFee,
        targetQuantity: state.formValues.targetQuantity,
        deadline: state.formValues.deadline,
        designImageDataUrl: state.designImage,
        tryOnImages: [],
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
