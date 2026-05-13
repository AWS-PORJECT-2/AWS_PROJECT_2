/**
 * 결제 페이지
 *  Step 1) 주문 정보 + 배송지 선택 → 주문 생성 (PENDING)
 *  Step 2) 토스 송금 안내 + 입금자명 입력 → POST /:orderId/report (WAITING_FOR_CONFIRM)
 *
 * 사진 업로드 없음. 입금자명만으로 처리.
 *
 * URL 파라미터: ?id=<productId>&size=<size>
 *   mock-data.js 의 MOCK_PRODUCTS 에서 가격/이름 추출.
 */

/* === 토스 송금 링크 (변수화 — 추후 실제 링크로 교체) === */
const TOSS_PAY_URL = 'https://toss.me/kmu_doothing';

let _selectedAddressId = null;
let _addresses = [];
let _orderItems = [];
let _totalPrice = 0;
let _createdOrder = null;

/* ===== URL 파라미터에서 상품 정보 추출 ===== */
function parseProduct() {
  const params = new URLSearchParams(location.search);
  const id = Number(params.get('id'));
  const size = params.get('size') || 'Free';
  if (!id) return null;
  if (typeof MOCK_PRODUCTS === 'undefined') {
    return { id, title: '상품 #' + id, size, price: 1, quantity: 1 };
  }
  const product = MOCK_PRODUCTS.find((p) => p.id === id);
  if (!product) return null;
  const price = parseInt(String(product.priceText || '').replace(/[^0-9]/g, ''), 10) || (product.price || 1);
  return {
    id: product.id,
    title: product.title,
    size,
    price,
    quantity: 1,
  };
}

/* ===== Step 1: 주문 정보 + 배송지 선택 ===== */
function renderSelectStep() {
  const root = document.getElementById('content');
  root.textContent = '';

  // Step indicator
  const step = document.createElement('div');
  step.className = 'step';
  const num = document.createElement('span'); num.className = 'num'; num.textContent = '1';
  step.appendChild(num);
  step.appendChild(document.createTextNode(' 주문 정보 확인 및 배송지 선택'));
  root.appendChild(step);

  // 주문 요약
  const summary = document.createElement('div');
  summary.className = 'panel';
  const sumTitle = document.createElement('div');
  sumTitle.className = 'panel-title';
  sumTitle.textContent = '주문 상품';
  summary.appendChild(sumTitle);

  _orderItems.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const left = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = item.productName;
    const meta = document.createElement('div');
    meta.className = 'item-meta';
    meta.textContent = (item.size || 'Free') + ' / ' + item.quantity + '개';
    left.appendChild(name);
    left.appendChild(meta);
    const price = document.createElement('div');
    price.className = 'item-price';
    price.textContent = formatPrice(item.price * item.quantity);
    row.appendChild(left);
    row.appendChild(price);
    summary.appendChild(row);
  });

  const total = document.createElement('div');
  total.className = 'total-row';
  const tl = document.createElement('div'); tl.className = 'total-label'; tl.textContent = '총 결제 금액';
  const ta = document.createElement('div'); ta.className = 'total-amount'; ta.textContent = formatPrice(_totalPrice);
  total.appendChild(tl); total.appendChild(ta);
  summary.appendChild(total);
  root.appendChild(summary);

  // 배송지 선택
  const addrPanel = document.createElement('div');
  addrPanel.className = 'panel';
  const aTitle = document.createElement('div');
  aTitle.className = 'panel-title';
  aTitle.textContent = '배송지 선택';
  addrPanel.appendChild(aTitle);

  if (_addresses.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-addr';
    empty.textContent = '등록된 배송지가 없습니다. 배송지를 먼저 등록해주세요.';
    addrPanel.appendChild(empty);
    const link = document.createElement('a');
    link.className = 'add-addr-link';
    link.href = '/addresses.html';
    link.textContent = '+ 배송지 관리 페이지로 이동';
    addrPanel.appendChild(link);
  } else {
    _addresses.forEach((addr) => {
      const opt = document.createElement('div');
      opt.className = 'addr-option' + (addr.id === _selectedAddressId ? ' selected' : '');
      opt.addEventListener('click', () => {
        _selectedAddressId = addr.id;
        renderSelectStep();
      });

      const labelLine = document.createElement('div');
      labelLine.className = 'label-line';
      const labelText = document.createElement('span');
      labelText.textContent = addr.label;
      labelLine.appendChild(labelText);
      if (addr.isDefault) {
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = '기본';
        labelLine.appendChild(b);
      }

      const recipient = document.createElement('div');
      recipient.className = 'addr-text';
      recipient.textContent = addr.recipientName + ' · ' + addr.recipientPhone;

      const addrText = document.createElement('div');
      addrText.className = 'addr-text';
      addrText.textContent = '(' + addr.postalCode + ') ' + addr.roadAddress + (addr.detailAddress ? ' ' + addr.detailAddress : '');

      opt.appendChild(labelLine);
      opt.appendChild(recipient);
      opt.appendChild(addrText);
      addrPanel.appendChild(opt);
    });

    const link = document.createElement('a');
    link.className = 'add-addr-link';
    link.href = '/addresses.html';
    link.textContent = '+ 배송지 관리';
    addrPanel.appendChild(link);
  }
  root.appendChild(addrPanel);

  // 주문하기 버튼
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = '주문하기';
  btn.disabled = !_selectedAddressId;
  btn.addEventListener('click', handleCreateOrder);
  root.appendChild(btn);
}

/* ===== 주문 생성 ===== */
async function handleCreateOrder() {
  if (!_selectedAddressId) {
    alert('배송지를 선택해주세요.');
    return;
  }
  const btn = document.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '주문 생성 중...'; }

  try {
    _createdOrder = await createOrder({
      shippingAddressId: _selectedAddressId,
      items: _orderItems,
    });
    renderPayStep();
  } catch (err) {
    alert('주문 생성에 실패했습니다.\n' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = '주문하기'; }
  }
}

/* ===== Step 2: 토스 송금 + 입금자명 보고 ===== */
function renderPayStep() {
  const root = document.getElementById('content');
  root.textContent = '';

  // Step indicator
  const step = document.createElement('div');
  step.className = 'step';
  const num = document.createElement('span'); num.className = 'num'; num.textContent = '2';
  step.appendChild(num);
  step.appendChild(document.createTextNode(' 토스로 송금 후 입금자명 입력'));
  root.appendChild(step);

  // 주문번호 안내
  const orderInfo = document.createElement('div');
  orderInfo.className = 'panel';
  const oiTitle = document.createElement('div');
  oiTitle.className = 'panel-title';
  oiTitle.textContent = '주문이 생성되었습니다';
  orderInfo.appendChild(oiTitle);
  const oiNum = document.createElement('div');
  oiNum.style.cssText = 'font-size:14px;color:#6b7280;';
  oiNum.textContent = '주문번호: ' + _createdOrder.orderNumber;
  orderInfo.appendChild(oiNum);
  root.appendChild(orderInfo);

  // 입금 정보 + 토스 버튼
  const bank = document.createElement('div');
  bank.className = 'panel';
  const card = document.createElement('div');
  card.className = 'bank-card';

  const info = _createdOrder.bankInfo;

  // 은행
  const r1 = document.createElement('div');
  r1.className = 'bank-line';
  const k1 = document.createElement('span'); k1.className = 'k'; k1.textContent = '은행';
  const v1 = document.createElement('span'); v1.className = 'v'; v1.textContent = info.bankName;
  r1.appendChild(k1); r1.appendChild(v1);
  card.appendChild(r1);

  // 계좌번호 + 복사 버튼
  const r2 = document.createElement('div');
  r2.className = 'bank-line';
  const k2 = document.createElement('span'); k2.className = 'k'; k2.textContent = '계좌번호';
  const wrap2 = document.createElement('span');
  wrap2.style.cssText = 'display:inline-flex;align-items:center;gap:8px;';
  const v2 = document.createElement('span'); v2.className = 'v'; v2.textContent = info.accountNumber;
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = '복사';
  copyBtn.addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(info.accountNumber.replace(/-/g, ''))
        .then(() => { copyBtn.textContent = '✓ 복사됨'; setTimeout(() => (copyBtn.textContent = '복사'), 1500); })
        .catch(() => alert('복사에 실패했습니다.'));
    }
  });
  wrap2.appendChild(v2); wrap2.appendChild(copyBtn);
  r2.appendChild(k2); r2.appendChild(wrap2);
  card.appendChild(r2);

  // 예금주
  const r3 = document.createElement('div');
  r3.className = 'bank-line';
  const k3 = document.createElement('span'); k3.className = 'k'; k3.textContent = '예금주';
  const v3 = document.createElement('span'); v3.className = 'v'; v3.textContent = info.accountHolder;
  r3.appendChild(k3); r3.appendChild(v3);
  card.appendChild(r3);

  // 분리선
  const div = document.createElement('div');
  div.className = 'bank-divider';
  card.appendChild(div);

  // 입금 금액
  const amountRow = document.createElement('div');
  amountRow.className = 'bank-line amount';
  const ak = document.createElement('span'); ak.className = 'k'; ak.textContent = '입금 금액';
  const av = document.createElement('span'); av.className = 'v'; av.textContent = formatPrice(_createdOrder.totalPrice);
  amountRow.appendChild(ak); amountRow.appendChild(av);
  card.appendChild(amountRow);

  bank.appendChild(card);

  // 토스 송금 버튼 (딥링크)
  const tossBtn = document.createElement('a');
  tossBtn.className = 'btn-toss';
  tossBtn.href = TOSS_PAY_URL;
  tossBtn.target = '_blank';
  tossBtn.rel = 'noopener noreferrer';
  const logo = document.createElement('span');
  logo.className = 'toss-logo';
  logo.textContent = 'T';
  const tossLabel = document.createElement('span');
  tossLabel.textContent = '토스 앱으로 바로 송금하기';
  tossBtn.appendChild(logo);
  tossBtn.appendChild(tossLabel);
  bank.appendChild(tossBtn);

  // 안내 문구
  const info2 = document.createElement('div');
  info2.className = 'info-line';
  info2.textContent = '버튼을 누르면 토스 앱이 실행됩니다. PC에서는 새 탭으로 열립니다.';
  bank.appendChild(info2);

  // 주의
  const notice = document.createElement('div');
  notice.className = 'notice';
  notice.textContent = '⚠️ 송금 후 입금자명을 정확히 입력해주세요. 관리자가 입금자명과 금액을 대조하여 승인합니다.';
  bank.appendChild(notice);

  root.appendChild(bank);

  // 입금자명 보고 폼
  const proof = document.createElement('div');
  proof.className = 'panel';
  const pTitle = document.createElement('div');
  pTitle.className = 'panel-title';
  pTitle.textContent = '입금자명 입력';
  proof.appendChild(pTitle);

  const f1 = document.createElement('div'); f1.className = 'field';
  const l1 = document.createElement('label'); l1.textContent = '입금자명';
  const i1 = document.createElement('input');
  i1.type = 'text'; i1.id = 'depositorName';
  i1.placeholder = '예: 홍길동';
  i1.maxLength = 50;
  i1.autocomplete = 'name';
  f1.appendChild(l1); f1.appendChild(i1);
  proof.appendChild(f1);

  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = '입금 보고하기';
  btn.addEventListener('click', handleReportPayment);
  proof.appendChild(btn);

  root.appendChild(proof);
  // 자동 포커스
  setTimeout(() => i1.focus(), 0);
}

async function handleReportPayment() {
  const name = document.getElementById('depositorName').value.trim();
  if (!name) {
    alert('입금자명을 입력해주세요.');
    return;
  }

  const btn = document.querySelector('.btn-primary');
  btn.disabled = true; btn.textContent = '제출 중...';

  try {
    await reportPayment(_createdOrder.orderId, name);
    alert('입금 보고가 완료되었습니다.\n관리자 승인 후 결제가 완료됩니다.');
    location.href = '/my-orders.html';
  } catch (err) {
    alert('제출에 실패했습니다: ' + err.message);
    btn.disabled = false; btn.textContent = '입금 보고하기';
  }
}

/* ===== 초기화 ===== */
async function init() {
  document.getElementById('logoutLink').addEventListener('click', (e) => { e.preventDefault(); logout(); });

  try { await getCurrentUser(); } catch (_) { return; }

  const product = parseProduct();
  if (!product) {
    alert('상품 정보가 없습니다.');
    location.href = '/feed.html';
    return;
  }
  _orderItems = [{
    productName: product.title,
    size: product.size,
    quantity: product.quantity,
    price: product.price,
  }];
  _totalPrice = product.price * product.quantity;

  try {
    _addresses = await listAddresses();
  } catch (err) {
    alert('배송지를 불러오지 못했습니다: ' + err.message);
    _addresses = [];
  }

  const def = _addresses.find((a) => a.isDefault);
  if (def) _selectedAddressId = def.id;
  else if (_addresses.length > 0) _selectedAddressId = _addresses[0].id;

  renderSelectStep();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
