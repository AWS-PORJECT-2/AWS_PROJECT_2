/**
 * 상품 상세 페이지 (리뉴얼)
 * - 큰 메인 사진 + 우측 정보 패널 (소개글 / 후원 금액 / 달성률 / 마감)
 * - 스크롤 시 디자이너 소개글
 * - AI 모델 착용 사진 갤러리
 * - 좋아요 / 공구 참여 / 정책 안내 / 결제 흐름은 기존 유지
 *
 * 헤더는 main.js 의 Header({ variant: 'detail' }) 로 자동 렌더되므로 본 파일은 본문만 그린다.
 */

let currentProduct = null;

/* ===== XSS 방어 ===== */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ===== 결제 상태 (Mock) ===== */
async function fetchPaymentStatus(productId) {
  try {
    const mockStatus = localStorage.getItem('paid_' + productId);
    return mockStatus === '1' ? 'paid' : (mockStatus === 'pending' ? 'pending' : 'none');
  } catch (error) {
    console.error('결제 상태 조회 실패:', error);
    return 'none';
  }
}

/* ===== 뒤로가기 ===== */
function goBack() {
  if (document.referrer && document.referrer.indexOf(location.hostname) !== -1) {
    history.back();
  } else {
    location.href = '/main.html';
  }
}

function getProductId() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('id');
  if (!raw) return null;
  // UUID(문자열) 또는 숫자 둘 다 지원
  const num = Number(raw);
  if (!isNaN(num) && num > 0) return num;
  return raw; // UUID 문자열
}

function findProduct(id) {
  if (id === null || id === undefined) return null;
  return MOCK_PRODUCTS.find((p) => String(p.id) === String(id)) || null;
}

function getAchievement(product) {
  return calcAchievementRate(product);
}

/* ===== 마감일까지 남은 일수 ===== */
function daysUntil(deadline) {
  if (!deadline) return null;
  try {
    const d = new Date(deadline);
    const now = new Date();
    const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  } catch (_) { return null; }
}

/* ===== 후원 금액 (단가 × 현재 인원) ===== */
function calcRaisedAmount(p) {
  const price = Number(p.price) || 0;
  const qty = Number(p.currentQuantity) || 0;
  const total = price * qty;
  return total.toLocaleString() + '원';
}

/* ===== 좋아요 버튼 ===== */
function updateLikeButton() {
  const btn = document.getElementById('btnWish');
  if (!btn || !currentProduct) return;
  const liked = isLiked(currentProduct.id);
  const heart = liked
    ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>'
    : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';
  btn.innerHTML = heart + '<span>' + currentProduct.likeCount + '</span>';
  btn.classList.toggle('liked', liked);
}

function handleLike() {
  if (!currentProduct) return;
  toggleLike(currentProduct.id);
  updateLikeButton();
}

/* ===== 모달 (포커스 트래핑 포함) ===== */
let _previousFocus = null;
let _escHandler = null;
let _trapHandler = null;
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function showModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  _previousFocus = document.activeElement;
  modal.classList.add('active');
  requestAnimationFrame(() => {
    const focusable = modal.querySelectorAll(FOCUSABLE_SELECTOR);
    if (focusable.length > 0) focusable[0].focus();
  });
  _escHandler = function (e) { if (e.key === 'Escape') hideModal(id); };
  document.addEventListener('keydown', _escHandler);
  _trapHandler = function (e) {
    if (e.key !== 'Tab') return;
    const focusable = modal.querySelectorAll(FOCUSABLE_SELECTOR);
    if (focusable.length === 0) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', _trapHandler);
}

function hideModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('active');
  if (_escHandler) { document.removeEventListener('keydown', _escHandler); _escHandler = null; }
  if (_trapHandler) { document.removeEventListener('keydown', _trapHandler); _trapHandler = null; }
  if (_previousFocus && typeof _previousFocus.focus === 'function') _previousFocus.focus();
  _previousFocus = null;
}

/* ===== 공구 참여 흐름 ===== */
let _selectedSize = null;

function renderSizeSelection() {
  const area = document.getElementById('sizeSelectionArea');
  if (!area || !currentProduct) return;
  const sizeType = currentProduct.sizeType || 'free';

  if (sizeType === 'multiple') {
    const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    area.innerHTML = `
      <p style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:10px;">사이즈 선택 <span style="color:#ef4444;">*</span></p>
      <div id="sizeSelector" style="display:flex;flex-wrap:wrap;gap:8px;">
        ${sizes.map((s) => `<button type="button" class="size-btn" data-size="${s}" onclick="selectSize('${s}')" style="padding:10px 16px;border:1.5px solid #e5e7eb;border-radius:10px;background:#fff;font-size:13px;font-weight:600;color:#4b5563;cursor:pointer;transition:all 0.15s;">${s}</button>`).join('')}
      </div>
      <p id="sizeError" style="display:none;font-size:12px;color:#ef4444;margin-top:8px;">사이즈를 선택해 주세요.</p>
    `;
  } else {
    _selectedSize = 'Free';
    area.innerHTML = `
      <div style="padding:12px 16px;background:#f0fdf4;border-radius:10px;display:flex;align-items:center;gap:8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
        <span style="font-size:14px;font-weight:600;color:#16a34a;">본 제품은 프리사이즈(Free size)입니다</span>
      </div>
    `;
  }
}

function selectSize(size) {
  _selectedSize = size;
  document.querySelectorAll('.size-btn').forEach((btn) => {
    if (btn.dataset.size === size) {
      btn.style.borderColor = '#8b5cf6';
      btn.style.background = '#eff0fb';
      btn.style.color = '#8b5cf6';
    } else {
      btn.style.borderColor = '#e5e7eb';
      btn.style.background = '#fff';
      btn.style.color = '#4b5563';
    }
  });
  const err = document.getElementById('sizeError');
  if (err) err.style.display = 'none';
}

function handleJoinClick() {
  if (currentProduct.isReserved) {
    alert('이미 참여한 공구입니다.');
    return;
  }
  _selectedSize = null;
  showModal('modalReservation');
  requestAnimationFrame(() => renderSizeSelection());
}

function handleReservationConfirm() {
  const sizeType = (currentProduct && currentProduct.sizeType) || 'free';
  if (sizeType === 'multiple' && !_selectedSize) {
    const err = document.getElementById('sizeError');
    if (err) err.style.display = 'block';
    return;
  }
  if (sizeType === 'free') _selectedSize = 'Free';

  const savedFocus = _previousFocus;
  hideModal('modalReservation');
  renderPolicyModal();
  showModal('modalPolicy');
  _previousFocus = savedFocus;
}

function renderPolicyModal() {
  const rate = getAchievement(currentProduct);
  const policyBody = document.getElementById('policyBody');
  const refundMsg = (rate < 100)
    ? '<div class="policy-refund-ok">현재 환불이 가능합니다.</div>'
    : '<div class="policy-refund-no">현재 달성률 100% 이상으로 환불이 불가합니다.</div>';

  policyBody.innerHTML = `
    ${refundMsg}
    <div class="policy-notice">
      <p>주문 제작 시스템 특성상 <strong>100% 달성 이후 혹은 제작 시작 시 환불 및 교환이 어렵습니다.</strong></p>
    </div>
    <div class="policy-detail">
      <p>현재 달성률: <strong>${rate}%</strong> (${currentProduct.currentQuantity}/${currentProduct.targetQuantity}명)</p>
      <p>마감일: ${escapeHTML(currentProduct.deadline)}</p>
    </div>
  `;
}

function handlePolicyAgree() {
  if (currentProduct.isReserved) {
    alert('이미 참여한 공구입니다.');
    hideModal('modalPolicy');
    return;
  }
  hideModal('modalPolicy');
  setReserved(currentProduct.id, true);
  if (_selectedSize) {
    localStorage.setItem('selectedSize_' + currentProduct.id, _selectedSize);
  }
  renderDetail();
  alert('공구 참여가 완료되었습니다! (사이즈: ' + _selectedSize + ')');
}

function handleCancelReservation() {
  if (!currentProduct || !currentProduct.isReserved) return;
  const paymentState = localStorage.getItem('paid_' + currentProduct.id);
  if (paymentState === 'pending' || paymentState === '1' || currentProduct.isPaid) {
    alert('결제가 진행 중이거나 완료된 주문은 취소할 수 없습니다.');
    return;
  }
  if (!confirm('참여를 취소하시겠습니까?\n선택한 사이즈 정보도 함께 삭제됩니다.')) return;
  setReserved(currentProduct.id, false);
  localStorage.removeItem('notified_100_' + currentProduct.id);
  renderDetail();
  alert('참여가 취소되었습니다.');
}

function goToPayment() {
  if (!currentProduct) return;
  const size = localStorage.getItem('selectedSize_' + currentProduct.id) || '';
  const params = new URLSearchParams({ id: currentProduct.id, size: size });
  window.location.href = 'payment.html?' + params.toString();
}

/**
 * 메인 이미지 높이는 자연 aspect-ratio (4:5) 그대로 둠.
 *   우측 패널은 sticky 로 화면에 고정되므로 좌측이 길수록 스크롤 동안
 *   결제 버튼이 계속 보이는 효과가 자연스러워진다.
 *
 * (이전 버전의 동기화 로직은 폐기 — 우측 패널이 좌측 이미지보다 짧을 때
 *  좌측 이미지가 늘어나면 sticky 효과 자체가 줄어드는 문제가 있었음)
 */
/* 단건 펀드(API)를 detail 이 쓰는 product 형태로 매핑 — 공개목록(MOCK_PRODUCTS)에 없는
   펀드(심사중/오래된 것 등)도 상세를 열 수 있게 한다. */
function fundToProduct(f) {
  var price = Number(f.finalPrice) || 0;
  return {
    id: f.id,
    title: f.title || '',
    description: f.description || '',
    category: f.category || '',
    imageUrl: f.tryonImageUrl || f.designImageUrl || '',
    author: f.authorName || '익명',
    department: f.authorDepartment || '',
    price: price,
    priceText: price ? price.toLocaleString('ko-KR') + '원' : '',
    targetQuantity: Number(f.targetQuantity) || 0,
    currentQuantity: Number(f.currentQuantity) || 0,
    likeCount: Number(f.likeCount) || 0,
    deadline: f.deadline || '',
    status: f.status || 'open',
    sizeType: 'free',
    isLiked: false, isReserved: false, isPaid: false,
  };
}

/* ===== 메인 렌더링 ===== */
async function renderDetail() {
  currentProduct = findProduct(getProductId());
  // 공개목록에 없으면 단건 API 로 직접 조회 (심사중/비노출 펀드 포함)
  if (!currentProduct && window.api) {
    try {
      var f = await window.api.get('/groupbuys/' + encodeURIComponent(getProductId()), { silentAuthFail: true });
      if (f && f.id) currentProduct = fundToProduct(f);
    } catch (e) { /* 아래에서 처리 */ }
  }
  if (!currentProduct) {
    alert('상품 정보를 찾을 수 없습니다.');
    window.location.href = '/main.html';
    return;
  }

  const rate = getAchievement(currentProduct);
  const days = daysUntil(currentProduct.deadline);
  const raised = calcRaisedAmount(currentProduct);
  const container = document.getElementById('detailContainer');

  // 액션 버튼 (4단계 분기) — 모든 활성 버튼은 시그니처 색
  const paymentState = localStorage.getItem('paid_' + currentProduct.id);
  const isAchieved = rate >= 100;
  let actionBtnHtml;
  if (paymentState === 'pending') {
    actionBtnHtml = '<button class="btn-join btn-pending" disabled>입금 확인 중</button>';
  } else if (currentProduct.isPaid || paymentState === '1') {
    actionBtnHtml = '<button class="btn-join" onclick="goToPayment()">결제하기</button>';
  } else if (currentProduct.isReserved && isAchieved) {
    actionBtnHtml = '<button class="btn-join" onclick="goToPayment()">결제하기</button>';
  } else if (currentProduct.isReserved) {
    actionBtnHtml = '<button class="btn-join btn-joined" onclick="handleCancelReservation()">참여 완료</button>';
  } else {
    actionBtnHtml = '<button class="btn-join" onclick="handleJoinClick()">공구 참여하기</button>';
  }

  // 마감 정보 표시
  let deadlineText;
  if (days === null) deadlineText = currentProduct.deadline;
  else if (days < 0) deadlineText = '마감됨';
  else if (days === 0) deadlineText = '오늘 마감';
  else deadlineText = days + '일 남음';

  // 펀딩 기간 (현재 ~ 마감일까지)
  const periodText = (days !== null && days >= 0)
    ? days + '일'
    : '마감';

  // 결제 시점 (요청사항 4종목 — 단순 Mock 텍스트, 추후 확장)
  const paymentTimingText = '펀딩 성공 시';

  // 예상 수령일 — 마감일 + 14일 (제작 기간 약 2주)
  let expectedDeliveryText;
  try {
    const dl = new Date(currentProduct.deadline);
    if (!isNaN(dl.getTime())) {
      const eta = new Date(dl.getTime() + 14 * 24 * 60 * 60 * 1000);
      const m = eta.getMonth() + 1;
      const d = eta.getDate();
      expectedDeliveryText = m + '월 ' + d + '일경';
    } else {
      expectedDeliveryText = '미정';
    }
  } catch (_) { expectedDeliveryText = '미정'; }

  // 목표 금액 (단가 × 목표 인원)
  const goalAmount = (Number(currentProduct.price) || 0) * (Number(currentProduct.targetQuantity) || 0);
  const goalAmountText = goalAmount.toLocaleString() + '원';

  container.innerHTML = `
    <!-- 모바일: 사진 → 정보 패널 → 디자이너 스토리 순서 (DOM 순서 그대로 노출) -->
    <!-- 데스크톱: 좌측(사진 + 스토리) | 우측 fixed 패널 (CSS 가 padding-right 으로 우측 영역 비움) -->
    <section class="detail-layout">

      <!-- 1) 메인 이미지 (풀사이즈) -->
      <div class="detail-hero__media">
        <div class="hero-img-wrap hero-img-full" id="heroImgWrap">
          <img src="${escapeHTML(currentProduct.imageUrl)}" alt="${escapeHTML(currentProduct.title)}" class="hero-img" id="heroImg">
        </div>
      </div>

      <!-- 2) 정보 패널 — 데스크톱에선 fixed 로 우측 고정, 모바일에선 사진 다음 위치 -->
      <aside class="detail-info" id="detailInfo">
        <!-- 작성자 (아바타 + 이름 + 학과) -->
        <div class="info-author">
          <img src="${escapeHTML(currentProduct.authorAvatar)}" alt="" class="author-avatar">
          <div class="author-meta">
            <span class="author-name">${escapeHTML(currentProduct.author)}</span>
            <span class="author-dept">${escapeHTML(currentProduct.department)}</span>
          </div>
        </div>

        <h1 class="info-title">${escapeHTML(currentProduct.title)}</h1>
        <p class="info-summary">${escapeHTML(currentProduct.description.split('.')[0] || '')}</p>

        <!-- 후원 금액 / 달성률 / 마감 -->
        <div class="info-stats">
          <div class="stat-item stat-raised">
            <span class="stat-label">후원 금액</span>
            <span class="stat-value">${escapeHTML(raised)}</span>
          </div>
          <div class="stat-item stat-rate">
            <span class="stat-label">달성률</span>
            <span class="stat-value">${rate}%</span>
          </div>
          <div class="stat-item stat-deadline">
            <span class="stat-label">마감</span>
            <span class="stat-value">${escapeHTML(deadlineText)}</span>
          </div>
        </div>

        <div class="info-progress">
          <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min(rate, 100)}%"></div></div>
          <div class="progress-meta">
            <span>${currentProduct.currentQuantity}/${currentProduct.targetQuantity}명 참여</span>
            <span>${escapeHTML(currentProduct.priceText)}</span>
          </div>
        </div>

        <!-- 4종목 (목표 금액 / 기간 / 결제 / 예상 수령일) -->
        <div class="info-meta-grid">
          <div class="meta-row">
            <span class="meta-label">목표 금액</span>
            <span class="meta-value">${escapeHTML(goalAmountText)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">기간</span>
            <span class="meta-value">${escapeHTML(periodText)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">결제</span>
            <span class="meta-value">${escapeHTML(paymentTimingText)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">예상 수령일</span>
            <span class="meta-value">${escapeHTML(expectedDeliveryText)}</span>
          </div>
        </div>

        <!-- 선물(리워드) 선택 — renderRewardTiers 가 채움 (없으면 숨김) -->
        <div id="rewardTierBox" style="margin-top:8px;"></div>

        <!-- 좋아요 + 공구 참여 버튼 -->
        <div class="info-actions">
          <button class="btn-wish" id="btnWish" onclick="handleLike()">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            <span>${currentProduct.likeCount}</span>
          </button>
          ${actionBtnHtml}
        </div>
      </aside>

      <!-- 3) 디자이너 소개글 + 모델 착용 컷 (텀블벅에서 가장 마지막) -->
      <section class="detail-story">
        <div class="story-head">
          <h2>디자이너의 이야기</h2>
          <span class="story-author">by ${escapeHTML(currentProduct.author)} · ${escapeHTML(currentProduct.department)}</span>
        </div>

        <!-- 본문: 작성자가 등록한 글/사진 블록 (renderStoryBody 가 채움). 초기엔 한 줄 소개. -->
        <div class="story-flow" id="storyFlow">
          <p>${escapeHTML(currentProduct.description || '')}</p>
        </div>
      </section>
    </section>

    <!-- 하단 spacer (모바일 sticky bar 영역) -->
    <div class="detail-bottom-spacer"></div>

    <!-- 모바일 sticky 액션 바 -->
    <div class="detail-sticky-bar">
      <button class="btn-wish" onclick="handleLike()" aria-label="좋아요">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      </button>
      ${actionBtnHtml}
    </div>
  `;

  // 썸네일 제거됨 — 메인 이미지만 표시 (높이는 CSS aspect-ratio 가 처리)

  // 100% 달성 알림 (참여자 한정, 최초 1회)
  if (currentProduct.isReserved && isAchieved && !currentProduct.isPaid && paymentState !== 'pending') {
    const notifiedKey = 'notified_100_' + currentProduct.id;
    if (!localStorage.getItem(notifiedKey)) {
      localStorage.setItem(notifiedKey, '1');
      setTimeout(() => alert('🎉 축하합니다! 펀딩이 달성되었습니다. 결제를 진행해 주세요!'), 500);
    }
  }

  updateLikeButton();
  document.title = currentProduct.title + ' - doothing';

  // 게시글 본문: 서버에서 작성자가 등록한 블록(글/사진)을 가져와 렌더 (없으면 한 줄 소개 유지)
  renderStoryBody(currentProduct.id);
}

/* 게시글 본문 렌더 — GET /api/groupbuys/:id 의 contentBlocks(글/사진) 를 순서대로 표시.
   실패하거나 블록이 없으면 한 줄 소개(description)만 남긴다. 가짜 문단/이미지는 생성하지 않음. */
/* 선물(리워드) 선택 표시. Phase 4 에서 선택→결제 연동 예정. 현재는 목록·잔여수량 표시. */
function renderRewardTiers(tiers) {
  const box = document.getElementById('rewardTierBox');
  if (!box) return;
  if (!Array.isArray(tiers) || tiers.length === 0) { box.innerHTML = ''; return; }
  box.innerHTML = '';
  const head = document.createElement('div');
  head.textContent = '선물 선택';
  head.style.cssText = 'font-size:15px;font-weight:700;color:#1a1a1a;margin:6px 0 10px;';
  box.appendChild(head);

  tiers.forEach((t) => {
    const remain = (t.stockLimit == null) ? null : Math.max(0, t.stockLimit - (t.soldCount || 0));
    const soldOut = remain === 0;
    const card = document.createElement('div');
    card.style.cssText = 'border:1.5px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:10px;' +
      (soldOut ? 'opacity:0.5;' : '');
    const price = document.createElement('div');
    price.style.cssText = 'font-size:16px;font-weight:800;color:#1a1a1a;';
    price.textContent = (Number(t.price) || 0).toLocaleString('ko-KR') + '원 +';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:14px;font-weight:600;color:#374151;margin-top:6px;';
    title.textContent = t.title || '';
    card.appendChild(price);
    card.appendChild(title);
    if (t.description) {
      const desc = document.createElement('div');
      desc.style.cssText = 'font-size:13px;color:#6b7280;margin-top:4px;white-space:pre-wrap;';
      desc.textContent = t.description;
      card.appendChild(desc);
    }
    if (remain != null) {
      const stock = document.createElement('div');
      stock.style.cssText = 'font-size:12px;font-weight:600;color:' + (soldOut ? '#9ca3af' : '#ef4444') + ';margin-top:8px;';
      stock.textContent = soldOut ? '품절' : (remain + '개 남음');
      card.appendChild(stock);
    }
    box.appendChild(card);
  });
}

async function renderStoryBody(id) {
  const flow = document.getElementById('storyFlow');
  if (!flow || !window.api) return;
  try {
    const fund = await window.api.get('/groupbuys/' + encodeURIComponent(id), { silentAuthFail: true });
    renderRewardTiers(fund && fund.rewardTiers);
    const blocks = fund && Array.isArray(fund.contentBlocks) ? fund.contentBlocks : [];
    const desc = (fund && fund.description) || currentProduct.description || '';

    if (blocks.length === 0) {
      flow.innerHTML = '';
      if (desc) {
        const p = document.createElement('p');
        p.textContent = desc; // textContent — XSS 방어
        flow.appendChild(p);
      }
      return;
    }

    flow.innerHTML = '';
    blocks.forEach((b) => {
      if (b.type === 'text') {
        // 줄바꿈 보존: 문단마다 p, \n 은 <br> 대신 white-space 로 처리
        const p = document.createElement('p');
        p.textContent = b.value;
        p.style.whiteSpace = 'pre-wrap';
        flow.appendChild(p);
      } else if (b.type === 'image' && typeof b.value === 'string') {
        const fig = document.createElement('figure');
        fig.className = 'story-figure';
        const img = document.createElement('img');
        img.src = b.value; // 작성자 본인이 올린 이미지
        img.alt = '게시글 이미지';
        img.loading = 'lazy';
        fig.appendChild(img);
        flow.appendChild(fig);
      }
    });
  } catch (e) {
    // 상세 조회 실패(목 시드 등) → 한 줄 소개만 유지
    const desc = currentProduct.description || '';
    flow.innerHTML = '';
    if (desc) {
      const p = document.createElement('p');
      p.textContent = desc;
      flow.appendChild(p);
    }
  }
}

/* main.js 의 App() 가 헤더를 먼저 그린 후에 실행되도록 DOMContentLoaded 사용
   백엔드 fetch 가 완료된 후에 렌더 — mockproducts:updated 이벤트 + 1초 timeout fallback */
function renderDetailWhenReady() {
  let rendered = false;
  function doRender() {
    if (rendered) return;
    rendered = true;
    renderDetail();
  }
  // 백엔드 데이터 로드되면 즉시 렌더
  window.addEventListener('mockproducts:updated', doRender, { once: true });
  // 백엔드 응답이 없거나 실패하면 1초 후 mock으로 렌더
  setTimeout(doRender, 1200);
  // 이미 데이터가 채워져 있으면 즉시
  if (typeof MOCK_PRODUCTS !== 'undefined' && MOCK_PRODUCTS.length > 0 && findProduct(getProductId())) {
    doRender();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderDetailWhenReady);
} else {
  renderDetailWhenReady();
}
