// ===== 상태 관리 =====
const API = '';  // 같은 서버
let currentUser = null;
let currentPage = 'home';

// ===== API 호출 =====
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  return { status: res.status, data: await res.json() };
}

// ===== 네비게이션 =====
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  renderPage();
}

document.querySelectorAll('[data-page]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    navigate(el.dataset.page);
  });
});

// ===== 페이지 렌더링 =====
function renderPage() {
  const container = document.getElementById('pageContainer');
  switch (currentPage) {
    case 'home': renderHome(container); break;
    case 'group-buy': renderGroupBuyList(container); break;
    case 'trade': renderTradeList(container); break;
    case 'mypage': renderMyPage(container); break;
  }
}

// ===== 홈 페이지 =====
async function renderHome(el) {
  const { data: gbs } = await api('GET', '/api/group-buys');
  const { data: trades } = await api('GET', '/api/trades');

  el.innerHTML = `
    <section class="hero">
      <img src="https://picsum.photos/seed/hoodie/800/500" alt="배너" class="hero-image">
      <div class="hero-badge">
        <span class="badge-dot"></span>
        국민대학교 공동구매·중고거래 플랫폼
      </div>
    </section>

    <section class="intro-section">
      <div class="main-copy">
        <h1>국민대학교만의<br>특별한 공동구매</h1>
        <p class="sub-copy">우리 학교 트렌디한 아이템을 가장 먼저 만나보세요</p>
      </div>
      <div class="action-buttons">
        <button class="action-card" onclick="navigate('group-buy')">
          <div class="action-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          </div>
          <span>공동구매</span>
        </button>
        <button class="action-card" onclick="navigate('trade')">
          <div class="action-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          </div>
          <span>중고거래</span>
        </button>
      </div>
    </section>

    <section class="funding-section">
      <div class="section-header">
        <div class="section-title-row">
          <h2>실시간 공동구매</h2>
          <span class="tag-badge">국민대 전용</span>
        </div>
        <a href="#" class="view-all" onclick="event.preventDefault();navigate('group-buy')">전체보기</a>
      </div>
      <div class="card-grid">${gbs.slice(0, 4).map(cardGB).join('')}</div>
    </section>

    <section class="funding-section">
      <div class="section-header">
        <div class="section-title-row">
          <h2>최근 중고거래</h2>
          <span class="tag-badge green">거래 가능</span>
        </div>
        <a href="#" class="view-all" onclick="event.preventDefault();navigate('trade')">전체보기</a>
      </div>
      <div class="card-grid">${trades.slice(0, 4).map(cardTrade).join('')}</div>
    </section>
  `;
}

// ===== 카드 컴포넌트 =====
function cardGB(item) {
  const progress = item.minPeople > 0 ? Math.round((item.currentPeople / item.minPeople) * 100) : 0;
  const badgeClass = item.status === '모집중' ? 'open' : item.status === '마감임박' ? 'urgent' : 'done';
  return `
    <div class="funding-card" onclick="showGBDetail('${item.id}')">
      <div class="card-thumb">
        <img src="${item.image}" alt="${item.title}" loading="lazy">
        <span class="card-badge ${badgeClass}">${item.status}</span>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-price">${item.price.toLocaleString()}원</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(progress,100)}%"></div></div>
      <div class="progress-text">${item.currentPeople}/${item.minPeople}명 (${progress}%)</div>
    </div>`;
}

function cardTrade(item) {
  const statusClass = item.status === '판매중' ? 'open' : item.status === '예약중' ? 'urgent' : 'done';
  return `
    <div class="funding-card" onclick="showTradeDetail('${item.id}')">
      <div class="card-thumb">
        <img src="${item.image}" alt="${item.title}" loading="lazy">
        <span class="card-badge ${statusClass}">${item.status}</span>
        <span class="card-logo">${item.category}</span>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-price">${item.price.toLocaleString()}원</div>
    </div>`;
}

// ===== 공동구매 목록 =====
async function renderGroupBuyList(el) {
  const { data: items } = await api('GET', '/api/group-buys');
  el.innerHTML = `
    <div class="page-header">
      <h2>공동구매</h2>
      <button class="btn-primary btn-sm" onclick="showModal('createGBModal')">+ 개설하기</button>
    </div>
    <div class="filter-bar">
      <button class="filter-btn active" onclick="filterGB('')">전체</button>
      <button class="filter-btn" onclick="filterGB('모집중')">모집중</button>
      <button class="filter-btn" onclick="filterGB('성사')">성사</button>
      <button class="filter-btn" onclick="filterGB('무산')">무산</button>
    </div>
    <div class="card-grid grid-full">${items.map(cardGB).join('')}</div>
  `;
}

async function filterGB(status) {
  const url = status ? `/api/group-buys?status=${encodeURIComponent(status)}` : '/api/group-buys';
  const { data: items } = await api('GET', url);
  document.querySelector('.card-grid.grid-full').innerHTML = items.map(cardGB).join('');
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}

// ===== 중고거래 목록 =====
async function renderTradeList(el) {
  const { data: items } = await api('GET', '/api/trades');
  el.innerHTML = `
    <div class="page-header">
      <h2>중고거래</h2>
      <button class="btn-primary btn-sm" onclick="showModal('createTradeModal')">+ 등록하기</button>
    </div>
    <div class="filter-bar">
      <button class="filter-btn active" onclick="filterTrade('')">전체</button>
      <button class="filter-btn" onclick="filterTrade('교재')">교재</button>
      <button class="filter-btn" onclick="filterTrade('전자기기')">전자기기</button>
      <button class="filter-btn" onclick="filterTrade('의류')">의류</button>
      <button class="filter-btn" onclick="filterTrade('생활용품')">생활용품</button>
      <button class="filter-btn" onclick="filterTrade('기타')">기타</button>
    </div>
    <div class="card-grid grid-full">${items.map(cardTrade).join('')}</div>
  `;
}

async function filterTrade(category) {
  const url = category ? `/api/trades?category=${encodeURIComponent(category)}` : '/api/trades';
  const { data: items } = await api('GET', url);
  document.querySelector('.card-grid.grid-full').innerHTML = items.map(cardTrade).join('');
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}

// ===== 마이페이지 =====
function renderMyPage(el) {
  if (!currentUser) {
    el.innerHTML = `
      <div class="empty-state">
        <p>로그인이 필요합니다</p>
        <button class="btn-primary" onclick="showAuthModal()">로그인</button>
      </div>`;
    return;
  }
  el.innerHTML = `
    <div class="page-header"><h2>마이페이지</h2></div>
    <div class="mypage-card">
      <div class="mypage-avatar">🎓</div>
      <div class="mypage-info">
        <h3>${currentUser.name}</h3>
        <p>${currentUser.studentId}</p>
        <p>${currentUser.email}</p>
      </div>
    </div>
    <div class="mypage-section">
      <h3>내 활동</h3>
      <p class="sub-copy">공동구매 개설/참여 내역과 중고거래 내역이 여기에 표시됩니다.</p>
    </div>
  `;
}

// ===== 상세보기 =====
async function showGBDetail(id) {
  const { data: item } = await api('GET', `/api/group-buys/${id}`);
  if (!item || item.error) return;
  const progress = item.minPeople > 0 ? Math.round((item.currentPeople / item.minPeople) * 100) : 0;
  document.getElementById('detailTitle').textContent = item.title;
  document.getElementById('detailBody').innerHTML = `
    <img src="${item.image}" alt="${item.title}" class="detail-image">
    <div class="detail-meta">
      <span class="tag-badge">${item.status}</span>
      <span>마감일: ${item.deadline}</span>
    </div>
    <p class="detail-desc">${item.description}</p>
    <div class="detail-stats">
      <div class="stat">
        <span class="stat-label">가격</span>
        <span class="stat-value">${item.price.toLocaleString()}원</span>
      </div>
      <div class="stat">
        <span class="stat-label">참여 현황</span>
        <span class="stat-value">${item.currentPeople} / ${item.minPeople}명</span>
      </div>
      <div class="stat">
        <span class="stat-label">달성률</span>
        <span class="stat-value">${progress}%</span>
      </div>
    </div>
    <div class="progress-bar progress-lg"><div class="progress-fill" style="width:${Math.min(progress,100)}%"></div></div>
    ${item.options && item.options.length > 0 ? `
      <div class="detail-options">
        <h4>옵션</h4>
        ${item.options.map(o => `<p>${o.name}: ${o.values.join(', ')}</p>`).join('')}
      </div>` : ''}
    <button class="btn-primary" onclick="joinGB('${item.id}')">참여하기</button>
  `;
  showModal('detailModal');
}

async function showTradeDetail(id) {
  const { data: item } = await api('GET', `/api/trades/${id}`);
  if (!item || item.error) return;
  document.getElementById('detailTitle').textContent = item.title;
  document.getElementById('detailBody').innerHTML = `
    <img src="${item.image}" alt="${item.title}" class="detail-image">
    <div class="detail-meta">
      <span class="tag-badge">${item.status}</span>
      <span class="tag-badge green">${item.category}</span>
    </div>
    <p class="detail-desc">${item.description}</p>
    <div class="detail-stats">
      <div class="stat">
        <span class="stat-label">가격</span>
        <span class="stat-value">${item.price.toLocaleString()}원</span>
      </div>
      <div class="stat">
        <span class="stat-label">거래 장소</span>
        <span class="stat-value">${item.location || '미정'}</span>
      </div>
    </div>
    <button class="btn-primary" onclick="alert('쪽지 기능은 준비 중입니다')">쪽지 보내기</button>
  `;
  showModal('detailModal');
}

async function joinGB(id) {
  if (!currentUser) { showAuthModal(); return; }
  const { status, data } = await api('POST', `/api/group-buys/${id}/join`, {
    name: currentUser.name,
    studentId: currentUser.studentId,
    quantity: 1,
  });
  if (status === 200) {
    alert(`참여 완료! 현재 ${data.currentPeople}명 참여 중`);
    closeModal('detailModal');
    renderPage();
  } else {
    alert(data.error || '참여 실패');
  }
}

// ===== 인증 =====
function showAuthModal() {
  document.getElementById('authError').textContent = '';
  showModal('authModal');
}

function toggleAuthForm() {
  const login = document.getElementById('loginForm');
  const reg = document.getElementById('registerForm');
  const title = document.getElementById('authModalTitle');
  if (login.style.display === 'none') {
    login.style.display = 'block';
    reg.style.display = 'none';
    title.textContent = '로그인';
  } else {
    login.style.display = 'none';
    reg.style.display = 'block';
    title.textContent = '회원가입';
  }
  document.getElementById('authError').textContent = '';
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const { status, data } = await api('POST', '/api/auth/login', { email, password });
  if (status === 200) {
    currentUser = data.user;
    updateAuthUI();
    closeModal('authModal');
    renderPage();
  } else {
    document.getElementById('authError').textContent = data.error;
  }
}

async function doRegister() {
  const email = document.getElementById('regEmail').value;
  const name = document.getElementById('regName').value;
  const studentId = document.getElementById('regStudentId').value;
  const password = document.getElementById('regPassword').value;
  const { status, data } = await api('POST', '/api/auth/register', { email, name, studentId, password });
  if (status === 200) {
    alert('회원가입 완료! 로그인해주세요.');
    toggleAuthForm();
  } else {
    document.getElementById('authError').textContent = data.error;
  }
}

function updateAuthUI() {
  const info = document.getElementById('userInfo');
  const btn = document.getElementById('authBtn');
  if (currentUser) {
    info.textContent = `${currentUser.name} (${currentUser.studentId})`;
    btn.textContent = '로그아웃';
    btn.onclick = () => { currentUser = null; updateAuthUI(); renderPage(); };
  } else {
    info.textContent = '';
    btn.textContent = '로그인';
    btn.onclick = showAuthModal;
  }
}

// ===== 공동구매 생성 =====
async function generateAI() {
  const product = document.getElementById('aiProduct').value;
  const keywords = document.getElementById('aiKeywords').value;
  if (!product) { alert('상품명을 입력해주세요'); return; }
  const { status, data } = await api('POST', '/api/ai/generate', { product, keywords });
  if (status === 200) {
    document.getElementById('gbTitle').value = data.title;
    document.getElementById('gbDesc').value = data.description;
  } else {
    alert('AI 생성에 실패했습니다. 직접 작성해 주세요');
  }
}

async function createGroupBuy() {
  const body = {
    title: document.getElementById('gbTitle').value,
    description: document.getElementById('gbDesc').value,
    price: document.getElementById('gbPrice').value,
    minPeople: document.getElementById('gbMinPeople').value,
    deadline: document.getElementById('gbDeadline').value,
    author: currentUser ? currentUser.email : 'anonymous',
  };
  const { status, data } = await api('POST', '/api/group-buys', body);
  if (status === 201) {
    closeModal('createGBModal');
    navigate('group-buy');
  } else {
    document.getElementById('gbError').textContent = data.error;
  }
}

// ===== 중고거래 생성 =====
async function createTrade() {
  const body = {
    title: document.getElementById('trTitle').value,
    description: document.getElementById('trDesc').value,
    price: document.getElementById('trPrice').value,
    category: document.getElementById('trCategory').value,
    location: document.getElementById('trLocation').value,
    author: currentUser ? currentUser.email : 'anonymous',
  };
  const { status, data } = await api('POST', '/api/trades', body);
  if (status === 201) {
    closeModal('createTradeModal');
    navigate('trade');
  } else {
    document.getElementById('trError').textContent = data.error;
  }
}

// ===== 모달 =====
function showModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.style.display = 'none';
  });
});

// ===== 검색 =====
document.getElementById('searchInput')?.addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  const keyword = e.target.value.trim();
  if (!keyword) return;
  if (currentPage === 'trade') {
    const { data } = await api('GET', `/api/trades?keyword=${encodeURIComponent(keyword)}`);
    document.querySelector('.card-grid.grid-full').innerHTML = data.map(cardTrade).join('');
  } else {
    const { data } = await api('GET', `/api/group-buys?keyword=${encodeURIComponent(keyword)}`);
    navigate('group-buy');
    setTimeout(() => {
      const grid = document.querySelector('.card-grid.grid-full');
      if (grid) grid.innerHTML = data.map(cardGB).join('');
    }, 100);
  }
});

// ===== 초기화 =====
renderPage();
