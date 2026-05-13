/**
 * 배송지 관리 페이지
 * - 목록 / 추가 / 수정 / 삭제 / 기본 변경
 * - createElement + textContent 로 XSS 방어
 */

let _editingId = null;

/* ===== 카드 1개 렌더링 ===== */
function renderAddressCard(addr) {
  const card = document.createElement('div');
  card.className = 'addr-card' + (addr.isDefault ? ' default' : '');

  // 헤더: 별칭 + 기본 뱃지
  const head = document.createElement('div');
  head.className = 'addr-head';
  const labelEl = document.createElement('div');
  labelEl.className = 'addr-label';
  labelEl.textContent = addr.label;
  head.appendChild(labelEl);
  if (addr.isDefault) {
    const badge = document.createElement('span');
    badge.className = 'badge-default';
    badge.textContent = '기본';
    head.appendChild(badge);
  }

  // 수령인
  const recipientEl = document.createElement('div');
  recipientEl.className = 'addr-line';
  recipientEl.textContent = addr.recipientName + ' · ' + addr.recipientPhone;

  // 주소
  const addressLine = document.createElement('div');
  addressLine.className = 'addr-line';
  addressLine.textContent = '(' + addr.postalCode + ') ' + addr.roadAddress;

  card.appendChild(head);
  card.appendChild(recipientEl);
  card.appendChild(addressLine);

  if (addr.detailAddress) {
    const detail = document.createElement('div');
    detail.className = 'addr-meta';
    detail.textContent = addr.detailAddress;
    card.appendChild(detail);
  }

  // 액션 버튼
  const actions = document.createElement('div');
  actions.className = 'addr-actions';

  if (!addr.isDefault) {
    const setDefault = document.createElement('button');
    setDefault.className = 'btn-secondary';
    setDefault.textContent = '기본으로 설정';
    setDefault.addEventListener('click', () => handleSetDefault(addr.id));
    actions.appendChild(setDefault);
  }

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-secondary';
  editBtn.textContent = '수정';
  editBtn.addEventListener('click', () => openEditModal(addr));
  actions.appendChild(editBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-danger';
  delBtn.textContent = '삭제';
  delBtn.addEventListener('click', () => handleDelete(addr.id, addr.label));
  actions.appendChild(delBtn);

  card.appendChild(actions);
  return card;
}

/* ===== 목록 렌더링 ===== */
async function loadAddresses() {
  const listEl = document.getElementById('addrList');
  const countEl = document.getElementById('addrCount');
  listEl.textContent = '';

  try {
    const list = await listAddresses();
    countEl.textContent = '총 ' + list.length + '개';

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '등록된 배송지가 없습니다. 새 배송지를 추가해주세요.';
      listEl.appendChild(empty);
      return;
    }

    list.forEach((addr) => listEl.appendChild(renderAddressCard(addr)));
  } catch (err) {
    countEl.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '배송지 목록을 불러오지 못했습니다: ' + err.message;
    listEl.appendChild(empty);
  }
}

/* ===== Modal 제어 ===== */
function openAddModal() {
  _editingId = null;
  document.getElementById('modalTitle').textContent = '배송지 추가';
  document.getElementById('addrForm').reset();
  document.getElementById('modal').classList.add('active');
}

function openEditModal(addr) {
  _editingId = addr.id;
  document.getElementById('modalTitle').textContent = '배송지 수정';
  const f = document.getElementById('addrForm');
  f.label.value = addr.label || '';
  f.recipientName.value = addr.recipientName || '';
  f.recipientPhone.value = addr.recipientPhone || '';
  f.postalCode.value = addr.postalCode || '';
  f.roadAddress.value = addr.roadAddress || '';
  f.jibunAddress.value = addr.jibunAddress || '';
  f.detailAddress.value = addr.detailAddress || '';
  f.isDefault.checked = !!addr.isDefault;
  // 수정 시 isDefault 체크박스는 비활성 (기본 변경은 별도 버튼으로)
  f.isDefault.disabled = true;
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
  document.getElementById('addrForm').isDefault.disabled = false;
}

/* ===== 저장 ===== */
async function handleSubmit() {
  const f = document.getElementById('addrForm');
  const payload = {
    label: f.label.value.trim(),
    recipientName: f.recipientName.value.trim(),
    recipientPhone: f.recipientPhone.value.trim(),
    postalCode: f.postalCode.value.trim(),
    roadAddress: f.roadAddress.value.trim(),
    jibunAddress: f.jibunAddress.value.trim() || null,
    detailAddress: f.detailAddress.value.trim() || null,
    isDefault: !!f.isDefault.checked,
  };

  // 간단 검증
  if (!payload.label || !payload.recipientName || !payload.recipientPhone || !payload.postalCode || !payload.roadAddress) {
    alert('필수 항목을 모두 입력해주세요.');
    return;
  }

  const submitBtn = document.getElementById('modalSubmit');
  submitBtn.disabled = true;
  submitBtn.textContent = '저장 중...';

  try {
    if (_editingId == null) {
      await createAddress(payload);
    } else {
      // 수정 시 isDefault는 보내지 않음 (별도 액션)
      delete payload.isDefault;
      await updateAddress(_editingId, payload);
    }
    closeModal();
    await loadAddresses();
  } catch (err) {
    alert('저장에 실패했습니다: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '저장';
  }
}

/* ===== 기본 변경 ===== */
async function handleSetDefault(id) {
  try {
    await setDefaultAddress(id);
    await loadAddresses();
  } catch (err) {
    alert('기본 배송지 변경에 실패했습니다: ' + err.message);
  }
}

/* ===== 삭제 ===== */
async function handleDelete(id, label) {
  if (!confirm('「' + label + '」 배송지를 삭제할까요?')) return;
  try {
    await deleteAddress(id);
    await loadAddresses();
  } catch (err) {
    alert(err.message || '삭제에 실패했습니다.');
  }
}

/* ===== 초기화 ===== */
function init() {
  document.getElementById('btnAdd').addEventListener('click', openAddModal);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSubmit').addEventListener('click', handleSubmit);
  document.getElementById('logoutLink').addEventListener('click', (e) => { e.preventDefault(); logout(); });
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
  loadAddresses();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
