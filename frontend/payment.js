/**
 * 결제 페이지
 * - 간편결제 (토스/카카오/네이버)
 * - 카드 결제 (등록 카드 + 신규 입력)
 * - 무통장 입금 (등록 계좌 + 실시간 입력)
 */

let selectedMethod = 'tosspay';
let selectedQuantity = 1;

/* ===== API 환경 설정 ===== */
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : 'https://api.doothing.app/api';

const PAYMENT_ENDPOINT = API_BASE_URL + '/payments/confirm';

// 백엔드 미구현 시 Mock 모드 (true: fetch 대신 시뮬레이션)
const USE_MOCK_API = true;

// 관리자 입금 계좌 정보
const ADMIN_ACCOUNT = {
  bank: '경남은행',
  number: '29837974',
  holder: '두띵(Doothing)',
};

/* ===== URL 파라미터 (id + size만 수신) ===== */
function getPaymentParams() {
  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get('id')) || 0;
  const size = params.get('size') || 'Free';

  // 보안: title/price는 URL에서 받지 않음. id로 서버/DB에서 직접 조회.
  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS : [];
  const product = products.find((p) => p.id === id);

  return {
    id: id,
    title: product ? product.title : '',
    price: product ? product.price : 0,
    size: size,
    product: product || null,
  };
}

function formatPrice(num) {
  return num.toLocaleString() + '원';
}

/* ===== 결제 수단 선택 ===== */
function selectMethod(method) {
  selectedMethod = method;

  // 버튼 스타일 업데이트
  document.querySelectorAll('.pay-option').forEach((btn) => {
    if (btn.dataset.method === method) {
      btn.style.borderColor = '#2563eb';
      btn.style.background = '#eff6ff';
    } else {
      btn.style.borderColor = '#e5e7eb';
      btn.style.background = '#fff';
    }
  });

  // 폼 토글
  const cardForm = document.getElementById('cardForm');
  const bankForm = document.getElementById('bankForm');
  cardForm.style.display = (method === 'card') ? 'block' : 'none';
  bankForm.style.display = (method === 'bank') ? 'block' : 'none';

  // 버튼 텍스트 업데이트
  updatePayButton();
}

function updatePayButton() {
  const info = getPaymentParams();
  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS : [];
  const product = products.find((p) => p.id === info.id);
  const price = product ? product.price : info.price;
  const btnText = document.getElementById('btnPayText');

  const methodNames = {
    tosspay: '토스페이로',
    kakaopay: '카카오페이로',
    naverpay: '네이버페이로',
    card: '카드로',
    bank: '무통장 입금',
  };

  const label = methodNames[selectedMethod] || '';

  if (selectedMethod === 'bank') {
    if (btnText) btnText.textContent = formatPrice(price * selectedQuantity) + ' 입금 요청하기';
  } else {
    if (btnText) btnText.textContent = formatPrice(price * selectedQuantity) + ' ' + label + ' 결제하기';
  }
}

/* ===== 등록된 카드/계좌 렌더링 ===== */
function renderSavedCards() {
  const container = document.getElementById('savedCards');
  const saved = JSON.parse(localStorage.getItem('saved_cards') || '[]');

  if (saved.length === 0) {
    container.innerHTML = '<p style="font-size:13px;color:#9ca3af;margin-bottom:8px;">등록된 카드가 없습니다. 아래에서 새 카드를 입력하세요.</p>';
    return;
  }

  container.innerHTML = saved.map((card, i) => `
    <label style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:10px;cursor:pointer;margin-bottom:8px;">
      <input type="radio" name="savedCard" value="${i}" style="accent-color:#2563eb;width:16px;height:16px;">
      <span style="font-size:14px;color:#1a1a1a;">**** **** **** ${card.last4}</span>
      <span style="font-size:11px;color:#9ca3af;margin-left:auto;">${card.expiry}</span>
    </label>
  `).join('');
}

function renderSavedAccounts() {
  const container = document.getElementById('savedAccounts');
  const saved = JSON.parse(localStorage.getItem('saved_accounts') || '[]');

  if (saved.length === 0) {
    container.innerHTML = '<p style="font-size:13px;color:#9ca3af;margin-bottom:8px;">등록된 계좌가 없습니다. 아래에서 입금 정보를 입력하세요.</p>';
    return;
  }

  container.innerHTML = saved.map((acc, i) => `
    <label style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:10px;cursor:pointer;margin-bottom:8px;">
      <input type="radio" name="savedAccount" value="${i}" style="accent-color:#2563eb;width:16px;height:16px;">
      <span style="font-size:14px;color:#1a1a1a;">${acc.bankName} · ${acc.depositor}</span>
    </label>
  `).join('');
}

/* ===== 주문 정보 렌더링 ===== */
function renderPaymentPage() {
  const info = getPaymentParams();

  // id 유효성 검사
  if (!info.id) {
    alert('잘못된 접근입니다.');
    history.back();
    return;
  }

  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS : [];
  const product = products.find((p) => p.id === info.id);

  // 상품을 찾지 못한 경우
  if (!product && !info.title) {
    alert('상품 정보를 찾을 수 없습니다.');
    history.back();
    return;
  }

  // 사이즈 라벨
  const sizeLabel = (!info.size || info.size === 'Free') ? '프리사이즈' : '사이즈 ' + info.size;
  const price = product ? product.price : info.price;
  const title = product ? product.title : info.title;

  // 주문 요약 렌더링
  const summary = document.getElementById('orderSummary');
  if (summary && product) {
    summary.innerHTML = `
      <div style="display:flex;gap:14px;align-items:flex-start;">
        <div style="width:88px;height:88px;border-radius:14px;overflow:hidden;flex-shrink:0;border:1px solid #f0f0f0;">
          <img src="${product.imageUrl}" alt="${product.title}" style="width:100%;height:100%;object-fit:cover;">
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:700;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${product.title}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:4px;">${product.department} · ${product.author}</div>
          <div style="display:inline-block;margin-top:8px;padding:4px 10px;background:#f3f4f6;border-radius:6px;font-size:12px;font-weight:600;color:#4b5563;">옵션: ${sizeLabel}</div>
          <div style="font-size:18px;font-weight:800;color:#1a1a1a;margin-top:8px;">${formatPrice(price)}</div>
        </div>
      </div>
    `;
  } else if (summary) {
    summary.innerHTML = `
      <div style="padding:4px 0;">
        <div style="font-size:16px;font-weight:700;color:#1a1a1a;">${title}</div>
        <div style="display:inline-block;margin-top:8px;padding:4px 10px;background:#f3f4f6;border-radius:6px;font-size:12px;font-weight:600;color:#4b5563;">옵션: ${sizeLabel}</div>
        <div style="font-size:18px;font-weight:800;color:#1a1a1a;margin-top:8px;">${formatPrice(price)}</div>
      </div>
    `;
  }

  const itemPriceEl = document.getElementById('itemPrice');
  const totalPriceEl = document.getElementById('totalPrice');
  if (itemPriceEl) itemPriceEl.textContent = formatPrice(price);
  if (totalPriceEl) totalPriceEl.textContent = formatPrice(price);

  document.title = title + ' 결제 - 국민대학교';

  renderSavedCards();
  renderSavedAccounts();
  selectMethod('tosspay');

  // 사이즈 표시
  const sizeEl = document.getElementById('confirmedSize');
  if (sizeEl) {
    const sizeLabel = info.size === 'Free' ? '프리사이즈(Free)' : info.size;
    sizeEl.textContent = sizeLabel;
  }

  // 사이즈 변경 버튼 — 프리사이즈면 숨김
  const changeSizeBtn = document.getElementById('changeSizeBtn');
  const sizeType = (product && product.sizeType) || 'free';
  if (changeSizeBtn && sizeType === 'free') {
    changeSizeBtn.style.display = 'none';
  }

  // 사이즈 변경 패널 초기 하이라이트
  highlightPaySize(info.size);
}

/* ===== 카드번호 자동 포맷 ===== */
function setupCardFormatting() {
  const cardInput = document.getElementById('cardNumber');
  if (cardInput) {
    cardInput.addEventListener('input', () => {
      let v = cardInput.value.replace(/\D/g, '').substring(0, 16);
      cardInput.value = v.replace(/(.{4})/g, '$1-').replace(/-$/, '');
    });
  }
  const expiryInput = document.getElementById('cardExpiry');
  if (expiryInput) {
    expiryInput.addEventListener('input', () => {
      let v = expiryInput.value.replace(/\D/g, '').substring(0, 4);
      if (v.length >= 3) v = v.substring(0, 2) + '/' + v.substring(2);
      expiryInput.value = v;
    });
  }
}

/* ===== 결제 확인 ===== */
function confirmPayment() {
  const info = getPaymentParams();

  // 원본 상품 데이터 검증 (URL 가격 변조 방지)
  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS : [];
  const product = products.find((p) => p.id === info.id);

  if (!product) {
    alert('상품 정보를 불러오지 못했습니다.');
    return;
  }

  // 검증된 원본 가격 사용 (URL 파라미터 무시)
  const verifiedPrice = product.price;

  // 간편결제 시뮬레이션 (토스/카카오/네이버)
  if (['tosspay', 'kakaopay', 'naverpay'].includes(selectedMethod)) {
    const methodLabels = { tosspay: '토스페이', kakaopay: '카카오페이', naverpay: '네이버페이' };
    const label = methodLabels[selectedMethod];
    const proceed = confirm(
      label + '로 ' + formatPrice(verifiedPrice * selectedQuantity) + ' (' + selectedQuantity + '개)을 결제합니다.\n\n' +
      '입금 계좌: ' + ADMIN_ACCOUNT.bank + ' ' + ADMIN_ACCOUNT.number + '\n' +
      '예금주: ' + ADMIN_ACCOUNT.holder + '\n\n' +
      '결제를 진행하시겠습니까?'
    );
    if (!proceed) return;
  }

  // 카드 결제 유효성 검사
  if (selectedMethod === 'card') {
    const savedCard = document.querySelector('input[name="savedCard"]:checked');
    if (!savedCard) {
      const num = document.getElementById('cardNumber').value.replace(/\D/g, '');
      const expiry = document.getElementById('cardExpiry').value;
      const cvc = document.getElementById('cardCvc').value;
      if (num.length < 16 || !expiry || cvc.length < 3) {
        alert('카드 정보를 정확히 입력해 주세요.');
        return;
      }
      const saved = JSON.parse(localStorage.getItem('saved_cards') || '[]');
      saved.push({ last4: num.slice(-4), expiry: expiry });
      localStorage.setItem('saved_cards', JSON.stringify(saved));
    }
  }

  // 무통장 입금 유효성 검사
  if (selectedMethod === 'bank') {
    const savedAcc = document.querySelector('input[name="savedAccount"]:checked');
    if (!savedAcc) {
      const bank = document.getElementById('bankSelect').value;
      const depositor = document.getElementById('depositorName').value.trim();
      if (!bank || !depositor) {
        alert('은행과 입금자명을 입력해 주세요.');
        return;
      }
      const bankNames = { kb: '국민은행', shinhan: '신한은행', woori: '우리은행', hana: '하나은행', nh: '농협은행', kakao: '카카오뱅크', toss: '토스뱅크' };
      const saved = JSON.parse(localStorage.getItem('saved_accounts') || '[]');
      saved.push({ bankName: bankNames[bank] || bank, depositor: depositor });
      localStorage.setItem('saved_accounts', JSON.stringify(saved));
    }
  }

  // 보안: 결제 금액(amount)은 클라이언트에서 전송하지 않습니다.
  // 서버가 productId를 기준으로 DB의 원본 가격을 조회하여 최종 결제를 수행합니다.
  // 클라이언트는 유저가 선택한 "변수"(상품ID, 옵션, 결제수단)만 전달합니다.
  const finalSize = _paySelectedSize || info.size || 'Free';
  const paymentData = {
    productId: info.id,
    method: selectedMethod,
    selectedSize: finalSize,
    selectedQuantity: selectedQuantity,
    requestedAt: new Date().toISOString(),
  };

  // 백엔드 전송 시도
  sendPaymentToServer(paymentData)
    .then((serverResponse) => {
      // Mock 환경: 서버가 DB 가격으로 계산을 완료했다고 가정
      // 실제 환경: serverResponse.amount, serverResponse.status 등을 사용
      const confirmedData = {
        productId: info.id,
        method: selectedMethod,
        amount: verifiedPrice * selectedQuantity, // UI 표시용 (실제로는 서버 응답값 사용)
        selectedSize: finalSize,
        selectedQuantity: selectedQuantity,
        paidAt: new Date().toISOString(),
        status: selectedMethod === 'bank' ? 'pending' : 'paid',
      };
      completePayment(info, confirmedData);
    })
    .catch((error) => {
      console.error('서버 결제 요청 실패:', error);
      alert('결제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    });
}

/* ===== 백엔드 전송 (Mock 모드 지원) ===== */
async function sendPaymentToServer(data) {
  if (USE_MOCK_API) {
    // Mock 모드: 0.5초 후 성공 응답 시뮬레이션
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('[Mock API] 결제 요청 성공:', data);
        resolve({ success: true, orderId: 'MOCK-' + Date.now() });
      }, 500);
    });
  }

  // 실제 백엔드 API 호출
  const response = await fetch(PAYMENT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Server error: ' + response.status);
  return response.json();
}

/* ===== 결제 완료 처리 ===== */
function completePayment(info, paymentData) {
  if (paymentData.status === 'paid') {
    // 즉시 결제 완료
    localStorage.setItem('paid_' + info.id, '1');
    const product = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
      ? MOCK_PRODUCTS.find((p) => p.id === info.id) : null;
    if (product) product.isPaid = true;

    alert('🎉 결제가 완료되었습니다!');
  } else {
    // 무통장 입금 — 결제 대기
    localStorage.setItem('paid_' + info.id, 'pending');
    alert(
      '입금 요청이 완료되었습니다.\n\n' +
      '입금 계좌: ' + ADMIN_ACCOUNT.bank + ' ' + ADMIN_ACCOUNT.number + '\n' +
      '예금주: ' + ADMIN_ACCOUNT.holder + '\n' +
      '입금액: ' + formatPrice(paymentData.amount) + '\n\n' +
      '입금 확인 후 결제가 완료됩니다.'
    );
  }

  // 결제 내역 저장
  const history = JSON.parse(localStorage.getItem('payment_history') || '[]');
  history.push(paymentData);
  localStorage.setItem('payment_history', JSON.stringify(history));

  window.location.href = 'detail.html?id=' + info.id;
}

/* ===== 수량 조절 ===== */
function changeQuantity(delta) {
  const newQty = selectedQuantity + delta;
  if (newQty < 1) return; // 최소 1개
  selectedQuantity = newQty;

  // UI 업데이트
  const display = document.getElementById('quantityDisplay');
  if (display) display.textContent = selectedQuantity;

  // 금액 재계산
  updateTotalPrice();
  updatePayButton();
}

function updateTotalPrice() {
  const info = getPaymentParams();
  const unitPrice = info.price;
  const total = unitPrice * selectedQuantity;

  const itemPriceEl = document.getElementById('itemPrice');
  const totalPriceEl = document.getElementById('totalPrice');
  if (itemPriceEl) itemPriceEl.textContent = formatPrice(unitPrice) + ' × ' + selectedQuantity;
  if (totalPriceEl) totalPriceEl.textContent = formatPrice(total);
}

/* ===== 사이즈 변경 ===== */
let _paySelectedSize = null;

function toggleSizeChange() {
  const panel = document.getElementById('sizeChangePanel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }
}

function changePaySize(size) {
  _paySelectedSize = size;
  const sizeEl = document.getElementById('confirmedSize');
  if (sizeEl) sizeEl.textContent = size;

  // localStorage 업데이트
  const info = getPaymentParams();
  localStorage.setItem('selectedSize_' + info.id, size);

  highlightPaySize(size);

  // 패널 닫기
  const panel = document.getElementById('sizeChangePanel');
  if (panel) panel.style.display = 'none';
}

function highlightPaySize(size) {
  document.querySelectorAll('.pay-size-btn').forEach((btn) => {
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
}

/* ===== 초기화 ===== */
document.addEventListener('DOMContentLoaded', () => {
  renderPaymentPage();
  setupCardFormatting();
});
