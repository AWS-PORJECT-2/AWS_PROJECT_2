/**
 * 공지사항 상세 페이지
 * - URL: ?id=<announcementId>
 * - ADMIN 일 때만 [수정/삭제] 버튼 노출
 * - content 는 textContent 로 렌더링 (XSS 방어, white-space:pre-wrap 으로 줄바꿈 보존)
 */

let _currentUser = null;
let _announcement = null;

function getId() {
  const params = new URLSearchParams(location.search);
  const id = parseInt(params.get('id') || '', 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function formatDateTime(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function render() {
  const root = document.getElementById('content');
  root.textContent = '';

  const article = document.createElement('article');
  article.className = 'article';

  const h1 = document.createElement('h1');
  h1.textContent = _announcement.title;
  article.appendChild(h1);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const author = document.createElement('span');
  author.textContent = '작성자: ' + (_announcement.authorName || '관리자');
  const date = document.createElement('span');
  date.textContent = '작성일: ' + formatDateTime(_announcement.createdAt);
  const view = document.createElement('span');
  view.textContent = '조회: ' + _announcement.viewCount;
  meta.appendChild(author);
  meta.appendChild(date);
  meta.appendChild(view);
  article.appendChild(meta);

  const content = document.createElement('div');
  content.className = 'content';
  // textContent + CSS white-space:pre-wrap 로 줄바꿈 유지하면서 XSS 방어
  content.textContent = _announcement.content;
  article.appendChild(content);

  // 액션 영역
  const actions = document.createElement('div');
  actions.className = 'actions';

  const left = document.createElement('div');
  left.className = 'left';
  const backBtn = document.createElement('a');
  backBtn.className = 'btn btn-secondary';
  backBtn.href = '/announcements.html';
  backBtn.textContent = '목록으로';
  left.appendChild(backBtn);

  const right = document.createElement('div');
  right.className = 'right';
  if (_currentUser && _currentUser.role === 'ADMIN') {
    const editBtn = document.createElement('a');
    editBtn.className = 'btn btn-edit';
    editBtn.href = '/announcement-edit.html?id=' + encodeURIComponent(_announcement.id);
    editBtn.textContent = '수정';
    right.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-delete';
    delBtn.textContent = '삭제';
    delBtn.addEventListener('click', handleDelete);
    right.appendChild(delBtn);
  }

  actions.appendChild(left);
  actions.appendChild(right);
  article.appendChild(actions);

  root.appendChild(article);
}

async function handleDelete() {
  if (!confirm('이 공지사항을 정말 삭제하시겠습니까?')) return;
  try {
    await deleteAnnouncement(_announcement.id);
    alert('삭제되었습니다.');
    location.href = '/announcements.html';
  } catch (err) {
    alert('삭제에 실패했습니다: ' + err.message);
  }
}

async function init() {
  const id = getId();
  if (!id) {
    document.getElementById('content').innerHTML = '<div class="error">잘못된 접근입니다.</div>';
    return;
  }

  _currentUser = await getCurrentUserOptional();

  try {
    _announcement = await getAnnouncement(id);
    render();
  } catch (err) {
    const root = document.getElementById('content');
    root.textContent = '';
    const div = document.createElement('div');
    div.className = 'error';
    div.textContent = '공지사항을 불러오지 못했습니다: ' + err.message;
    root.appendChild(div);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
