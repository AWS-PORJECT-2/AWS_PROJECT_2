/**
 * 결제 페이지
 * - 간편결제 (토스/카카오/네이버) → 토스페이먼츠 SDK 연동
 * - 카드 결제 (등록 카드 + 신규 입력)
 * - 무통장 입금 (등록 계좌 + 실시간 입력)
 */

/* ===== 토스페이먼츠 SDK 초기화 ===== */
const TOSS_CLIENT_KEY = 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';
let tossPayments = null;

function initTossPayments() {
  if (typeof TossPayments === 'undefined') {
    console.warn('토스페이먼츠 SDK가 로드되지 않았습니다.');
    return;
  }
  tossPayments = TossPayments(TOSS_CLIENT_KEY);
}

let selectedMethod = 'tosspay';
let selectedQuantity = 1;

// 과거 버전에서 카드/계좌 정보를 localStorage 에 보관하던 키 정리.
// 한 번 페이지를 로드하면 평문 보관 흔적이 사라진다.
try { localStorage.removeItem('saved_cards'); } catch (e) {}
try { localStorage.removeItem('saved_accounts'); } catch (e) {}

/* ===== API 환경 설정 ===== */
// 프론트엔드와 백엔드는 동일 origin 에서 서비스되므로 location.origin 을 그대로 사용.
const API_BASE_URL = window.location.origin + '/api';

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

/* ===== 등록된 카드/계좌 렌더링 =====
 * 운영 환경에서는 PG SDK 가 발급한 "결제수단 토큰"을 서버에서 받아와 표시한다.
 * 현재는 mock 단계 → 항상 "신규 입력" 안내만 노출.
 */
function renderSavedCards() {
  const container = document.getElementById('savedCards');
  if (!container) return;
  container.textContent = '';
  const p = document.createElement('p');
  p.style.cssText = 'font-size:13px;color:#9ca3af;margin-bottom:8px;';
  p.textContent = '등록된 카드가 없습니다. 아래에서 새 카드를 입력하세요.';
  container.appendChild(p);
}

function renderSavedAccounts() {
  const container = document.getElementById('savedAccounts');
  if (!container) return;
  container.textContent = '';
  const p = document.createElement('p');
  p.style.cssText = 'font-size:13px;color:#9ca3af;margin-bottom:8px;';
  p.textContent = '등록된 계좌가 없습니다. 아래에서 입금 정보를 입력하세요.';
  container.appendChild(p);
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
async function confirmPayment() {
  const info = getPaymentParams();

  // 원본 상품 데이터 검증 (URL 가격 변조 방지)
  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS : [];
  const product = products.find((p) => p.id === info.id);

  if (!product) {
    alert('상품 정보를 불러오지 못했습니다.');
    return;
  }

  // 표시용 가격 — URL 파라미터 변조는 차단되지만, MOCK_PRODUCTS 자체가 클라이언트
  // 데이터라 사용자가 DevTools 로 product.price 를 바꿀 수 있다. 따라서 이 값은
  // "사용자가 본 가격"의 안내·확인 용도로만 쓰고, 실제 결제 금액은 서버가
  // productId 로 DB 의 base_price 를 조회해 다시 계산한다.
  const displayPrice = product.price;

  // 토스페이먼츠 SDK 결제 (토스페이 선택 시)
  // 보안: 금액과 주문 정보는 서버에서 생성. 클라이언트는 상품 선택 정보만 전달.
  if (selectedMethod === 'tosspay') {
    if (!tossPayments) {
      alert('토스페이먼츠 SDK가 로드되지 않았습니다. 페이지를 새로고침해주세요.');
      return;
    }

    try {
      // Step 1: 서버에 주문 사전 생성 요청 (금액은 서버가 DB에서 계산)
      const orderData = await fetch(API_BASE_URL + '/orders/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productId: info.id,
          size: _paySelectedSize || info.size || 'Free',
          quantity: selectedQuantity,
        }),
      }).then(r => {
        if (!r.ok) throw new Error('주문 생성 실패');
        return r.json();
      });

      // Step 2: 서버가 보증한 데이터로 토스 결제창 호출
      const payment = tossPayments.payment({ customerKey: orderData.customerKey });
      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: orderData.amount },
        orderId: orderData.orderId,
        orderName: orderData.orderName,
        successUrl: window.location.origin + '/payment.html?status=success&id=' + info.id + '&orderId=' + encodeURIComponent(orderData.orderId),
        failUrl: window.location.origin + '/payment.html?status=fail&id=' + info.id + '&orderId=' + encodeURIComponent(orderData.orderId),
      });
    } catch (err) {
      if (err.code === 'USER_CANCEL') {
        return;
      }
      console.error('결제 요청 실패:', err);
      alert('결제 요청 중 오류가 발생했습니다: ' + (err.message || ''));
    }
    return;
  }

  // 카드/무통장 결제 (기존 로직)

  // 카드 결제 유효성 검사
  // 보안: 카드번호/만료일/CVC 는 localStorage 에 절대 저장하지 않는다.
  //   - last4 + expiry 만으로도 PCI-DSS 위반 여지 + XSS 한 방이면 다 노출됨
  //   - 운영에서는 PG(토스/이니시스/포트원 등) SDK 가 발급하는 "결제수단 토큰"만
  //     서버에 보관하고, 클라이언트는 토큰 ID 만 들고 있어야 한다.
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
    }
  }

  // 무통장 입금 유효성 검사
  // 은행명/입금자명은 민감도 낮지만 동일한 원칙 적용 — 운영 환경에서는 서버에서 관리.
  if (selectedMethod === 'bank') {
    const savedAcc = document.querySelector('input[name="savedAccount"]:checked');
    if (!savedAcc) {
      const bank = document.getElementById('bankSelect').value;
      const depositor = document.getElementById('depositorName').value.trim();
      if (!bank || !depositor) {
        alert('은행과 입금자명을 입력해 주세요.');
        return;
      }
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
      // amount 는 화면 표시 용도. 운영 환경에서는 serverResponse.amount 를 사용한다.
      const confirmedData = {
        productId: info.id,
        method: selectedMethod,
        amount: (serverResponse && typeof serverResponse.amount === 'number')
          ? serverResponse.amount
          : displayPrice * selectedQuantity,
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

/* ===== 백엔드 전송 (서버 승인 API) ===== */
// ⚠️ 프로덕션 배포 시 USE_MOCK_API는 반드시 false로 설정할 것.
// Mock 모드는 개발/테스트 환경에서만 사용. 실서비스에서 true면 결제 검증이 우회됨.
async function sendPaymentToServer(data) {
  if (USE_MOCK_API && process.env?.NODE_ENV !== 'production') {
    // ⚠️ 개발 환경 전용 Mock. 프로덕션에서는 절대 이 분기를 타면 안 됨.
    return new Promise((resolve) => {
      setTimeout(() => {
        console.warn('[Mock API] 결제 승인 시뮬레이션 — 프로덕션에서는 사용 금지');
        resolve({ success: true, orderId: data.orderId || 'MOCK-' + Date.now(), verified: true });
      }, 500);
    });
  }

  // 실제 서버 승인 API 호출 (토스페이먼츠 서버 승인)
  const response = await fetch(API_BASE_URL + '/payments/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      paymentKey: data.paymentKey,
      orderId: data.orderId,
      amount: data.amount,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || '서버 결제 승인 실패 (HTTP ' + response.status + ')');
  }

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
  const history = (() => { try { const p = JSON.parse(localStorage.getItem('payment_history') || '[]'); return Array.isArray(p) ? p : []; } catch (e) { return []; } })();
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
  // 토스페이먼츠 SDK 초기화
  initTossPayments();

  // 결제 성공/실패 리다이렉트 처리
  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get('status');

  if (paymentStatus === 'success') {
    const productId = urlParams.get('id');
    const paymentKey = urlParams.get('paymentKey');
    const orderId = urlParams.get('orderId');
    const amount = urlParams.get('amount');

    // 서버 승인 API 호출 — 프론트 단독으로 결제 완료 처리하면 안 됨
    (async function() {
      try {
        const serverResult = await sendPaymentToServer({
          paymentKey: paymentKey,
          orderId: orderId,
          amount: Number(amount),
          productId: productId,
        });

        // 서버 승인 성공 시에만 결제 완료 처리
        if (productId) {
          localStorage.setItem('paid_' + productId, '1');
          const product = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
            ? MOCK_PRODUCTS.find((p) => p.id === Number(productId)) : null;
          if (product) product.isPaid = true;
        }

        alert('🎉 결제가 성공적으로 완료되었습니다!');
        window.location.href = 'detail.html?id=' + (productId || '');
      } catch (err) {
        // 서버 승인 실패 — localStorage 건드리지 않음
        console.error('결제 승인 실패:', err);
        alert('결제 승인에 실패했습니다. 다시 시도해 주세요.\n\n' + (err.message || ''));
        // 결제 페이지에 머무르며 실패 상태로 전환
        const cleanUrl = window.location.pathname + '?id=' + (productId || '');
        history.replaceState(null, '', cleanUrl);
        renderPaymentPage();
        setupCardFormatting();
      }
    })();
    return;
  }

  if (paymentStatus === 'fail') {
    const errorCode = urlParams.get('code');
    const errorMessage = urlParams.get('message');
    alert('결제에 실패했습니다.\n\n' + (errorMessage || errorCode || '알 수 없는 오류'));
    // URL에서 status 파라미터 제거
    const cleanUrl = window.location.pathname + '?id=' + (urlParams.get('id') || '');
    history.replaceState(null, '', cleanUrl);
  }

  renderPaymentPage();
  setupCardFormatting();
});
