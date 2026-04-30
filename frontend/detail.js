/**
 * 상품 상세 페이지
 * - 좋아요 토글
 * - 달성률 실시간 계산
 * - 공구 참여 → 예약 확정 → 정책 안내 흐름
 */

let currentProduct = null;

/* ===== 스마트 뒤로가기 (Fallback 포함) ===== */
document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.querySelector('.back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (document.referrer && history.length > 1) {
        history.back();
      } else {
        location.href = 'feed.html';
      }
    });
  }
});

function getProductId() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get('id')) || 1;
}

function findProduct(id) {
  return MOCK_PRODUCTS.find((p) => p.id === id) || MOCK_PRODUCTS[0];
}

/* ===== 달성률 계산 ===== */
function getAchievement(product) {
  return calcAchievementRate(product);
}

/* ===== 좋아요 버튼 업데이트 ===== */
function updateLikeButton() {
  const btn = document.getElementById('btnWish');
  if (!btn || !currentProduct) return;
  const liked = isLiked(currentProduct.id);
  const heartSvg = liked
    ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>'
    : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';
  btn.innerHTML = heartSvg + '<span>' + currentProduct.likeCount + '</span>';
  btn.classList.toggle('liked', liked);
}

/* ===== 좋아요 클릭 핸들러 ===== */
function handleLike() {
  if (!currentProduct) return;
  toggleLike(currentProduct.id);
  updateLikeButton();
}

/* ===== 모달 관리 (접근성 포커스 트래핑 포함) ===== */
let _previousFocus = null;
let _currentModalId = null;
let _escHandler = null;
let _trapHandler = null;

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function showModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  // 1. 현재 포커스 저장
  _previousFocus = document.activeElement;
  _currentModalId = id;

  // 2. 배경 콘텐츠 비활성화
  const mainContent = document.querySelector('.detail-main');
  const bottomBar = document.getElementById('detailBottomBar');
  const bottomNav = document.querySelector('.bottom-nav');
  if (mainContent) mainContent.setAttribute('aria-hidden', 'true');
  if (bottomBar) bottomBar.setAttribute('aria-hidden', 'true');
  if (bottomNav) bottomNav.setAttribute('aria-hidden', 'true');

  // 3. 모달 표시
  modal.classList.add('active');

  // 4. 첫 번째 포커스 가능 요소로 이동
  requestAnimationFrame(() => {
    const focusable = modal.querySelectorAll(FOCUSABLE_SELECTOR);
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  });

  // 5. ESC 키 핸들러
  _escHandler = function (e) {
    if (e.key === 'Escape') {
      hideModal(id);
    }
  };
  document.addEventListener('keydown', _escHandler);

  // 6. 포커스 트래핑 핸들러
  _trapHandler = function (e) {
    if (e.key !== 'Tab') return;
    const focusable = modal.querySelectorAll(FOCUSABLE_SELECTOR);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: 첫 요소에서 뒤로 가면 마지막으로
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: 마지막 요소에서 앞으로 가면 첫 번째로
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', _trapHandler);
}

function hideModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  // 1. 모달 숨기기
  modal.classList.remove('active');

  // 2. 배경 콘텐츠 복구
  const mainContent = document.querySelector('.detail-main');
  const bottomBar = document.getElementById('detailBottomBar');
  const bottomNav = document.querySelector('.bottom-nav');
  if (mainContent) mainContent.removeAttribute('aria-hidden');
  if (bottomBar) bottomBar.removeAttribute('aria-hidden');
  if (bottomNav) bottomNav.removeAttribute('aria-hidden');

  // 3. 이벤트 리스너 해제
  if (_escHandler) {
    document.removeEventListener('keydown', _escHandler);
    _escHandler = null;
  }
  if (_trapHandler) {
    document.removeEventListener('keydown', _trapHandler);
    _trapHandler = null;
  }

  // 4. 포커스 복원
  if (_previousFocus && typeof _previousFocus.focus === 'function') {
    _previousFocus.focus();
  }
  _previousFocus = null;
  _currentModalId = null;
}

/* ===== 공구 참여 흐름 ===== */
let _selectedSize = null;

// 사이즈 선택 영역 렌더링 (sizeType에 따라 분기)
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
    // 프리사이즈
    _selectedSize = 'Free';
    area.innerHTML = `
      <div style="padding:12px 16px;background:#f0fdf4;border-radius:10px;display:flex;align-items:center;gap:8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
        <span style="font-size:14px;font-weight:600;color:#16a34a;">본 제품은 프리사이즈(Free size)입니다</span>
      </div>
    `;
  }
}

// 사이즈 선택
function selectSize(size) {
  _selectedSize = size;
  document.querySelectorAll('.size-btn').forEach((btn) => {
    if (btn.dataset.size === size) {
      btn.style.borderColor = '#2563eb';
      btn.style.background = '#eff6ff';
      btn.style.color = '#2563eb';
    } else {
      btn.style.borderColor = '#e5e7eb';
      btn.style.background = '#fff';
      btn.style.color = '#4b5563';
    }
  });
  const err = document.getElementById('sizeError');
  if (err) err.style.display = 'none';
}

// 1단계: 참여하기 버튼 → 예약 확정 팝업
function handleJoinClick() {
  if (currentProduct.isReserved) {
    alert('이미 참여한 공구입니다.');
    return;
  }
  _selectedSize = null;
  showModal('modalReservation');
  // 모달이 열린 후 사이즈 선택 영역 렌더링
  requestAnimationFrame(() => renderSizeSelection());
}

// 2단계: 예약 확정 → 사이즈 유효성 검사 → 정책 안내
function handleReservationConfirm() {
  const sizeType = (currentProduct && currentProduct.sizeType) || 'free';

  // multiple 타입인데 사이즈 미선택 시 차단
  if (sizeType === 'multiple' && !_selectedSize) {
    const err = document.getElementById('sizeError');
    if (err) err.style.display = 'block';
    return;
  }

  // 프리사이즈면 자동 설정
  if (sizeType === 'free') {
    _selectedSize = 'Free';
  }

  const savedFocus = _previousFocus;
  hideModal('modalReservation');
  renderPolicyModal();
  showModal('modalPolicy');
  _previousFocus = savedFocus;
}

// 정책 안내 모달 내용 렌더링 (달성률 조건부)
function renderPolicyModal() {
  const rate = getAchievement(currentProduct);
  const policyBody = document.getElementById('policyBody');

  let refundMsg = '';
  if (rate < 100) {
    refundMsg = '<div class="policy-refund-ok">현재 환불이 가능합니다.</div>';
  } else {
    refundMsg = '<div class="policy-refund-no">현재 달성률 100% 이상으로 환불이 불가합니다.</div>';
  }

  policyBody.innerHTML = `
    ${refundMsg}
    <div class="policy-notice">
      <p>주문 제작 시스템 특성상 <strong>100% 달성 이후 혹은 제작 시작 시 환불 및 교환이 어렵습니다.</strong></p>
    </div>
    <div class="policy-detail">
      <p>현재 달성률: <strong>${rate}%</strong> (${currentProduct.currentQuantity}/${currentProduct.targetQuantity}명)</p>
      <p>마감일: ${currentProduct.deadline}</p>
    </div>
  `;
}

// 정책 동의 후 참여 완료
function handlePolicyAgree() {
  if (currentProduct.isReserved) {
    alert('이미 참여한 공구입니다.');
    hideModal('modalPolicy');
    return;
  }
  hideModal('modalPolicy');
  // 예약 상태 저장 + 사이즈 저장
  setReserved(currentProduct.id, true);
  if (_selectedSize) {
    localStorage.setItem('selectedSize_' + currentProduct.id, _selectedSize);
  }
  renderDetail();
  alert('공구 참여가 완료되었습니다! (사이즈: ' + _selectedSize + ')');
}

/* ===== 메인 렌더링 ===== */
function renderDetail() {
  currentProduct = findProduct(getProductId());
  const rate = getAchievement(currentProduct);
  const container = document.getElementById('detailContainer');

  container.innerHTML = `
    <div class="detail-image">
      <img src="${currentProduct.imageUrl}" alt="${currentProduct.title}">
    </div>
    <div class="detail-author">
      <img src="${currentProduct.authorAvatar}" alt="${currentProduct.author}" class="author-avatar">
      <div class="author-info">
        <span class="author-name">${currentProduct.author}</span>
        <span class="author-dept">${currentProduct.department}</span>
      </div>
    </div>
    <div class="detail-body">
      <h2 class="detail-title">${currentProduct.title}</h2>
      <p class="detail-price">${currentProduct.priceText}</p>
      <div class="detail-achievement">
        <div class="achievement-bar">
          <div class="achievement-fill" style="width: ${Math.min(rate, 100)}%"></div>
        </div>
        <div class="achievement-info">
          <span class="achievement-rate">${rate}% 달성</span>
          <span class="achievement-count">${currentProduct.currentQuantity}/${currentProduct.targetQuantity}명 참여</span>
        </div>
      </div>
      <p class="detail-deadline">마감일: ${currentProduct.deadline}</p>
      <div class="detail-description">
        <h3>상품 설명</h3>
        <p>${currentProduct.description}</p>
      </div>
    </div>
  `;

  // 하단 액션바 — 조건부 렌더링
  const bottomBar = document.getElementById('detailBottomBar');
  const isAchieved = rate >= 100;

  if (currentProduct.isPaid) {
    // 결제 완료 상태
    bottomBar.innerHTML = `
      <button class="btn-wish" id="btnWish" onclick="handleLike()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        <span>${currentProduct.likeCount}</span>
      </button>
      <button class="btn-join" style="background:#16a34a;cursor:default;" disabled>결제 완료</button>
    `;
  } else if (currentProduct.isReserved && isAchieved) {
    // 참여 완료 + 달성률 100% → 결제 버튼
    bottomBar.innerHTML = `
      <button class="btn-wish" id="btnWish" onclick="handleLike()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        <span>${currentProduct.likeCount}</span>
      </button>
      <button class="btn-join" style="background:#f97316;" onclick="goToPayment()">결제하기</button>
    `;
  } else {
    // 기본: 공구 참여하기
    bottomBar.innerHTML = `
      <button class="btn-wish" id="btnWish" onclick="handleLike()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        <span>${currentProduct.likeCount}</span>
      </button>
      <button class="btn-join" onclick="handleJoinClick()">공구 참여하기</button>
    `;
  }

  // 달성률 100% 알림 (참여자에게 최초 1회)
  if (currentProduct.isReserved && isAchieved && !currentProduct.isPaid) {
    const notifiedKey = 'notified_100_' + currentProduct.id;
    if (!localStorage.getItem(notifiedKey)) {
      localStorage.setItem(notifiedKey, '1');
      setTimeout(() => {
        alert('🎉 축하합니다! 펀딩이 달성되었습니다. 결제를 진행해 주세요!');
      }, 500);
    }
  }

  updateLikeButton();
  document.title = currentProduct.title + ' - 국민대학교 공구';
}

/* ===== 결제 페이지 이동 ===== */
function goToPayment() {
  if (!currentProduct) return;
  const size = localStorage.getItem('selectedSize_' + currentProduct.id) || '';
  const params = new URLSearchParams({
    id: currentProduct.id,
    title: currentProduct.title,
    price: currentProduct.price,
    size: size,
  });
  window.location.href = 'payment.html?' + params.toString();
}

renderDetail();
