/**
 * 공지사항 목록 페이지
 * - 비로그인 사용자도 열람 가능 (getCurrentUserOptional)
 * - ADMIN 일 때만 [글쓰기] 버튼과 [로그아웃] 노출
 */

let _currentUser = null;
let _currentPage = 1;
const PAGE_SIZE = 20;

function renderRow(item, index, total, page) {
  const tr = document.createElement('tr');
  tr.addEventListener('click', () => {
    location.href = '/announcement-detail.html?id=' + encodeURIComponent(item.id);
  });

  // 번호: 최신글이 위로 가도록 (total - offset - index)
  const offset = (page - 1) * PAGE_SIZE;
  const numTd = document.createElement('td');
  numTd.className = 'col-num';
  numTd.textContent = String(total - offset - index);

  const titleTd = document.createElement('td');
  titleTd.className = 'title-cell';
  titleTd.textContent = item.title;

  const authorTd = document.createElement('td');
  authorTd.className = 'col-meta';
  authorTd.textContent = item.authorName || '관리자';

  const dateTd = document.createElement('td');
  dateTd.className = 'col-meta';
  dateTd.textContent = formatShortDate(item.createdAt);

  const viewTd = document.createElement('td');
  viewTd.className = 'col-views';
  viewTd.textContent = String(item.viewCount);

  tr.appendChild(numTd);
  tr.appendChild(titleTd);
  tr.appendChild(authorTd);
  tr.appendChild(dateTd);
  tr.appendChild(viewTd);
  return tr;
}

function formatShortDate(s) {
  if (!s) return '';
  const d = new Date(s);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function renderPagination(page, totalPages) {
  const bar = document.getElementById('paginationBar');
  bar.textContent = '';
  if (totalPages <= 1) return;

  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = '‹';
  prev.disabled = page <= 1;
  prev.addEventListener('click', () => { _currentPage = page - 1; loadList(); });
  bar.appendChild(prev);

  // 가까운 페이지 5개 표시
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let p = start; p <= end; p++) {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (p === page ? ' active' : '');
    btn.textContent = String(p);
    const target = p;
    btn.addEventListener('click', () => { _currentPage = target; loadList(); });
    bar.appendChild(btn);
  }

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = '›';
  next.disabled = page >= totalPages;
  next.addEventListener('click', () => { _currentPage = page + 1; loadList(); });
  bar.appendChild(next);
}

async function loadList() {
  const tbody = document.getElementById('tbody');
  tbody.textContent = '';

  try {
    const res = await listAnnouncements(_currentPage, PAGE_SIZE);
    if (!res.items || res.items.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'empty';
      td.textContent = '등록된 공지사항이 없습니다.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      renderPagination(1, 0);
      return;
    }

    res.items.forEach((item, index) => {
      tbody.appendChild(renderRow(item, index, res.total, res.page));
    });
    renderPagination(res.page, res.totalPages);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'empty';
    td.textContent = '공지사항을 불러오지 못했습니다: ' + err.message;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

async function init() {
  _currentUser = await getCurrentUserOptional();

  if (_currentUser && _currentUser.role === 'ADMIN') {
    document.getElementById('btnWrite').style.display = '';
  }

  loadList();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
