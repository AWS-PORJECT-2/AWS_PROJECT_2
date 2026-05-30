/**
 * 상세(프로젝트) 페이지 — 부록2 "와디즈 클론" 상세 레이아웃 재구축.
 *
 * 화면 구성(와디즈 상세 그대로):
 *   상단 탭(이미지 위): 스토리(active) / 업데이트 / 커뮤니티 / 후기
 *   좌(약 55%): 큰 정사각 이미지 캐러셀(좌/우 화살표 + "1/N", 1장이면 화살표 숨김) + 썸네일 스트립
 *   우(약 45%): 카테고리 랭킹 pill(데이터 없으면 생략) -> 메이커(아바타+이름) -> 제목
 *               -> "NNN% 달성 · N일 남음"(% 보라 굵게) -> "NNN원 달성 · N명 참여"
 *               -> 혜택 박스 -> 공유·찜·응원 행 -> "펀딩하기" 큰 보라 버튼
 *               -> "N명이 응원했어요" 카드 -> 메이커 카드(팔로우 버튼+문의)
 *   하단: "프로젝트 스토리"(contentBlocks) + 펀딩/환불 안내 카드. 우 sticky: 리워드 선택. TOP 플로팅.
 *   모바일(<=767): 1단 + 하단 고정 "펀딩하기" 바.
 *
 * 헤더는 main.js 의 App() 가 #app 에 Header() 를 렌더, 푸터는 renderGlobalFooter() 자동.
 * 보존 로직: /api/groupbuys/:id, backFlow(POST /funds/:id/back), 찜(toggleLike),
 *           팔로우(/users/:id/follow). 응원/지지서명 등 백엔드 없는 기능은 UI만 + "준비 중" 안내.
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

/* ===== 인라인 SVG 아이콘 (stroke=currentColor, 이모지 금지) ===== */
const ICON = {
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
  heartFill: '<svg viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  cheer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.3a2 2 0 002-1.7l1.4-9a2 2 0 00-2-2.3z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  imgPlaceholder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
};

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
  return total.toLocaleString();
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

/* ===== 좋아요 버튼 갱신 (우측 패널 + 모바일 바) ===== */
function updateLikeButton() {
  if (!currentProduct) return;
  const liked = isLiked(currentProduct.id);
  document.querySelectorAll('.dt-iconbtn--like').forEach((btn) => {
    const cntEl = btn.querySelector('.dt-iconbtn__count');
    const icEl = btn.querySelector('.dt-iconbtn__ic');
    if (icEl) icEl.innerHTML = liked ? ICON.heartFill : ICON.heart;
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

/* ===== 응원/지지서명 — 백엔드 없음. UI만, 클릭 시 "준비 중" 안내 ===== */
function handleCheer() {
  alert('응원하기 기능은 준비 중입니다.');
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

/* 펀딩하기 CTA(보라 .dt-btn--primary) — 4단계 분기 (기존 로직 보존) */
function buildActionButtonHtml(blockClass) {
  const block = blockClass ? (' ' + blockClass) : '';
  const paymentState = localStorage.getItem('paid_' + currentProduct.id);
  const rate = getAchievement(currentProduct);
  const isAchieved = rate >= 100;
  if (paymentState === 'pending') {
    return '<button class="dt-btn dt-btn--lg btn-join' + block + '" disabled>입금 확인 중</button>';
  } else if (currentProduct.isPaid || paymentState === '1') {
    return '<button class="dt-btn dt-btn--primary dt-btn--lg btn-join' + block + '" onclick="goToPayment()">결제하기</button>';
  } else if (currentProduct.isReserved && isAchieved) {
    return '<button class="dt-btn dt-btn--primary dt-btn--lg btn-join' + block + '" onclick="goToPayment()">결제하기</button>';
  } else if (currentProduct.isReserved) {
    return '<button class="dt-btn dt-btn--outline dt-btn--lg btn-join' + block + '" onclick="handleCancelReservation()">참여 완료</button>';
  }
  return '<button class="dt-btn dt-btn--primary dt-btn--lg btn-join' + block + '" onclick="handleJoinClick()">펀딩하기</button>';
}

/* ===== 이미지 캐러셀 상태 ===== */
let _galleryImgs = [];
let _galleryIdx = 0;

function buildGalleryHtml(imgs) {
  if (!imgs || imgs.length === 0) {
    return `<div class="dt-gallery__viewport dt-gallery__viewport--empty">
      <div class="dt-gallery__empty-ic">${ICON.imgPlaceholder}</div>
    </div>`;
  }
  const multi = imgs.length > 1;
  const slides = imgs.map((u, i) =>
    `<div class="dt-gallery__slide${i === 0 ? ' is-active' : ''}" data-idx="${i}"><img src="${escapeHTML(u)}" alt="${escapeHTML((currentProduct && currentProduct.title) || '')}"></div>`
  ).join('');
  const arrows = multi
    ? `<button type="button" class="dt-gallery__arrow dt-gallery__arrow--prev" onclick="galleryStep(-1)" aria-label="이전 이미지">${ICON.arrowLeft}</button>
       <button type="button" class="dt-gallery__arrow dt-gallery__arrow--next" onclick="galleryStep(1)" aria-label="다음 이미지">${ICON.arrowRight}</button>`
    : '';
  const counter = multi
    ? `<div class="dt-gallery__counter"><span id="galleryCur">1</span>/${imgs.length}</div>`
    : '';
  const strip = multi
    ? `<div class="dt-gallery__strip">${imgs.map((u, i) =>
        `<button type="button" class="dt-gallery__thumb${i === 0 ? ' is-active' : ''}" data-idx="${i}" onclick="galleryGo(${i})"><img src="${escapeHTML(u)}" alt=""></button>`
      ).join('')}</div>`
    : '';
  return `
    <div class="dt-gallery__viewport">
      <div class="dt-gallery__track" id="galleryTrack">${slides}</div>
      ${arrows}
      ${counter}
    </div>
    ${strip}
  `;
}

function galleryGo(i) {
  if (!_galleryImgs.length) return;
  const n = _galleryImgs.length;
  _galleryIdx = ((i % n) + n) % n;
  document.querySelectorAll('.dt-gallery__slide').forEach((s) => {
    s.classList.toggle('is-active', Number(s.dataset.idx) === _galleryIdx);
  });
  document.querySelectorAll('.dt-gallery__thumb').forEach((t) => {
    t.classList.toggle('is-active', Number(t.dataset.idx) === _galleryIdx);
  });
  const cur = document.getElementById('galleryCur');
  if (cur) cur.textContent = String(_galleryIdx + 1);
}

function galleryStep(delta) {
  galleryGo(_galleryIdx + delta);
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
  const backers = Number(p.currentQuantity) || 0;
  const container = document.getElementById('detailContainer');

  // 남은 기간 텍스트 (와디즈: "N일 남음")
  let remainText;
  if (days === null) remainText = '상시';
  else if (days < 0) remainText = '마감';
  else if (days === 0) remainText = '오늘 마감';
  else remainText = days + '일 남음';

  const paymentTimingText = '펀딩 성공 시 결제';

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

  // 대표 이미지 + 캐러셀 후보(중복 제거)
  _galleryImgs = [];
  [p.imageUrl, p.tryonImageUrl, p.designImageUrl].forEach((u) => {
    if (u && _galleryImgs.indexOf(u) === -1) _galleryImgs.push(u);
  });
  _galleryIdx = 0;

  container.innerHTML = `
    <!-- ===== 이미지 위 탭 (와디즈) ===== -->
    <nav class="dt-toptabs" id="detailTabs" aria-label="프로젝트 탭">
      <button class="dt-toptabs__tab is-active" data-tab="story" onclick="selectTab('story')">스토리</button>
      <button class="dt-toptabs__tab" data-tab="updates" onclick="selectTab('updates')">업데이트</button>
      <button class="dt-toptabs__tab" data-tab="community" onclick="selectTab('community')">커뮤니티</button>
      <button class="dt-toptabs__tab" data-tab="reviews" onclick="selectTab('reviews')">후기</button>
    </nav>

    <!-- ===== 히어로 2단 (좌 캐러셀 / 우 요약·펀딩 패널) ===== -->
    <section class="dt-hero">
      <!-- 좌: 큰 정사각 이미지 캐러셀 + 썸네일 -->
      <div class="dt-gallery" id="detailGallery">
        ${buildGalleryHtml(_galleryImgs)}
      </div>

      <!-- 우: 요약 / 펀딩 -->
      <aside class="dt-summary" id="detailInfo">
        <!-- 카테고리 랭킹 pill (랭킹 데이터 없음 -> 생략) -->
        <span class="dt-summary__rankpill" id="rankPill" style="display:none;"></span>

        <a class="dt-summary__maker" id="creatorTag" href="#">
          <span class="dt-summary__maker-avatar" id="makerAvatar">${ICON.user}</span>
          <span class="dt-summary__maker-name">${escapeHTML(p.author || '익명')}</span>
        </a>

        <h1 class="dt-summary__title">${escapeHTML(p.title)}</h1>

        <!-- NNN% 달성 · N일 남음 (% 보라 굵게) -->
        <p class="dt-summary__rateline">
          <span class="dt-summary__rate">${rate}%</span><span class="dt-summary__rate-suffix"> 달성</span>
          <span class="dt-summary__dot">·</span>
          <span class="dt-summary__remain">${escapeHTML(remainText)}</span>
        </p>

        <div class="dt-summary__progress">
          <div class="dt-progress"><div class="dt-progress__fill${rate >= 100 ? ' dt-progress__fill--over' : ''}" style="width:${Math.min(rate, 100)}%"></div></div>
        </div>

        <!-- NNN원 달성 · N명 참여 -->
        <p class="dt-summary__moneyline">
          <span class="dt-summary__money">${escapeHTML(raised)}원</span> 달성
          <span class="dt-summary__dot">·</span>
          <span class="dt-summary__count">${backers}명</span> 참여
        </p>

        <!-- 혜택 박스 (정적 안내) -->
        <div class="dt-summary__benefit">
          <div class="dt-summary__benefit-item">
            <span class="dt-summary__benefit-ic">${ICON.shield}</span>
            <div>
              <p class="dt-summary__benefit-title">안심 후원</p>
              <p class="dt-summary__benefit-desc">펀딩 성공 시에만 결제돼요. 목표 미달 시 결제되지 않습니다.</p>
            </div>
          </div>
          <div class="dt-summary__benefit-item">
            <span class="dt-summary__benefit-ic">${ICON.card}</span>
            <div>
              <p class="dt-summary__benefit-title">결제 안내</p>
              <p class="dt-summary__benefit-desc">${escapeHTML(paymentTimingText)} · 예상 발송 ${escapeHTML(expectedDeliveryText)}</p>
            </div>
          </div>
        </div>

        <!-- 공유 · 찜 · 응원 -->
        <div class="dt-summary__icons">
          <button class="dt-iconbtn" onclick="handleShare()" aria-label="공유">
            <span class="dt-iconbtn__ic">${ICON.share}</span>
            <span>공유</span>
          </button>
          <button class="dt-iconbtn dt-iconbtn--like" onclick="handleLike()" aria-label="찜" aria-pressed="false">
            <span class="dt-iconbtn__ic">${ICON.heart}</span>
            <span class="dt-iconbtn__count">${Number(p.likeCount) || 0}</span>
          </button>
          <button class="dt-iconbtn" onclick="handleCheer()" aria-label="응원">
            <span class="dt-iconbtn__ic">${ICON.cheer}</span>
            <span>응원</span>
          </button>
        </div>

        <!-- 펀딩하기 큰 보라 버튼 -->
        <div class="dt-summary__cta">${actionBtnHtml.replace('dt-btn--lg', 'dt-btn--block dt-btn--lg')}</div>

        <!-- N명이 응원했어요 카드 (응원 데이터 없음 -> 0명/응원 버튼) -->
        <div class="dt-cheer-card">
          <div class="dt-cheer-card__avatars">
            <span class="dt-cheer-card__avatar">${ICON.user}</span>
            <span class="dt-cheer-card__avatar">${ICON.user}</span>
            <span class="dt-cheer-card__avatar">${ICON.user}</span>
          </div>
          <p class="dt-cheer-card__text"><strong>0명</strong>이 응원했어요</p>
          <button type="button" class="dt-btn dt-btn--outline dt-cheer-card__btn" onclick="handleCheer()">
            <span class="dt-cheer-card__btn-ic">${ICON.cheer}</span>응원하기
          </button>
        </div>

        <!-- 메이커 카드 (팔로우 버튼 + 문의) -->
        <div class="dt-maker-card" id="creatorCard">
          <div class="dt-maker-card__top">
            <span class="dt-maker-card__avatar dt-maker-card__avatar--ghost" id="creatorAvatar">${ICON.user}</span>
            <div class="dt-maker-card__meta">
              <span class="dt-maker-card__label">메이커</span>
              <span class="dt-maker-card__name">${escapeHTML(p.author || '익명')}</span>
            </div>
          </div>
          <div class="dt-maker-card__stats" id="creatorStats" style="display:none;"></div>
          <div class="dt-maker-card__btns">
            <span id="creatorFollowBox" class="dt-maker-card__follow"></span>
            <a class="dt-btn dt-btn--outline dt-maker-card__inquiry" href="/support.html">문의하기</a>
          </div>
        </div>
      </aside>
    </section>

    <!-- ===== 하단 2단 (좌 스토리 / 우 sticky 리워드) ===== -->
    <section class="dt-detail-bottom">
      <div class="dt-detail-content">
        <!-- 탭 패널: 스토리 -->
        <div class="dt-tabsection" id="tabStory">
          <h2 class="dt-section-title">프로젝트 스토리</h2>
          <div class="dt-story" id="storyFlow">
            <p>${escapeHTML(p.description || '')}</p>
          </div>

          <!-- 펀딩 안내 카드 -->
          <div class="dt-info-card">
            <h3 class="dt-info-card__title">펀딩 안내</h3>
            <ul class="dt-info-card__list">
              <li><span class="dt-info-card__k">목표 금액</span><span class="dt-info-card__v">${escapeHTML(goalAmountText)}</span></li>
              <li><span class="dt-info-card__k">펀딩 기간</span><span class="dt-info-card__v">${escapeHTML(remainText)}</span></li>
              <li><span class="dt-info-card__k">결제</span><span class="dt-info-card__v">${escapeHTML(paymentTimingText)}</span></li>
              <li><span class="dt-info-card__k">예상 발송일</span><span class="dt-info-card__v">${escapeHTML(expectedDeliveryText)}</span></li>
            </ul>
          </div>

          <!-- 환불 안내 카드 -->
          <div class="dt-info-card">
            <h3 class="dt-info-card__title">환불 정책</h3>
            <p class="dt-info-card__desc">목표 금액 달성 전에는 언제든지 후원을 취소하고 환불받을 수 있어요. 다만 주문 제작 특성상 <strong>달성률 100% 도달 또는 제작 시작 이후에는 환불·교환이 어렵습니다.</strong> 자세한 내용은 펀딩 전 꼭 확인해 주세요.</p>
          </div>
        </div>

        <!-- 탭 패널: 업데이트/커뮤니티/후기 (기본 숨김, 빈 상태) -->
        <div class="dt-tabsection" id="tabPanelOther" style="display:none;"></div>
      </div>

      <!-- 우 sticky: 선물(리워드) 선택 -->
      <aside class="dt-detail-side">
        <div class="dt-rewards" id="rewardTierBox">
          <p class="dt-rewards__empty">선물 정보를 불러오는 중…</p>
        </div>
      </aside>
    </section>

    <div class="dt-detail-bottom-spacer"></div>
  `;

  // 모바일 하단 고정 바 (펀딩하기)
  const mobileBar = document.getElementById('mobileBar');
  if (mobileBar) {
    mobileBar.innerHTML = `
      <button class="dt-iconbtn dt-iconbtn--like" onclick="handleLike()" aria-label="찜" aria-pressed="false">
        <span class="dt-iconbtn__ic">${ICON.heart}</span>
        <span class="dt-iconbtn__count">${Number(p.likeCount) || 0}</span>
      </button>
      ${buildActionButtonHtml('dt-btn--block')}
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
  _activeTab = 'story';
  document.title = p.title + ' - doothing';

  // 게시글 본문 + 리워드 + 팔로우 — 서버 데이터로 채움
  renderStoryBody(p.id);
}

/* ===== 탭 (이미지 위 탭) ===== */
let _activeTab = 'story';
const TAB_EMPTY = {
  updates: ['아직 등록된 업데이트가 없어요.', '메이커가 새소식을 올리면 여기에 표시됩니다.'],
  community: ['아직 등록된 커뮤니티 글이 없어요.', '서포터들과 나누는 이야기가 여기에 표시됩니다.'],
  reviews: ['아직 등록된 후기가 없어요.', '리워드를 받은 서포터의 후기가 여기에 표시됩니다.'],
};

function selectTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('.dt-toptabs__tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
  const story = document.getElementById('tabStory');
  const other = document.getElementById('tabPanelOther');
  if (!story || !other) return;
  if (tab === 'story') {
    story.style.display = '';
    other.style.display = 'none';
  } else {
    story.style.display = 'none';
    other.style.display = '';
    const msg = TAB_EMPTY[tab] || ['준비 중입니다.', ''];
    other.innerHTML = `<div class="dt-tabpanel__empty">
      <img src="/assets/empty-feed.png" alt="" onerror="this.style.display='none'">
      <p class="dt-tabpanel__empty-title">${escapeHTML(msg[0])}</p>
      <p class="dt-tabpanel__empty-sub">${escapeHTML(msg[1])}</p>
    </div>`;
  }
  // 하단으로 살짝 스크롤 — 탭 전환 맥락 유지
  const bottom = document.querySelector('.dt-detail-bottom');
  if (bottom && tab !== 'story') bottom.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // 팔로워 통계 — 응답에 있을 때만 stats 영역 노출
  const statsBox = document.getElementById('creatorStats');
  if (statsBox && st && typeof st.followerCount === 'number') {
    statsBox.style.display = '';
    statsBox.innerHTML = '';
    const stat = dEl('div', { class: 'dt-maker-card__stat' },
      dEl('span', { class: 'dt-maker-card__stat-value' }, String(st.followerCount || 0)),
      dEl('span', { class: 'dt-maker-card__stat-label' }, '팔로워'),
    );
    statsBox.appendChild(stat);
  }

  function paint() {
    box.innerHTML = '';
    const btn = dEl('button', {
      type: 'button',
      class: 'dt-btn ' + (st.following ? 'dt-btn--outline' : 'dt-btn--primary'),
    }, st.following ? '팔로잉' : '팔로우');
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        st = st.following
          ? await window.api.del('/users/' + encodeURIComponent(creatorId) + '/follow')
          : await window.api.post('/users/' + encodeURIComponent(creatorId) + '/follow', {});
        if (statsBox && st && typeof st.followerCount === 'number') {
          const v = statsBox.querySelector('.dt-maker-card__stat-value');
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
  if (wrap.querySelector('.dt-summary__status')) return;
  const bar = document.createElement('div');
  bar.className = 'dt-summary__status dt-badge ' + m[1];
  bar.textContent = m[0];
  wrap.insertBefore(bar, wrap.firstChild);
}

/* 선물(리워드) 선택 + 펀딩하기 (기존 로직 보존, 마크업만 재배치) */
let _selectedTierId = null;

function renderRewardTiers(tiers) {
  const box = document.getElementById('rewardTierBox');
  if (!box) return;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    box.innerHTML = '<p class="dt-rewards__title">선물 선택</p><p class="dt-rewards__empty">아직 등록된 선물이 없어요.</p>';
    return;
  }

  // 리워드가 있으면 상단 패널의 단순 참여 버튼은 리워드 후원으로 일원화 -> 숨김
  document.querySelectorAll('.dt-summary__cta .btn-join, .dt-mobile-bar .btn-join').forEach((b) => {
    if (/펀딩하기/.test(b.textContent)) b.style.display = 'none';
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
    class: 'dt-btn dt-btn--primary dt-btn--block dt-btn--lg dt-rewards__cta',
  }, '펀딩하기');
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

  const report = dEl('button', { type: 'button', class: 'dt-btn dt-btn--primary dt-btn--block dt-btn--lg' }, '입금자명 제출');
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
        const para = document.createElement('p');
        para.textContent = desc; // textContent — XSS 방어
        flow.appendChild(para);
      } else {
        const empty = document.createElement('div');
        empty.className = 'dt-story__empty';
        empty.innerHTML = '<img src="/assets/empty-feed.png" alt="" onerror="this.style.display=\'none\'"><p>아직 등록된 스토리 내용이 없어요.</p>';
        flow.appendChild(empty);
      }
      return;
    }

    blocks.forEach((b) => {
      if (b.type === 'text') {
        const para = document.createElement('p');
        para.textContent = b.value;
        para.style.whiteSpace = 'pre-wrap';
        flow.appendChild(para);
      } else if (b.type === 'image' && typeof b.value === 'string') {
        const fig = document.createElement('figure');
        fig.className = 'dt-story__figure';
        const img = document.createElement('img');
        img.src = b.value; // 작성자 본인이 올린 이미지
        img.alt = '스토리 이미지';
        img.loading = 'lazy';
        fig.appendChild(img);
        flow.appendChild(fig);
      }
    });
  } catch (e) {
    const desc = currentProduct.description || '';
    flow.innerHTML = '';
    if (desc) {
      const para = document.createElement('p');
      para.textContent = desc;
      flow.appendChild(para);
    } else {
      const empty = document.createElement('div');
      empty.className = 'dt-story__empty';
      empty.innerHTML = '<img src="/assets/empty-feed.png" alt="" onerror="this.style.display=\'none\'"><p>아직 등록된 스토리 내용이 없어요.</p>';
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
