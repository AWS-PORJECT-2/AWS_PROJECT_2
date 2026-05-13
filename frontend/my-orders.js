/**
 * 내 주문 목록.
 * - 백엔드에서 받은 데이터 그대로 렌더링
 * - createElement + textContent 로 XSS 방어
 */

function renderOrderCard(order) {
  const card = document.createElement('div');
  card.className = 'card';

  const head = document.createElement('div');
  head.className = 'card-head';
  const numEl = document.createElement('div');
  numEl.className = 'order-num';
  numEl.textContent = order.orderNumber;
  const status = document.createElement('span');
  status.className = 'status-pill';
  status.textContent = getStatusText(order.status);
  status.style.backgroundColor = getStatusColor(order.status) + '22';
  status.style.color = getStatusColor(order.status);
  head.appendChild(numEl);
  head.appendChild(status);
  card.appendChild(head);

  (order.items || []).forEach((it) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const left = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = it.productName;
    const meta = document.createElement('div');
    meta.className = 'item-meta';
    meta.textContent = (it.size || 'Free') + ' / ' + it.quantity + '개';
    left.appendChild(name);
    left.appendChild(meta);
    const price = document.createElement('div');
    price.className = 'item-price';
    price.textContent = formatPrice(it.price * it.quantity);
    row.appendChild(left);
    row.appendChild(price);
    card.appendChild(row);
  });

  const foot = document.createElement('div');
  foot.className = 'card-foot';
  const date = document.createElement('div');
  date.className = 'date';
  date.textContent = formatDate(order.createdAt);
  const total = document.createElement('div');
  total.className = 'total';
  total.textContent = formatPrice(order.totalPrice);
  foot.appendChild(date);
  foot.appendChild(total);
  card.appendChild(foot);

  return card;
}

async function loadOrders() {
  const list = document.getElementById('list');
  list.textContent = '';

  try {
    const orders = await getMyOrders();
    if (!orders || orders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '주문 내역이 없습니다.';
      list.appendChild(empty);
      return;
    }
    orders.forEach((o) => list.appendChild(renderOrderCard(o)));
  } catch (err) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '주문 목록을 불러오지 못했습니다: ' + err.message;
    list.appendChild(empty);
  }
}

function init() {
  document.getElementById('logoutLink').addEventListener('click', (e) => { e.preventDefault(); logout(); });
  loadOrders();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
