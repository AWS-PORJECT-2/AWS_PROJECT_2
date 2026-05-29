/**
 * 펀드 개설 화면 — 4단계 마법사
 *
 * 흐름:
 *  1. 옷 도면 생성  (옷 사진 1~5장 → Gemini → 앞·뒤·옆 도면 1장)
 *  2. 가상 피팅    (도면 → Gemini → 모델 앞/뒤 착용 사진 1장 좌우 50:50)
 *  3. 펀드 정보 입력 (제목·설명·학과·가격·마감일)
 *  4. 검토 + 등록 (최종 설계도 = 도면 + 피팅 합본 캔버스 → POST /api/funds)
 *
 * 기술:
 *  - api.js 의 전역 window.api 사용 (credentials, 401 자동 redirect)
 *  - 도면 / 피팅은 별도 step. 사용자가 단계별로 호출 시점을 명확히 인지하도록 분리
 */

(function () {
  // ========== 상수 ==========
  const PLATFORM_FEE = 5000;
  const BASE_PRICE_DEFAULT = 20000;
  const MIN_DEADLINE_DAYS = 7;
  const RECOMMEND_DEADLINE_DAYS = 14;
  const MAX_GARMENT_IMAGES = 5;
  const MAX_BYTES = 10 * 1024 * 1024;

  // ========== 상태 ==========
  const state = {
    currentStep: 1,
    me: null,
    designImages: [],       // 사용자가 업로드한 옷 사진 (dataURL 배열, 최대 5장)
    blueprintImage: null,   // Gemini 생성 도면 (dataURL)
    tryOnImage: null,       // Gemini 생성 가상 피팅 (dataURL)
    finalDesignImage: null, // 도면 + 피팅 캔버스 합본 (dataURL, step 4 에서 생성)
    formValues: null,
  };

  // ========== 초기화 ==========
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindStep1();
    bindStep3();
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
    document.getElementById('step2Next').addEventListener('click', function () { goToStep(3); });
    document.getElementById('step3Next').addEventListener('click', onStep3Next);
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

    if (step === 2) syncBlueprintRef();
    if (step === 4) renderReview();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ========== Step 1: 옷 사진 업로드 + 도면 생성 ==========
  function bindStep1() {
    var fileInput = document.getElementById('tryonGarmentFile');
    fileInput.addEventListener('change', function (e) {
      onGarmentFilesSelected(e.target.files);
      // 같은 파일 재선택 가능하게 value 비우기
      e.target.value = '';
    });
  }

  function onGarmentFilesSelected(fileList) {
    if (!fileList || !fileList.length) return;
    var files = Array.from(fileList);
    var slotsLeft = MAX_GARMENT_IMAGES - state.designImages.length;
    if (slotsLeft <= 0) {
      alert('최대 ' + MAX_GARMENT_IMAGES + '장까지만 첨부할 수 있습니다. 기존 사진을 삭제한 뒤 다시 시도해 주세요.');
      return;
    }
    if (files.length > slotsLeft) {
      alert('남은 슬롯 ' + slotsLeft + '장만 추가됩니다. (선택한 ' + files.length + '장 중 ' + slotsLeft + '장)');
      files = files.slice(0, slotsLeft);
    }

    var loaded = 0;
    var errors = 0;
    files.forEach(function (file) {
      if (!file.type.startsWith('image/')) { errors++; loaded++; return; }
      if (file.size > MAX_BYTES) { errors++; loaded++; return; }
      var reader = new FileReader();
      reader.onload = function () {
        state.designImages.push(reader.result);
        loaded++;
        if (loaded === files.length) afterLoad(errors);
      };
      reader.onerror = function () { errors++; loaded++; if (loaded === files.length) afterLoad(errors); };
      reader.readAsDataURL(file);
    });
  }

  function afterLoad(errors) {
    if (errors > 0) {
      alert(errors + '장은 형식/용량 문제로 추가되지 못했습니다. (이미지 · 10MB 이하)');
    }
    // 새 사진을 추가하면 이전 도면·피팅 결과 모두 무효화 (다른 입력 → 다른 결과)
    invalidateDownstream();
    renderThumbs();
  }

  function removeGarmentImage(idx) {
    state.designImages.splice(idx, 1);
    invalidateDownstream();
    renderThumbs();
  }
  window.removeGarmentImage = removeGarmentImage;

  function invalidateDownstream() {
    state.blueprintImage = null;
    state.tryOnImage = null;
    state.finalDesignImage = null;
    var blueprintArea = document.getElementById('blueprintResultArea');
    var tryonArea = document.getElementById('tryonResultArea');
    if (blueprintArea) blueprintArea.style.display = 'none';
    if (tryonArea) tryonArea.style.display = 'none';
    document.getElementById('step1Next').disabled = true;
    document.getElementById('step2Next').disabled = true;
  }

  function renderThumbs() {
    var preview = document.getElementById('tryonUploadPreview');
    var thumbs = document.getElementById('tryonThumbs');
    var count = document.getElementById('tryonUploadCount');
    thumbs.innerHTML = '';
    if (state.designImages.length === 0) {
      preview.style.display = 'none';
      document.getElementById('btnAiBlueprint').disabled = true;
      return;
    }
    preview.style.display = 'block';
    count.textContent = '첨부 ' + state.designImages.length + ' / ' + MAX_GARMENT_IMAGES + '장';
    state.designImages.forEach(function (dataUrl, idx) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:90px;height:90px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fff;';
      var img = document.createElement('img');
      img.src = dataUrl;
      img.alt = '옷 사진 ' + (idx + 1);
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
    document.getElementById('btnAiBlueprint').disabled = false;
  }

  // 도면 생성: 1~5장 → 1장
  window.requestAiBlueprint = function () {
    if (state.designImages.length === 0) {
      alert('먼저 옷 사진을 1장 이상 업로드해 주세요.');
      return;
    }
    var btn = document.getElementById('btnAiBlueprint');
    var original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '도면 생성 중... (최대 60초)';
    api.post('/ai/blueprint', { imageDataUrls: state.designImages })
      .then(function (res) {
        if (!res || !res.blueprintDataUrl) throw new Error('NO_BLUEPRINT');
        return trimVerticalWhitespace(res.blueprintDataUrl);
      })
      .then(function (trimmed) {
        state.blueprintImage = trimmed;
        state.tryOnImage = null;
        state.finalDesignImage = null;
        document.getElementById('blueprintResultImg').src = trimmed;
        document.getElementById('blueprintResultArea').style.display = 'block';
        document.getElementById('step1Next').disabled = false;
      })
      .catch(function (err) {
        console.error('blueprint error', err);
        alert('도면 생성 실패: ' + ((err && err.message) || '알 수 없는 오류'));
      })
      .finally(function () {
        btn.disabled = false;
        btn.innerHTML = original;
      });
  };

  // ========== Step 2: 가상 피팅 ==========
  function syncBlueprintRef() {
    if (state.blueprintImage) {
      document.getElementById('tryonBlueprintImg').src = state.blueprintImage;
      document.getElementById('tryonBlueprintRef').style.display = 'block';
    } else {
      document.getElementById('tryonBlueprintRef').style.display = 'none';
    }
  }

  window.requestAiTryOn = function () {
    if (!state.blueprintImage) {
      alert('먼저 1단계에서 도면을 생성해 주세요.');
      return;
    }
    var btn = document.getElementById('btnAiTryOn');
    var original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '피팅 생성 중... (최대 60초)';
    api.post('/ai/try-on', {
      blueprintDataUrl: state.blueprintImage,
      referenceDataUrls: state.designImages, // 원본 옷 사진(1~5장) 함께 전송 — 색·로고·패치 디테일 보존
    })
      .then(function (res) {
        if (!res || !res.tryOnDataUrl) throw new Error('NO_TRYON');
        return trimVerticalWhitespace(res.tryOnDataUrl);
      })
      .then(function (trimmed) {
        state.tryOnImage = trimmed;
        state.finalDesignImage = null;
        document.getElementById('tryonResultImg').src = trimmed;
        document.getElementById('tryonResultArea').style.display = 'block';
        document.getElementById('step2Next').disabled = false;
      })
      .catch(function (err) {
        console.error('try-on error', err);
        alert('가상 피팅 실패: ' + ((err && err.message) || '알 수 없는 오류'));
      })
      .finally(function () {
        btn.disabled = false;
        btn.innerHTML = original;
      });
  };

  // ========== Step 3: 펀드 정보 ==========
  function bindStep3() {
    document.getElementById('fundDesignFee').addEventListener('input', updatePricePreview);
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

  function onStep3Next() {
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
    goToStep(4);
  }

  // ========== Step 4: 검토 (최종 설계도 = 도면 + 피팅 합본) ==========
  function renderReview() {
    // 도면 / 피팅 모두 있어야 최종 설계도 합본 가능
    if (state.blueprintImage && state.tryOnImage) {
      combineImages(state.blueprintImage, state.tryOnImage).then(function (combined) {
        state.finalDesignImage = combined;
        document.getElementById('reviewDesignImg').src = combined;
      });
    } else if (state.blueprintImage) {
      document.getElementById('reviewDesignImg').src = state.blueprintImage;
    }

    var summary = document.getElementById('finalSummary');
    summary.innerHTML = '';
    var v = state.formValues || {};
    var finalPrice = BASE_PRICE_DEFAULT + (v.designFee || 0) + PLATFORM_FEE;
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

  // 도면(위) + 피팅(아래) 을 같은 너비로 정규화해 한 장의 PNG dataURL 로 합치기
  function combineImages(topDataUrl, bottomDataUrl) {
    return new Promise(function (resolve) {
      var top = new Image();
      var bot = new Image();
      var loaded = 0;
      function done() {
        loaded += 1;
        if (loaded < 2) return;
        var W = Math.max(top.naturalWidth, bot.naturalWidth) || 1024;
        var hTop = Math.round(top.naturalHeight * (W / top.naturalWidth));
        var hBot = Math.round(bot.naturalHeight * (W / bot.naturalWidth));
        var canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = hTop + hBot;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, hTop + hBot);
        ctx.drawImage(top, 0, 0, W, hTop);
        ctx.drawImage(bot, 0, hTop, W, hBot);
        resolve(canvas.toDataURL('image/png'));
      }
      top.onload = done;
      bot.onload = done;
      top.onerror = done;
      bot.onerror = done;
      top.src = topDataUrl;
      bot.src = bottomDataUrl;
    });
  }

  async function onSubmit() {
    if (state.designImages.length === 0) { goToStep(1); return; }
    if (!state.blueprintImage) { goToStep(1); return; }
    if (!state.tryOnImage) { goToStep(2); return; }
    if (!state.formValues) { goToStep(3); return; }

    var btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.textContent = '등록 중...';

    // 최종 설계도가 아직 합쳐지지 않았다면 여기서 보장
    if (!state.finalDesignImage) {
      state.finalDesignImage = await combineImages(state.blueprintImage, state.tryOnImage);
    }

    try {
      var res = await api.post('/funds', {
        title: state.formValues.title,
        description: state.formValues.description,
        department: state.formValues.department,
        designFee: state.formValues.designFee,
        targetQuantity: state.formValues.targetQuantity,
        deadline: state.formValues.deadline,
        designImageDataUrl: state.finalDesignImage, // 도면+피팅 합본을 최종 설계도로 전송
        blueprintDataUrl: state.blueprintImage,
        tryOnDataUrl: state.tryOnImage,
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

  // Gemini 결과 이미지에 보통 위/아래 흰 여백이 남아서 캔버스로 trim.
  // 좌우는 3-view / 좌우 50:50 레이아웃 비례 보존 위해 자르지 않음.
  function trimVerticalWhitespace(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var W = img.naturalWidth;
          var H = img.naturalHeight;
          var canvas = document.createElement('canvas');
          canvas.width = W;
          canvas.height = H;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          var data = ctx.getImageData(0, 0, W, H).data;

          // 밝기 평균. 235 미만 픽셀이 한 줄에 W의 1% 이상이면 "내용 있는 줄".
          // 흰색만 있는 줄은 trim 대상.
          var THRESH = 235;
          var MIN_DARK_PCT = 0.01;
          var minDark = Math.max(2, Math.floor(W * MIN_DARK_PCT));

          function rowHasContent(y) {
            var dark = 0;
            for (var x = 0; x < W; x++) {
              var i = (y * W + x) * 4;
              if (data[i] < THRESH || data[i + 1] < THRESH || data[i + 2] < THRESH) {
                dark++;
                if (dark >= minDark) return true;
              }
            }
            return false;
          }

          var top = 0;
          while (top < H && !rowHasContent(top)) top++;
          var bottom = H - 1;
          while (bottom > top && !rowHasContent(bottom)) bottom--;

          // 전부 흰 이미지면 원본 그대로
          if (top >= bottom) { resolve(dataUrl); return; }

          // 위·아래 ~3% 여백 살려두기 (너무 빡빡하면 답답함)
          var PAD = Math.max(4, Math.floor(H * 0.03));
          var t = Math.max(0, top - PAD);
          var b = Math.min(H - 1, bottom + PAD);
          var newH = b - t + 1;

          var out = document.createElement('canvas');
          out.width = W;
          out.height = newH;
          var octx = out.getContext('2d');
          octx.drawImage(canvas, 0, t, W, newH, 0, 0, W, newH);
          resolve(out.toDataURL('image/png'));
        } catch (e) {
          // CORS / 메모리 등 어떤 이유로든 실패하면 원본 반환
          resolve(dataUrl);
        }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }
})();
