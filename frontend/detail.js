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
  const id = Number(params.get('id'));
  if (isNaN(id) || id <= 0) return null;
  return id;
}

function findProduct(id) {
  if (id === null || id === undefined) return null;
  return MOCK_PRODUCTS.find((p) => p.id === id) || null;
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

/* ===== AI 모델 착용 사진 시드 ===== */
function getModelGallery(p) {
  const seedBase = 'doothing-model-' + p.id;
  // 8개의 다른 모델 이미지를 picsum 시드로 생성
  return [
    'https://picsum.photos/seed/' + seedBase + '-a/600/800',
    'https://picsum.photos/seed/' + seedBase + '-b/600/800',
    'https://picsum.photos/seed/' + seedBase + '-c/600/800',
    'https://picsum.photos/seed/' + seedBase + '-d/600/800',
    'https://picsum.photos/seed/' + seedBase + '-e/600/800',
    'https://picsum.photos/seed/' + seedBase + '-f/600/800',
  ];
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
      btn.style.borderColor = '#5b6ee1';
      btn.style.background = '#eff0fb';
      btn.style.color = '#5b6ee1';
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
function syncHeroToInfoHeight() {
  const heroWrap = document.getElementById('heroImgWrap');
  if (!heroWrap) return;
  // 동기화 해제 — CSS aspect-ratio 가 모든 모드에서 자연스럽게 적용
  heroWrap.style.height = '';
}

/* ===== 메인 렌더링 ===== */
function renderDetail() {
  currentProduct = findProduct(getProductId());
  if (!currentProduct) {
    alert('상품 정보를 찾을 수 없습니다.');
    window.location.href = '/main.html';
    return;
  }

  const rate = getAchievement(currentProduct);
  const days = daysUntil(currentProduct.deadline);
  const raised = calcRaisedAmount(currentProduct);
  const gallery = getModelGallery(currentProduct);
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

      <!-- 1) 메인 이미지 + 썸네일 -->
      <div class="detail-hero__media">
        <div class="hero-img-wrap" id="heroImgWrap">
          <img src="${escapeHTML(currentProduct.imageUrl)}" alt="${escapeHTML(currentProduct.title)}" class="hero-img" id="heroImg">
        </div>
        <div class="hero-thumbs" id="heroThumbs">
          ${[currentProduct.imageUrl, ...gallery.slice(0, 3)].map((src, idx) => `
            <button class="hero-thumb${idx === 0 ? ' active' : ''}" type="button" data-src="${escapeHTML(src)}" aria-label="썸네일 ${idx + 1}">
              <img src="${escapeHTML(src)}" alt="">
            </button>
          `).join('')}
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

        <div class="story-flow">
          <p>${escapeHTML(currentProduct.description)}</p>

          <figure class="story-figure">
            <img src="${escapeHTML(gallery[0])}" alt="모델 착용 컷 1" loading="lazy">
          </figure>

          <p>이 디자인은 ${escapeHTML(currentProduct.department)} 학생이 직접 기획하고 제작한 한정판입니다. 매 시즌마다 새로운 디자인으로 찾아오며, 학교 안에서만 만나볼 수 있는 시그니처 굿즈로 자리잡고 있습니다.</p>

          <figure class="story-figure story-figure-grid">
            <img src="${escapeHTML(gallery[1])}" alt="모델 착용 컷 2" loading="lazy">
            <img src="${escapeHTML(gallery[2])}" alt="모델 착용 컷 3" loading="lazy">
          </figure>

          <p>주문 수량에 따라 단가가 달라지므로, 많은 친구들이 함께 참여할수록 더 좋은 퀄리티로 제작됩니다. 마감일 이후 약 2~3주 내에 캠퍼스 내 직수령으로 픽업이 시작됩니다.</p>

          <figure class="story-figure">
            <img src="${escapeHTML(gallery[3])}" alt="모델 착용 컷 4" loading="lazy">
          </figure>

          <p>매 시즌의 한정판답게 수량이 정해져 있고, 제작 후에는 추가 발주가 어렵습니다. 친구들과 함께 참여하면 캠퍼스에서 같은 굿즈로 더 즐거운 추억을 만들 수 있어요.</p>

          <figure class="story-figure story-figure-grid">
            <img src="${escapeHTML(gallery[4])}" alt="모델 착용 컷 5" loading="lazy">
            <img src="${escapeHTML(gallery[5])}" alt="모델 착용 컷 6" loading="lazy">
          </figure>
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

  // 썸네일 클릭 → 메인 사진 교체
  const heroImg = document.getElementById('heroImg');
  const thumbs = document.querySelectorAll('.hero-thumb');
  thumbs.forEach((t) => {
    t.addEventListener('click', () => {
      const src = t.getAttribute('data-src');
      if (src && heroImg) heroImg.setAttribute('src', src);
      thumbs.forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
    });
  });

  // 메인 이미지 높이를 우측 정보 패널(결제하기 버튼까지)의 높이에 동기화 — 데스크톱만
  syncHeroToInfoHeight();
  window.addEventListener('resize', syncHeroToInfoHeight);

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
}

/* main.js 의 App() 가 헤더를 먼저 그린 후에 실행되도록 DOMContentLoaded 사용 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderDetail);
} else {
  renderDetail();
}
