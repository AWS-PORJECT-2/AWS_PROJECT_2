/**
 * 전역 검색 모듈 (Global Search)
 * 모든 페이지에서 로드되어 동작합니다.
 * - 돋보기 아이콘 클릭 → 검색 오버레이 동적 생성
 * - 인기 키워드 클릭 → 자동 검색
 * - 검색 실행 → index.html?search=키워드 로 리다이렉트
 * - index.html 로드 시 ?search= 파라미터 감지 → 결과 렌더링
 */

const POPULAR_KEYWORDS = ['과잠', '후드티', '키링', '에코백', '크롭탑'];

/* ===== API 환경 설정 ===== */
const SEARCH_API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : 'https://api.doothing.app/api';
const SEARCH_ENDPOINT = SEARCH_API_BASE + '/products/search';

/* ===== 검색 오버레이 동적 생성 ===== */
function ensureSearchOverlay() {
  if (document.getElementById('searchOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'searchOverlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:#fff;z-index:500;flex-direction:column;';
  overlay.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #f0f0f0;">
      <button onclick="closeSearch()" aria-label="뒤로가기" style="background:none;border:none;cursor:pointer;padding:6px;color:#333;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div style="flex:1;display:flex;align-items:center;gap:8px;background:#f3f4f6;border-radius:10px;padding:10px 14px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input id="searchInput" type="text" placeholder="공동구매 검색..." style="border:none;outline:none;background:transparent;font-size:15px;color:#1a1a1a;width:100%;">
      </div>
      <button onclick="executeSearch()" style="background:none;border:none;cursor:pointer;padding:6px;font-size:15px;font-weight:600;color:#2563eb;">검색</button>
    </div>
    <div style="padding:20px;">
      <div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:12px;">인기 키워드</div>
      <div id="popularKeywords" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
    </div>
    <div id="searchResults" style="flex:1;overflow-y:auto;padding:0;"></div>
  `;
  document.body.appendChild(overlay);
}

/* ===== 검색 오버레이 열기/닫기 ===== */
function openSearch() {
  ensureSearchOverlay();
  const overlay = document.getElementById('searchOverlay');
  overlay.style.display = 'flex';
  renderPopularKeywords();
  document.getElementById('searchResults').innerHTML = '';
  requestAnimationFrame(() => {
    document.getElementById('searchInput').focus();
  });
}

function closeSearch() {
  const overlay = document.getElementById('searchOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    document.getElementById('searchInput').value = '';
  }
}

/* ===== 인기 키워드 렌더링 ===== */
function renderPopularKeywords() {
  const container = document.getElementById('popularKeywords');
  if (!container) return;
  container.innerHTML = POPULAR_KEYWORDS
    .map(
      (keyword) => `
    <button onclick="selectKeyword('${keyword}')"
      style="padding:8px 16px;border:1px solid #e5e7eb;border-radius:20px;background:#fff;font-size:13px;color:#4b5563;cursor:pointer;transition:all 0.15s;">
      ${keyword}
    </button>
  `
    )
    .join('');
}

/* ===== 인기 키워드 클릭 ===== */
function selectKeyword(keyword) {
  const input = document.getElementById('searchInput');
  if (input) input.value = keyword;
  executeSearch();
}

/* ===== 검색 실행 — 항상 index.html로 리다이렉트 ===== */
function executeSearch() {
  const input = document.getElementById('searchInput');
  const keyword = input ? input.value.trim() : '';
  if (!keyword) return;

  // 현재 페이지가 index.html이면 바로 렌더링, 아니면 리다이렉트
  const isHome = window.location.pathname.endsWith('index.html')
    || window.location.pathname.endsWith('/')
    || window.location.pathname === '';

  if (isHome) {
    closeSearch();
    performSearchOnHome(keyword);
  } else {
    window.location.href = 'index.html?search=' + encodeURIComponent(keyword);
  }
}

/* ===== 프론트엔드 로컬 필터링 (fallback) ===== */
function searchLocal(keyword) {
  const lower = keyword.toLowerCase();
  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS
    : [];
  return products.filter(
    (p) =>
      p.title.toLowerCase().includes(lower) ||
      p.description.toLowerCase().includes(lower) ||
      p.department.toLowerCase().includes(lower)
  );
}

/* ===== 백엔드 fetch ===== */
async function fetchSearchResults(keyword) {
  const url = SEARCH_ENDPOINT + '?search=' + encodeURIComponent(keyword);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Backend not available');
  return response.json();
}

/* ===== index.html에서 검색 결과 렌더링 ===== */
function performSearchOnHome(keyword) {
  const container = document.getElementById('fundingCards');
  const sectionTitle = document.querySelector('.section-title-row h2');

  if (sectionTitle) {
    sectionTitle.textContent = "'" + keyword + "' 검색 결과";
  }

  // 전체보기 링크를 초기화 버튼으로 변경
  const viewAll = document.querySelector('.view-all');
  if (viewAll) {
    viewAll.textContent = '전체보기';
    viewAll.href = '#';
    viewAll.onclick = function (e) {
      e.preventDefault();
      resetHomeView();
    };
  }

  // 백엔드 시도 → 실패 시 로컬 필터링
  fetchSearchResults(keyword)
    .then((results) => renderHomeSearchResults(container, results, keyword))
    .catch(() => {
      const results = searchLocal(keyword);
      renderHomeSearchResults(container, results, keyword);
    });
}

function renderHomeSearchResults(container, results, keyword) {
  if (!container) return;

  if (results.length === 0) {
    // XSS 방지: textContent로 안전하게 렌더링
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'grid-column:1/-1;text-align:center;padding:40px 20px;color:#9ca3af;';

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '48');
    svg.setAttribute('height', '48');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', '#d1d5db');
    svg.setAttribute('stroke-width', '1.5');
    svg.style.cssText = 'margin:0 auto 16px;display:block;';
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', '11');
    circle.setAttribute('cy', '11');
    circle.setAttribute('r', '8');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', 'M21 21l-4.35-4.35');
    svg.appendChild(circle);
    svg.appendChild(path);
    wrapper.appendChild(svg);

    const message = document.createElement('p');
    message.style.cssText = 'font-size:15px;font-weight:600;color:#6b7280;';
    message.textContent = '\'' + keyword + '\'에 대한 검색 결과가 없습니다';
    wrapper.appendChild(message);

    const sub = document.createElement('p');
    sub.style.cssText = 'font-size:13px;margin-top:6px;';
    sub.textContent = '다른 키워드로 검색해 보세요';
    wrapper.appendChild(sub);

    container.appendChild(wrapper);
    return;
  }

  container.innerHTML = results
    .map((item) => {
      const rate = (typeof calcAchievementRate === 'function') ? calcAchievementRate(item) : 0;
      const badge = (typeof getBadgeInfo === 'function') ? getBadgeInfo(rate) : { text: '모집중', type: 'open' };
      const logo = item.department.substring(0, 2).toUpperCase();
      return `
    <a href="detail.html?id=${item.id}" class="funding-card">
      <div class="card-thumb">
        <img src="${item.imageUrl}" alt="${item.title}">
        <span class="card-badge ${badge.type}">${badge.text}</span>
        <span class="card-logo">${logo}</span>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-price">${item.priceText}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${Math.min(rate, 100)}%"></div>
      </div>
      <div class="progress-text">${rate}% 달성</div>
    </a>
  `;
    })
    .join('');
}

/* ===== 홈 화면 초기 상태 복원 ===== */
function resetHomeView() {
  const sectionTitle = document.querySelector('.section-title-row h2');
  if (sectionTitle) sectionTitle.textContent = '실시간 펀딩 현황';

  // URL 파라미터 제거
  history.replaceState(null, '', 'index.html');

  // 원래 카드 렌더링
  if (typeof renderFundingCards === 'function') {
    renderFundingCards();
  }
}

/* ===== 초기화: Enter 키 + URL 파라미터 감지 ===== */
document.addEventListener('DOMContentLoaded', () => {
  // 모바일 검색 Enter 키 (오버레이가 동적 생성되므로 body에 위임)
  document.body.addEventListener('keydown', (e) => {
    if (e.target.id === 'searchInput' && e.key === 'Enter') {
      e.preventDefault();
      executeSearch();
    }
  });

  // 데스크톱 검색바 Enter 키
  const desktopInput = document.getElementById('desktopSearchInput');
  if (desktopInput) {
    desktopInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const keyword = desktopInput.value.trim();
        if (!keyword) return;
        performSearchOnHome(keyword);
      }
    });
  }

  // index.html 로드 시 ?search= 파라미터 감지
  const params = new URLSearchParams(window.location.search);
  const searchKeyword = params.get('search');
  if (searchKeyword) {
    performSearchOnHome(searchKeyword);
  }
});
