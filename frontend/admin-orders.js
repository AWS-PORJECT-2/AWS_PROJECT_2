/**
 * 관리자 주문 승인 페이지.
 * - WAITING_FOR_CONFIRM 상태 주문만 표시
 * - 입금자명과 총액을 대조한 뒤 [승인] 버튼 클릭 → PATCH /api/admin/payment-orders/:id/confirm
 * - 사진 미리보기 영역 없음 (UX 개선)
 */

function renderRow(order) {
  const row = document.createElement('div');
  row.className = 'order-row';

  // 1) 주문
  const c1 = document.createElement('div');
  const ll1 = document.createElement('div'); ll1.className = 'col-label'; ll1.textContent = '주문';
  const num = document.createElement('div'); num.className = 'order-num'; num.textContent = order.orderNumber;
  const date = document.createElement('div'); date.className = 'order-date'; date.textContent = formatDate(order.createdAt);
  c1.appendChild(ll1);
  c1.appendChild(num);
  c1.appendChild(date);

  // 2) 상품
  const c2 = document.createElement('div');
  const ll2 = document.createElement('div'); ll2.className = 'col-label'; ll2.textContent = '상품';
  c2.appendChild(ll2);
  (order.items || []).forEach((it, idx) => {
    const p = document.createElement('div'); p.className = 'product';
    p.textContent = it.productName;
    const m = document.createElement('div'); m.className = 'product-meta';
    m.textContent = (it.size || 'Free') + ' / ' + it.quantity + '개 / ' + formatPrice(it.price);
    c2.appendChild(p);
    c2.appendChild(m);
    if (idx < order.items.length - 1) {
      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:#f3f4f6;margin:6px 0;';
      c2.appendChild(sep);
    }
  });

  // 3) 입금자명 (강조)
  const c3 = document.createElement('div');
  const ll3 = document.createElement('div'); ll3.className = 'col-label'; ll3.textContent = '입금자명';
  c3.appendChild(ll3);
  if (order.proof) {
    const d = document.createElement('div'); d.className = 'depositor';
    d.textContent = order.proof.depositorName;
    c3.appendChild(d);
  } else {
    const d = document.createElement('div'); d.style.color = '#ef4444'; d.style.fontSize = '13px';
    d.textContent = '미보고';
    c3.appendChild(d);
  }

  // 4) 총액 (강조)
  const c4 = document.createElement('div');
  const ll4 = document.createElement('div'); ll4.className = 'col-label'; ll4.textContent = '총액';
  const amt = document.createElement('div'); amt.className = 'amount'; amt.textContent = formatPrice(order.totalPrice);
  c4.appendChild(ll4);
  c4.appendChild(amt);

  // 5) 승인 버튼
  const c5 = document.createElement('div');
  const ll5 = document.createElement('div'); ll5.className = 'col-label'; ll5.textContent = '액션';
  const btn = document.createElement('button');
  btn.className = 'btn-approve';
  btn.textContent = '승인';
  btn.addEventListener('click', () => handleApprove(order, btn));
  c5.appendChild(ll5);
  c5.appendChild(btn);

  row.appendChild(c1);
  row.appendChild(c2);
  row.appendChild(c3);
  row.appendChild(c4);
  row.appendChild(c5);
  return row;
}

async function handleApprove(order, btn) {
  const depositor = order.proof ? order.proof.depositorName : '(미보고)';
  if (!confirm('주문 ' + order.orderNumber + ' (입금자: ' + depositor + ', 총액: ' + formatPrice(order.totalPrice) + ') 을 승인할까요?')) return;

  btn.disabled = true; btn.textContent = '처리 중...';
  try {
    const memo = prompt('메모 (선택)') || '';
    await confirmPayment(order.id, memo);
    alert('승인 완료되었습니다.');
    await loadList();
  } catch (err) {
    alert('승인에 실패했습니다: ' + err.message);
    btn.disabled = false; btn.textContent = '승인';
  }
}

async function loadList() {
  const list = document.getElementById('list');
  list.textContent = '';
  try {
    const orders = await getPendingOrders();
    if (!orders || orders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '승인 대기 중인 주문이 없습니다.';
      list.appendChild(empty);
      return;
    }
    orders.forEach((o) => list.appendChild(renderRow(o)));
  } catch (err) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '주문 목록을 불러오지 못했습니다: ' + err.message;
    list.appendChild(empty);
  }
}

function init() {
  document.getElementById('imgClose').addEventListener('click', closeImageModal);
  document.getElementById('imgModal').addEventListener('click', (e) => {
    if (e.target.id === 'imgModal') closeImageModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeImageModal(); });
  loadList();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
