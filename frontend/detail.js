/**
 * 상세(게시글) 페이지 — 스펙 §3.3 (스크린샷3·4) 재구축.
 *
 * 레이아웃(마크업/스타일만 재배치, 데이터·결제·후원·찜 로직은 보존):
 *   상단 2단: 좌(대표 이미지 정사각 + 썸네일 스트립) / 우(요약·후원 패널)
 *   하단 2단: 좌(탭 + 서브탭 + 스토리) / 우 sticky(창작자 카드 + 리워드)
 *   모바일(<=767): 1단 + 하단 고정 후원 바
 *
 * 헤더는 main.js 의 App() 가 #app 에 Header() 를 렌더, 푸터는 renderGlobalFooter() 자동.
 * 데이터: 기존 /api/groupbuys/:id, /api/users/:id/follow, /api/funds/:id/back 등 그대로 사용.
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

/* DOM 헬퍼 — main.js 의 el() 이 있으면 재사용, 없으면 최소 폴백 */
function dEl(tag, props, ...children) {
  if (typeof el === 'function') return el(tag, props, ...children);
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'onClick') node.addEventListener('click', v);
    else if (k === 'style') node.style.cssText = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/* ===== 결제 상태 (기존 보존) ===== */
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

/* 카테고리 라벨 — categories.js(dtCategory) 우선 */
function categoryLabel(cat) {
  if (!cat) return '기타';
  if (typeof window.dtCategory === 'function') {
    const c = window.dtCategory(cat);
    if (c && c.label) return c.label;
  }
  return cat;
}

/* ===== 좋아요 버튼 (하트/공유 아이콘 두 곳: PC 패널 + 모바일 바) ===== */
const HEART_OUTLINE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';
const HEART_FILLED = '<svg viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';

function updateLikeButton() {
  if (!currentProduct) return;
  const liked = isLiked(currentProduct.id);
  document.querySelectorAll('.dt-iconbtn--like').forEach((btn) => {
    const cntEl = btn.querySelector('.dt-iconbtn__count');
    btn.querySelector('.dt-iconbtn__ic').innerHTML = liked ? HEART_FILLED : HEART_OUTLINE;
    if (cntEl) cntEl.textContent = String(currentProduct.likeCount);
    btn.classList.toggle('liked', liked);
    btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
  });
}

function handleLike() {
  if (!currentProduct) return;
  toggleLike(currentProduct.id);
  updateLikeButton();
}

/* ===== 공유 ===== */
function handleShare() {
  const url = location.href;
  const title = (currentProduct && currentProduct.title) || document.title;
  if (navigator.share) {
    navigator.share({ title, url }).catch(() => {});
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => alert('링크가 복사되었습니다.')).catch(() => {});
  } else {
    alert(url);
  }
}

/* ===== 모달 (포커스 트래핑 포함 — 기존 보존) ===== */
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

/* ===== 공구 참여 흐름 (기존 보존) ===== */
let _selectedSize = null;

function renderSizeSelection() {
  const area = document.getElementById('sizeSelectionArea');
  if (!area || !currentProduct) return;
  const sizeType = currentProduct.sizeType || 'free';

  if (sizeType === 'multiple') {
    const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    area.innerHTML = `
      <p style="font-size:14px;font-weight:600;color:var(--c-text);margin-bottom:10px;">사이즈 선택 <span style="color:var(--c-danger);">*</span></p>
      <div id="sizeSelector" style="display:flex;flex-wrap:wrap;gap:8px;">
        ${sizes.map((s) => `<button type="button" class="size-btn" data-size="${s}" onclick="selectSize('${s}')">${s}</button>`).join('')}
      </div>
      <p id="sizeError" style="display:none;font-size:12px;color:var(--c-danger);margin-top:8px;">사이즈를 선택해 주세요.</p>
    `;
  } else {
    _selectedSize = 'Free';
    area.innerHTML = `
      <div style="padding:12px 16px;background:#F0FDF4;border-radius:10px;display:flex;align-items:center;gap:8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
        <span style="font-size:14px;font-weight:600;color:var(--c-success);">본 제품은 프리사이즈(Free size)입니다</span>
      </div>
    `;
  }
}

function selectSize(size) {
  _selectedSize = size;
  document.querySelectorAll('.size-btn').forEach((btn) => {
    btn.classList.toggle('is-selected', btn.dataset.size === size);
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

/* 단건 펀드(API)를 detail 이 쓰는 product 형태로 매핑 (기존 보존) */
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

/* 최근 본 프로젝트 기록 (기존 보존) */
function saveRecentFund(p) {
  if (!p || p.id == null) return;
  try {
    const KEY = 'recentFunds';
    let list = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(list)) list = [];
    list = list.filter((x) => String(x.id) !== String(p.id));
    list.unshift({ id: p.id, title: p.title || '', imageUrl: p.imageUrl || '' });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12)));
  } catch (_) { /* 무시 */ }
}

/* 액션 버튼(검정 CTA, .dt-btn--dark) HTML — 4단계 분기 (기존 로직 보존) */
function buildActionButtonHtml() {
  const paymentState = localStorage.getItem('paid_' + currentProduct.id);
  const rate = getAchievement(currentProduct);
  const isAchieved = rate >= 100;
  if (paymentState === 'pending') {
    return '<button class="dt-btn dt-btn--lg btn-join" disabled>입금 확인 중</button>';
  } else if (currentProduct.isPaid || paymentState === '1') {
    return '<button class="dt-btn dt-btn--dark dt-btn--lg btn-join" onclick="goToPayment()">결제하기</button>';
  } else if (currentProduct.isReserved && isAchieved) {
    return '<button class="dt-btn dt-btn--dark dt-btn--lg btn-join" onclick="goToPayment()">결제하기</button>';
  } else if (currentProduct.isReserved) {
    return '<button class="dt-btn dt-btn--outline dt-btn--lg btn-join" onclick="handleCancelReservation()">참여 완료</button>';
  }
  return '<button class="dt-btn dt-btn--dark dt-btn--lg btn-join" onclick="handleJoinClick()">후원하기</button>';
}

/* ===== 메인 렌더링 ===== */
async function renderDetail() {
  currentProduct = findProduct(getProductId());
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

  saveRecentFund(currentProduct);
  const p = currentProduct;
  const rate = getAchievement(p);
  const days = daysUntil(p.deadline);
  const raised = calcRaisedAmount(p);
  const container = document.getElementById('detailContainer');

  // 마감 정보
  let deadlineText;
  if (days === null) deadlineText = p.deadline || '미정';
  else if (days < 0) deadlineText = '마감됨';
  else if (days === 0) deadlineText = '오늘 마감';
  else deadlineText = days + '일 남음';

  const remainBadge = (days !== null && days >= 0)
    ? (days === 0 ? '오늘 마감' : days + '일 남음')
    : '마감';

  const paymentTimingText = '펀딩 성공 시';

  // 예상 발송일 — 마감일 + 14일
  let expectedDeliveryText;
  try {
    const dl = new Date(p.deadline);
    if (!isNaN(dl.getTime())) {
      const eta = new Date(dl.getTime() + 14 * 24 * 60 * 60 * 1000);
      expectedDeliveryText = (eta.getMonth() + 1) + '월 ' + eta.getDate() + '일경';
    } else { expectedDeliveryText = '미정'; }
  } catch (_) { expectedDeliveryText = '미정'; }

  // 목표 금액 (단가 × 목표 인원)
  const goalAmount = (Number(p.price) || 0) * (Number(p.targetQuantity) || 0);
  const goalAmountText = goalAmount.toLocaleString() + '원';

  const catLabel = categoryLabel(p.category);
  const actionBtnHtml = buildActionButtonHtml();

  // 대표 이미지 + 썸네일 후보(중복 제거). product 에는 imageUrl 만 있으므로 보통 1장.
  const imgs = [];
  [p.imageUrl, p.tryonImageUrl, p.designImageUrl].forEach((u) => {
    if (u && imgs.indexOf(u) === -1) imgs.push(u);
  });
  const heroSrc = imgs[0] || '';

  const galleryEmptyIc = '<div class="dt-gallery__empty-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg></div>';

  const stripHtml = imgs.length > 1
    ? `<div class="dt-gallery__strip">${imgs.map((u, i) =>
        `<button type="button" class="dt-gallery__thumb${i === 0 ? ' is-active' : ''}" data-src="${escapeHTML(u)}" onclick="selectHeroImage(this)"><img src="${escapeHTML(u)}" alt=""></button>`
      ).join('')}</div>`
    : '';

  container.innerHTML = `
    <!-- ===== 상단 2단 ===== -->
    <section class="dt-detail-top">
      <!-- 좌: 대표 이미지 + 썸네일 -->
      <div class="dt-detail-gallery">
        <div class="dt-gallery__main${heroSrc ? '' : ' dt-gallery__main--empty'}" id="galleryMain">
          ${heroSrc ? `<img src="${escapeHTML(heroSrc)}" alt="${escapeHTML(p.title)}" id="heroImg">` : galleryEmptyIc}
        </div>
        ${stripHtml}
      </div>

      <!-- 우: 후원 요약 -->
      <aside class="dt-detail-summary" id="detailInfo">
        <nav class="dt-sum__breadcrumb" aria-label="카테고리">
          <a href="/feed.html?category=${encodeURIComponent(p.category || 'etc')}">${escapeHTML(catLabel)}</a>
        </nav>

        <a class="dt-sum__creator" id="creatorTag" href="#">
          <span class="dt-badge dt-badge--verified">좋은창작자</span>
          <span class="dt-sum__creator-name">${escapeHTML(p.author || '익명')}</span>
        </a>

        <h1 class="dt-sum__title">${escapeHTML(p.title)}</h1>

        <!-- 모인금액 / 후원자 -->
        <div class="dt-sum__raised">
          <div class="dt-sum__raised-main">
            <span class="dt-sum__raised-label">모인금액</span>
            <span class="dt-sum__raised-value">${escapeHTML(raised)}</span>
          </div>
          <div class="dt-sum__backers">
            <span class="dt-sum__backers-label">후원자</span>
            <span class="dt-sum__backers-value">${Number(p.currentQuantity) || 0}명</span>
          </div>
        </div>

        <div class="dt-sum__progress">
          <div class="dt-progress"><div class="dt-progress__fill${rate >= 100 ? ' dt-progress__fill--over' : ''}" style="width:${Math.min(rate, 100)}%"></div></div>
        </div>

        <!-- 달성률 / 남은기간 / 유형 -->
        <div class="dt-sum__triple">
          <div class="cell"><span class="cell-label">달성률</span><span class="cell-value cell-value--rate">${rate}%</span></div>
          <div class="cell"><span class="cell-label">남은 기간</span><span class="cell-value">${escapeHTML((days !== null && days >= 0) ? (days === 0 ? '오늘' : days + '일') : '마감')}</span></div>
          <div class="cell"><span class="cell-label">유형</span><span class="cell-value">${escapeHTML(catLabel)}</span></div>
        </div>

        <!-- 상세 행 -->
        <div class="dt-sum__rows">
          <div class="dt-sum__row"><span class="dt-sum__row-label">목표 금액</span><span class="dt-sum__row-value">${escapeHTML(goalAmountText)}</span></div>
          <div class="dt-sum__row"><span class="dt-sum__row-label">펀딩 기간</span><span class="dt-sum__row-value"><span class="dt-badge dt-badge--ending">${escapeHTML(remainBadge)}</span></span></div>
          <div class="dt-sum__row"><span class="dt-sum__row-label">결제 안내</span><span class="dt-sum__row-value">${escapeHTML(paymentTimingText)}</span></div>
          <div class="dt-sum__row"><span class="dt-sum__row-label">예상 발송일</span><span class="dt-sum__row-value">${escapeHTML(expectedDeliveryText)}</span></div>
        </div>

        <!-- 하트 · 공유 · 후원하기 -->
        <div class="dt-sum__actions">
          <button class="dt-iconbtn dt-iconbtn--like" onclick="handleLike()" aria-label="좋아요" aria-pressed="false">
            <span class="dt-iconbtn__ic">${HEART_OUTLINE}</span>
            <span class="dt-iconbtn__count">${Number(p.likeCount) || 0}</span>
          </button>
          <button class="dt-iconbtn" onclick="handleShare()" aria-label="공유">
            <span class="dt-iconbtn__ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg></span>
            <span>공유</span>
          </button>
          ${actionBtnHtml}
        </div>
      </aside>
    </section>

    <!-- ===== 하단 2단 ===== -->
    <section class="dt-detail-bottom">
      <!-- 좌: 탭 + 서브탭 + 스토리 -->
      <div class="dt-detail-content">
        <div class="dt-tabs" id="detailTabs">
          <button class="dt-tabs__tab is-active" data-tab="story" onclick="selectTab('story')">프로젝트 계획</button>
          <button class="dt-tabs__tab" data-tab="updates" onclick="selectTab('updates')">업데이트</button>
          <button class="dt-tabs__tab" data-tab="community" onclick="selectTab('community')">커뮤니티</button>
          <button class="dt-tabs__tab" data-tab="reviews" onclick="selectTab('reviews')">후기</button>
        </div>

        <div class="dt-subtabs" id="detailSubtabs">
          <button class="dt-subtabs__pill is-active" data-sub="intro" onclick="selectSubtab('intro')">소개</button>
          <button class="dt-subtabs__pill" data-sub="reward" onclick="selectSubtab('reward')">선물 설명</button>
          <button class="dt-subtabs__pill" data-sub="budget" onclick="selectSubtab('budget')">예산</button>
          <button class="dt-subtabs__pill" data-sub="schedule" onclick="selectSubtab('schedule')">일정</button>
          <button class="dt-subtabs__pill" data-sub="team" onclick="selectSubtab('team')">팀 소개</button>
          <button class="dt-subtabs__pill" data-sub="trust" onclick="selectSubtab('trust')">신뢰와 안전</button>
        </div>

        <!-- 스토리 본문 (story 탭) -->
        <div class="dt-story" id="storyFlow">
          <p>${escapeHTML(p.description || '')}</p>
        </div>

        <!-- 그 외 탭 패널 (기본 숨김) -->
        <div class="dt-tabpanel" id="tabPanelOther" style="display:none;"></div>
      </div>

      <!-- 우 sticky: 창작자 카드 + 리워드 -->
      <aside class="dt-detail-side">
        <div class="dt-creator-card" id="creatorCard">
          <div class="dt-creator-card__top">
            <span class="dt-creator-card__avatar dt-creator-card__avatar--ghost" id="creatorAvatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </span>
            <div class="dt-creator-card__meta">
              <div class="dt-creator-card__badge-row"><span class="dt-badge dt-badge--verified">좋은창작자</span></div>
              <span class="dt-creator-card__name">${escapeHTML(p.author || '익명')}</span>
            </div>
          </div>
          <!-- 통계: API 응답에 있는 항목만(팔로워 등) renderCreatorFollow 가 채움 -->
          <div class="dt-creator-card__stats" id="creatorStats" style="display:none;"></div>
          <div class="dt-creator-card__btns">
            <a class="dt-btn dt-btn--outline" href="/support.html">창작자 문의</a>
            <span id="creatorFollowBox" style="flex:1;display:flex;"></span>
          </div>
        </div>

        <!-- 선물 선택 (리워드) — renderRewardTiers 가 채움 -->
        <div class="dt-rewards" id="rewardTierBox">
          <p class="dt-rewards__empty">선물 정보를 불러오는 중…</p>
        </div>
      </aside>
    </section>

    <div class="dt-detail-bottom-spacer"></div>
  `;

  // 모바일 하단 고정 바
  const mobileBar = document.getElementById('mobileBar');
  if (mobileBar) {
    mobileBar.innerHTML = `
      <button class="dt-iconbtn dt-iconbtn--like" onclick="handleLike()" aria-label="좋아요" aria-pressed="false">
        <span class="dt-iconbtn__ic">${HEART_OUTLINE}</span>
        <span class="dt-iconbtn__count">${Number(p.likeCount) || 0}</span>
      </button>
      ${actionBtnHtml.replace('dt-btn--lg', 'dt-btn--block dt-btn--lg')}
    `;
  }

  // 100% 달성 알림 (참여자 한정, 최초 1회)
  const paymentState = localStorage.getItem('paid_' + p.id);
  if (p.isReserved && rate >= 100 && !p.isPaid && paymentState !== 'pending') {
    const notifiedKey = 'notified_100_' + p.id;
    if (!localStorage.getItem(notifiedKey)) {
      localStorage.setItem(notifiedKey, '1');
      setTimeout(() => alert('축하합니다! 펀딩이 달성되었습니다. 결제를 진행해 주세요!'), 500);
    }
  }

  updateLikeButton();
  document.title = p.title + ' - doothing';

  // 게시글 본문 + 리워드 + 팔로우 — 서버 데이터로 채움
  renderStoryBody(p.id);
}

/* 썸네일 클릭 → 대표 이미지 교체 */
function selectHeroImage(btn) {
  const src = btn.dataset.src;
  const hero = document.getElementById('heroImg');
  if (hero && src) hero.src = src;
  document.querySelectorAll('.dt-gallery__thumb').forEach((t) => t.classList.toggle('is-active', t === btn));
}

/* ===== 탭 / 서브탭 ===== */
let _activeTab = 'story';
const TAB_EMPTY = {
  updates: '아직 등록된 업데이트가 없어요.',
  community: '아직 등록된 커뮤니티 글이 없어요.',
  reviews: '아직 등록된 후기가 없어요.',
};

function selectTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('.dt-tabs__tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
  const story = document.getElementById('storyFlow');
  const subtabs = document.getElementById('detailSubtabs');
  const other = document.getElementById('tabPanelOther');
  if (!story || !other) return;
  if (tab === 'story') {
    story.style.display = '';
    if (subtabs) subtabs.style.display = '';
    other.style.display = 'none';
  } else {
    story.style.display = 'none';
    if (subtabs) subtabs.style.display = 'none';
    other.style.display = '';
    other.innerHTML = '<div class="dt-tabpanel__empty">' + escapeHTML(TAB_EMPTY[tab] || '준비 중입니다.') + '</div>';
  }
}

/* 서브탭 — 스토리 본문 내 해당 섹션으로 스크롤(현재는 활성 표시만; 본문 분절 데이터 없으면 소개 유지) */
function selectSubtab(sub) {
  document.querySelectorAll('.dt-subtabs__pill').forEach((t) => t.classList.toggle('is-active', t.dataset.sub === sub));
  const target = document.querySelector('[data-story-section="' + sub + '"]');
  if (target && typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* 창작자 팔로우 버튼 + 팔로워 수 (응답에 있는 통계만 표시) */
async function renderCreatorFollow(creatorId) {
  const box = document.getElementById('creatorFollowBox');
  const tag = document.getElementById('creatorTag');
  if (tag && creatorId) tag.setAttribute('href', '/profile.html?id=' + encodeURIComponent(creatorId));
  if (!box || !window.api) return;
  let st;
  try { st = await window.api.get('/users/' + encodeURIComponent(creatorId) + '/follow', { silentAuthFail: true }); }
  catch (e) { return; }

  // 팔로워 통계 — 응답에 있을 때만 stats 영역 노출 (만족도/누적후원자/누적후원액은 응답에 없으므로 숨김)
  const statsBox = document.getElementById('creatorStats');
  if (statsBox && st && typeof st.followerCount === 'number') {
    statsBox.style.display = '';
    statsBox.innerHTML = '';
    const stat = dEl('div', { class: 'dt-creator-card__stat' },
      dEl('span', { class: 'dt-creator-card__stat-value' }, String(st.followerCount || 0)),
      dEl('span', { class: 'dt-creator-card__stat-label' }, '팔로워'),
    );
    statsBox.appendChild(stat);
  }

  function paint() {
    box.innerHTML = '';
    const btn = dEl('button', {
      type: 'button',
      class: 'dt-btn ' + (st.following ? 'dt-btn--outline' : 'dt-btn--primary'),
      style: 'flex:1;height:42px;',
    }, st.following ? '팔로잉' : '팔로우');
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        st = st.following
          ? await window.api.del('/users/' + encodeURIComponent(creatorId) + '/follow')
          : await window.api.post('/users/' + encodeURIComponent(creatorId) + '/follow', {});
        // 통계 갱신
        if (statsBox && st && typeof st.followerCount === 'number') {
          const v = statsBox.querySelector('.dt-creator-card__stat-value');
          if (v) v.textContent = String(st.followerCount || 0);
        }
        paint();
      } catch (e2) {
        if (e2 && e2.status === 401) return;
        btn.disabled = false;
        alert('처리 실패: ' + ((e2 && e2.message) || ''));
      }
    });
    box.appendChild(btn);
  }
  paint();
}

/* 펀드 상태 배지 — open 이외(심사중/반려 등)일 때 제목 위에 표시 */
function renderFundStatusBadge(status) {
  const wrap = document.getElementById('detailInfo');
  if (!wrap || !status || status === 'open') return;
  const MAP = {
    pending: ['심사 중 — 관리자 승인 후 공개됩니다', 'dt-badge--ending'],
    rejected: ['반려된 펀드입니다', 'dt-badge--proxy'],
    achieved: ['목표 달성', 'dt-badge--success'],
    completed: ['종료된 펀드', 'dt-badge--proxy'],
    failed: ['무산된 펀드', 'dt-badge--proxy'],
    cancelled: ['취소된 펀드', 'dt-badge--proxy'],
  };
  const m = MAP[status]; if (!m) return;
  if (wrap.querySelector('.dt-sum__status')) return;
  const bar = document.createElement('div');
  bar.className = 'dt-sum__status dt-badge ' + m[1];
  bar.style.cssText = 'align-self:flex-start;';
  bar.textContent = m[0];
  // breadcrumb 다음(2번째) 위치에 삽입
  const bc = wrap.querySelector('.dt-sum__breadcrumb');
  if (bc && bc.nextSibling) wrap.insertBefore(bar, bc.nextSibling);
  else wrap.insertBefore(bar, wrap.firstChild);
}

/* 선물(리워드) 선택 + 후원하기 (기존 로직 보존, 마크업만 재배치) */
let _selectedTierId = null;

function renderRewardTiers(tiers) {
  const box = document.getElementById('rewardTierBox');
  if (!box) return;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    box.innerHTML = '<p class="dt-rewards__title">선물 선택</p><p class="dt-rewards__empty">아직 등록된 선물이 없어요.</p>';
    return;
  }

  // 리워드가 있으면 상단 패널의 단순 참여 버튼은 리워드 후원으로 일원화 → 숨김
  document.querySelectorAll('.dt-sum__actions .btn-join, .dt-mobile-bar .btn-join').forEach((b) => {
    if (b.textContent.indexOf('후원') !== -1 || b.textContent.indexOf('참여') !== -1) {
      // 후원하기/참여 버튼만 숨기고 결제하기/입금확인중은 유지
      if (/후원하기/.test(b.textContent)) b.style.display = 'none';
    }
  });

  box.innerHTML = '';
  box.appendChild(dEl('p', { class: 'dt-rewards__title' }, '선물 선택'));

  tiers.forEach((t) => {
    const remain = (t.stockLimit == null) ? null : Math.max(0, t.stockLimit - (t.soldCount || 0));
    const soldOut = remain === 0;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'dt-reward';
    card.dataset.tierId = t.id;
    card.disabled = soldOut;

    const price = dEl('div', { class: 'dt-reward__price' }, (Number(t.price) || 0).toLocaleString('ko-KR') + '원 +');
    const title = dEl('div', { class: 'dt-reward__title' }, t.title || '');
    card.appendChild(price);
    card.appendChild(title);
    if (t.description) card.appendChild(dEl('div', { class: 'dt-reward__desc' }, t.description));
    if (remain != null) {
      card.appendChild(dEl('div', { class: 'dt-reward__stock' + (soldOut ? ' dt-reward__stock--out' : '') }, soldOut ? '품절' : (remain + '개 남음')));
    }
    if (!soldOut) {
      card.addEventListener('click', function () {
        _selectedTierId = t.id;
        box.querySelectorAll('.dt-reward').forEach((b) => b.classList.toggle('is-selected', b.dataset.tierId === _selectedTierId));
      });
    }
    box.appendChild(card);
  });

  const backBtn = dEl('button', {
    type: 'button',
    class: 'dt-btn dt-btn--dark dt-btn--block dt-btn--lg dt-rewards__cta',
  }, '후원하기');
  backBtn.addEventListener('click', function () { backFlow(currentProduct.id); });
  box.appendChild(backBtn);
}

/* 후원 플로우 (기존 보존) */
async function backFlow(fundId) {
  if (!_selectedTierId) { alert('후원할 선물을 선택해 주세요.'); return; }
  let addrs;
  try {
    const r = await window.api.get('/addresses');
    addrs = Array.isArray(r) ? r : (r && r.items) || [];
  } catch (e) {
    if (e && e.status === 401) return;
    alert('배송지 조회 실패'); return;
  }
  if (!addrs.length) {
    if (confirm('후원하려면 배송지가 필요합니다. 배송지를 등록하시겠어요?')) {
      window.location.href = '/addresses.html';
    }
    return;
  }
  const def = addrs.find(function (a) { return a.isDefault; }) || addrs[0];
  const addrLabel = (def.label || '') + ' · ' + (def.recipientName || '') + ' · ' + (def.roadAddress || '');
  if (!confirm('아래 배송지로 후원을 진행할까요?\n\n' + addrLabel + '\n\n(다른 배송지는 설정 > 배송지에서 변경)')) return;

  try {
    const res = await window.api.post('/funds/' + encodeURIComponent(fundId) + '/back', {
      rewardTierId: _selectedTierId,
      addressId: def.id,
    });
    showDepositInfo(res);
  } catch (e) {
    if (e && e.status === 401) return;
    alert('후원 신청 실패: ' + ((e && e.message) || '알 수 없는 오류'));
  }
}

/* 입금 안내 + 입금자명 보고 UI (기존 보존, 마크업 클래스만 토큰화) */
function showDepositInfo(res) {
  const box = document.getElementById('rewardTierBox');
  if (!box) return;
  const dep = res.deposit || {};
  box.innerHTML = '';
  const wrap = dEl('div', { class: 'dt-deposit' });
  wrap.appendChild(dEl('div', { class: 'dt-deposit__title' }, '입금 안내'));
  [['입금 금액', (Number(res.amount) || 0).toLocaleString('ko-KR') + '원'],
   ['은행', dep.bank || '-'],
   ['계좌번호', dep.account || '-'],
   ['예금주', dep.holder || '-']].forEach(function (row) {
    const r = dEl('div', { class: 'dt-deposit__row' },
      dEl('span', { class: 'k' }, row[0]),
      dEl('span', { class: 'v' }, row[1]),
    );
    wrap.appendChild(r);
  });
  wrap.appendChild(dEl('p', { class: 'dt-deposit__note' },
    '위 계좌로 입금 후 입금자명을 입력해 주세요. 관리자가 입금자명·금액을 대조하여 확인하면 후원이 확정됩니다.'));

  const input = dEl('input', { type: 'text', placeholder: '입금자명', class: 'dt-deposit__input' });
  wrap.appendChild(input);

  const report = dEl('button', { type: 'button', class: 'dt-btn dt-btn--dark dt-btn--block dt-btn--lg' }, '입금자명 제출');
  report.addEventListener('click', async function () {
    var name = input.value.trim();
    if (!name) { alert('입금자명을 입력해 주세요.'); return; }
    try {
      await window.api.post('/me/backings/' + encodeURIComponent(res.orderId) + '/report', { depositorName: name });
      wrap.innerHTML = '<div class="dt-deposit__done">입금자명이 제출되었습니다. 관리자 확인 후 후원이 확정됩니다.</div>';
    } catch (e) {
      alert('제출 실패: ' + ((e && e.message) || ''));
    }
  });
  wrap.appendChild(report);
  box.appendChild(wrap);
  box.scrollIntoView({ behavior: 'smooth' });
}

/* 게시글 본문 렌더 (기존 보존, 클래스만 dt-story 로) */
async function renderStoryBody(id) {
  const flow = document.getElementById('storyFlow');
  if (!flow || !window.api) return;
  try {
    const fund = await window.api.get('/groupbuys/' + encodeURIComponent(id), { silentAuthFail: true });
    renderFundStatusBadge(fund && fund.status);
    if (fund && fund.creatorId) renderCreatorFollow(fund.creatorId);
    renderRewardTiers(fund && fund.rewardTiers);
    const blocks = fund && Array.isArray(fund.contentBlocks) ? fund.contentBlocks : [];
    const desc = (fund && fund.description) || currentProduct.description || '';

    flow.innerHTML = '';
    if (blocks.length === 0) {
      if (desc) {
        const p = document.createElement('p');
        p.textContent = desc; // textContent — XSS 방어
        flow.appendChild(p);
      } else {
        const empty = document.createElement('div');
        empty.className = 'dt-story__empty';
        empty.innerHTML = '<img src="/assets/empty-feed.png" alt="" onerror="this.style.display=\'none\'"><p>아직 등록된 소개 내용이 없어요.</p>';
        flow.appendChild(empty);
      }
      return;
    }

    blocks.forEach((b) => {
      if (b.type === 'text') {
        const p = document.createElement('p');
        p.textContent = b.value;
        p.style.whiteSpace = 'pre-wrap';
        flow.appendChild(p);
      } else if (b.type === 'image' && typeof b.value === 'string') {
        const fig = document.createElement('figure');
        fig.className = 'dt-story__figure';
        const img = document.createElement('img');
        img.src = b.value; // 작성자 본인이 올린 이미지
        img.alt = '게시글 이미지';
        img.loading = 'lazy';
        fig.appendChild(img);
        flow.appendChild(fig);
      }
    });
  } catch (e) {
    const desc = currentProduct.description || '';
    flow.innerHTML = '';
    if (desc) {
      const p = document.createElement('p');
      p.textContent = desc;
      flow.appendChild(p);
    } else {
      const empty = document.createElement('div');
      empty.className = 'dt-story__empty';
      empty.innerHTML = '<img src="/assets/empty-feed.png" alt="" onerror="this.style.display=\'none\'"><p>아직 등록된 소개 내용이 없어요.</p>';
      flow.appendChild(empty);
    }
  }
}

/* TOP 플로팅 버튼 */
function initTopButton() {
  const btn = document.getElementById('topBtn');
  if (!btn) return;
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  const onScroll = () => btn.classList.toggle('is-visible', window.scrollY > 400);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* main.js 의 App() 가 헤더를 먼저 그린 후에 실행 (기존 보존) */
function renderDetailWhenReady() {
  let rendered = false;
  function doRender() {
    if (rendered) return;
    rendered = true;
    renderDetail();
  }
  window.addEventListener('mockproducts:updated', doRender, { once: true });
  setTimeout(doRender, 1200);
  if (typeof MOCK_PRODUCTS !== 'undefined' && MOCK_PRODUCTS.length > 0 && findProduct(getProductId())) {
    doRender();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { renderDetailWhenReady(); initTopButton(); });
} else {
  renderDetailWhenReady();
  initTopButton();
}
