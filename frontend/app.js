// ===== 상태 관리 =====
let currentPage = 'home'; // home, feed, detail
let feedData = [];
let currentProjectId = null;

// ===== API 호출 =====
const API_BASE = '';

async function fetchFeed(sort = 'latest') {
  const res = await fetch(`${API_BASE}/api/group-buys?sort=${sort}`);
  const json = await res.json();
  return json.data || [];
}

async function fetchDetail(projectId) {
  const res = await fetch(`${API_BASE}/api/group-buys/${projectId}`);
  return await res.json();
}

// ===== 페이지 렌더링 =====

function renderHome() {
  currentPage = 'home';
  const main = document.querySelector('.main-content');

  // 헤더 복원
  const headerHTML = `
    <header class="header mobile-only">
      <div class="header-left">
        <span class="school-name">국민대학교</span>
        <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="header-right">
        <button class="icon-btn" aria-label="검색">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        </button>
        <button class="icon-btn" aria-label="알림">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        </button>
      </div>
    </header>
    <header class="desktop-topbar desktop-only">
      <div class="topbar-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" placeholder="공동구매 검색..." class="search-input">
      </div>
      <div class="topbar-right">
        <button class="icon-btn" aria-label="알림">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        </button>
        <div class="topbar-profile">
          <img src="https://picsum.photos/seed/profile1/36/36" alt="프로필" class="topbar-avatar">
        </div>
      </div>
    </header>
    <section class="hero">
      <div class="hero-profile mobile-only">
        <img src="https://picsum.photos/seed/profile1/48/48" alt="프로필" class="profile-img">
      </div>
      <img src="https://picsum.photos/seed/hoodie/800/500" alt="과잠 배너" class="hero-image">
      <div class="hero-badge">
        <span class="badge-dot"></span>
        국민대학교 실시간 1위 과잠
      </div>
    </section>
    <section class="intro-section">
      <div class="main-copy">
        <h1>국민대학교만의<br>특별한 굿즈 펀딩</h1>
        <p class="sub-copy">우리 학교 트렌디한 아이템을 가장 먼저 만나보세요</p>
      </div>
      <div class="action-buttons">
        <button class="action-card" id="btnDesign">
          <div class="action-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          </div>
          <span>디자인 시작</span>
        </button>
        <button class="action-card" id="btnGroupBuy">
          <div class="action-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <span>공구 참여</span>
        </button>
      </div>
    </section>
    <section class="funding-section">
      <div class="section-header">
        <div class="section-title-row">
          <h2>실시간 펀딩 현황</h2>
          <span class="tag-badge">국민대학교 전용</span>
        </div>
        <a href="#" class="view-all" id="btnViewAll">전체보기</a>
      </div>
      <div class="card-grid" id="fundingCards"></div>
    </section>`;

  main.innerHTML = headerHTML;
  loadHomeFunding();
  bindHomeEvents();
}

async function loadHomeFunding() {
  const container = document.getElementById('fundingCards');
  try {
    const items = await fetchFeed('latest');
    feedData = items;
    container.innerHTML = items.map((item) => `
      <div class="funding-card" data-id="${item.projectId}">
        <div class="card-thumb">
          <img src="${item.thumbnailUrl}" alt="${item.title}">
          <span class="card-badge ${item.achievementRate >= 100 ? 'urgent' : 'open'}">${item.achievementRate >= 100 ? '달성완료' : '모집중'}</span>
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-price">${item.price.toLocaleString()}원</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${Math.min(item.achievementRate, 100)}%"></div>
        </div>
        <div class="progress-text">${item.achievementRate}% 달성</div>
      </div>
    `).join('');

    // 카드 클릭 이벤트
    container.querySelectorAll('.funding-card').forEach((card) => {
      card.addEventListener('click', () => {
        renderDetail(card.dataset.id);
      });
    });
  } catch (e) {
    container.innerHTML = '<p style="padding:20px;color:#999;">데이터를 불러올 수 없습니다.</p>';
  }
}

function bindHomeEvents() {
  document.getElementById('btnGroupBuy')?.addEventListener('click', () => renderFeed());
  document.getElementById('btnViewAll')?.addEventListener('click', (e) => {
    e.preventDefault();
    renderFeed();
  });
}

// ===== 공구 피드 페이지 =====

async function renderFeed() {
  currentPage = 'feed';
  const main = document.querySelector('.main-content');

  main.innerHTML = `
    <header class="feed-header">
      <button class="back-btn" id="btnBack">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h2 class="feed-title">국민대학교 공구 피드</h2>
      <button class="icon-btn" aria-label="검색">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      </button>
    </header>
    <div class="feed-list" id="feedList">
      <div class="loading">불러오는 중...</div>
    </div>`;

  document.getElementById('btnBack').addEventListener('click', () => renderHome());

  try {
    const items = await fetchFeed('latest');
    feedData = items;
    const feedList = document.getElementById('feedList');

    if (items.length === 0) {
      feedList.innerHTML = '<p class="empty-msg">등록된 공구가 없습니다.</p>';
      return;
    }

    feedList.innerHTML = items.map((item) => `
      <div class="feed-item" data-id="${item.projectId}">
        <div class="feed-thumb">
          <img src="${item.thumbnailUrl}" alt="${item.title}">
        </div>
        <div class="feed-info">
          <div class="feed-item-title">${item.title}</div>
          <div class="feed-meta">${item.deliveryType} · ${item.timeAgo}</div>
          <div class="feed-price">${item.price.toLocaleString()}원</div>
          <span class="feed-achievement ${item.achievementRate >= 100 ? 'over' : ''}">${item.achievementRate}% 달성</span>
          <div class="feed-stats">
            <span>💬 ${item.commentCount}</span>
            <span>♥ ${item.likeCount}</span>
          </div>
        </div>
      </div>
    `).join('');

    feedList.querySelectorAll('.feed-item').forEach((el) => {
      el.addEventListener('click', () => {
        renderDetail(el.dataset.id);
      });
    });
  } catch (e) {
    document.getElementById('feedList').innerHTML = '<p class="empty-msg">데이터를 불러올 수 없습니다.</p>';
  }
}

// ===== 상세 페이지 =====

async function renderDetail(projectId) {
  currentPage = 'detail';
  currentProjectId = projectId;
  const main = document.querySelector('.main-content');

  main.innerHTML = '<div class="loading">불러오는 중...</div>';

  try {
    const data = await fetchDetail(projectId);

    main.innerHTML = `
      <header class="detail-header">
        <button class="back-btn" id="btnDetailBack">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div class="detail-header-actions">
          <button class="icon-btn-light" aria-label="홈">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </button>
          <button class="icon-btn-light" aria-label="공유">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </button>
        </div>
      </header>
      <div class="detail-image-gallery">
        <img src="${data.imageUrls[0]}" alt="${data.title}" class="detail-main-image">
        <div class="image-counter">
          <span class="achievement-badge">달성률 ${data.achievementRate}%</span>
          <span class="counter-text">1 / ${data.imageUrls.length}</span>
        </div>
      </div>
      <div class="detail-body">
        <div class="designer-row">
          <img src="${data.designer.profileImageUrl}" alt="${data.designer.nickname}" class="designer-avatar">
          <div class="designer-info">
            <span class="designer-name">${data.designer.nickname}</span>
            <span class="designer-dept">${data.designer.department}</span>
          </div>
        </div>
        <h1 class="detail-title">${data.title}</h1>
        <div class="detail-price">${data.price.toLocaleString()}원</div>
        <p class="detail-desc">${data.description}</p>
        <div class="detail-bottom-bar">
          <button class="like-btn ${data.isLiked ? 'liked' : ''}" id="btnLike">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="${data.isLiked ? '#ef4444' : 'none'}" stroke="${data.isLiked ? '#ef4444' : '#9ca3af'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          </button>
          <button class="reserve-btn" id="btnReserve">DOO 참여하기</button>
        </div>
      </div>`;

    document.getElementById('btnDetailBack').addEventListener('click', () => renderFeed());
    document.getElementById('btnReserve').addEventListener('click', () => showReserveModal(projectId));
  } catch (e) {
    main.innerHTML = '<p class="empty-msg">삭제된 굿즈입니다.</p>';
  }
}

// ===== 예약 모달 =====

function showReserveModal(projectId) {
  // 1단계: 예약 확인
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" id="modalClose">✕</button>
      <p class="modal-text">예약을 진행하시겠습니까?</p>
      <button class="modal-confirm-btn" id="modalYes">YES</button>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('modalClose').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('modalYes').addEventListener('click', () => {
    overlay.remove();
    showCancelPolicyModal(projectId);
  });
}

function showCancelPolicyModal(projectId) {
  // 2단계: 취소 규정 안내
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box policy-modal">
      <h3 class="policy-title">예약 확정 및 취소 규정</h3>
      <p class="policy-text">달성률이 100%가 되기 전에는 예약취소 가능하나 확정 된 이후로는 예약 취소가 불가능하며 이를 어길 시 벤 당할 수도 있습니다.</p>
      <button class="modal-dark-btn" id="policyConfirm">확인</button>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('policyConfirm').addEventListener('click', async () => {
    overlay.remove();
    await doReservation(projectId);
  });
}

async function doReservation(projectId) {
  // 간단한 토큰 (로그인 구현 전 테스트용)
  let token = localStorage.getItem('token');
  if (!token) {
    // 자동 로그인
    try {
      const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sample@kookmin.ac.kr', password: '1234' }),
      });
      const loginData = await loginRes.json();
      if (loginData.token) {
        token = loginData.token;
        localStorage.setItem('token', token);
      } else {
        alert('로그인에 실패했습니다.');
        return;
      }
    } catch (e) {
      alert('서버에 연결할 수 없습니다.');
      return;
    }
  }

  try {
    const res = await fetch(`${API_BASE}/api/group-buys/${projectId}/reservations?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ options: {}, quantity: 1 }),
    });
    const data = await res.json();

    if (res.status === 201) {
      showResultModal('success', `예약이 완료되었습니다!\n달성률: ${data.currentAchievementRate}%`);
    } else {
      showResultModal('error', data.error || '예약에 실패했습니다.');
    }
  } catch (e) {
    showResultModal('error', '서버에 연결할 수 없습니다.');
  }
}

function showResultModal(type, message) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box result-modal">
      <div class="result-icon">${type === 'success' ? '✅' : '❌'}</div>
      <p class="result-text">${message}</p>
      <button class="modal-dark-btn" id="resultOk">확인</button>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('resultOk').addEventListener('click', () => {
    overlay.remove();
    if (type === 'success') renderDetail(currentProjectId);
  });
}

// ===== 네비게이션 바인딩 =====

function bindNavigation() {
  // 하단 네비게이션
  document.querySelectorAll('.bottom-nav .nav-item').forEach((item, idx) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      if (idx === 0) renderHome();
      if (idx === 1) renderFeed();
    });
  });

  // 사이드바 네비게이션
  document.querySelectorAll('.sidebar-nav .sidebar-item').forEach((item, idx) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      if (idx === 0) renderHome();
      if (idx === 1) renderFeed();
    });
  });
}

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  renderHome();
  bindNavigation();
});
