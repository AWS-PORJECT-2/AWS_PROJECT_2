/**
 * 공지사항 작성/수정 페이지 (관리자 전용)
 * - URL: /announcement-edit.html              → 새 글 작성
 * - URL: /announcement-edit.html?id=<id>      → 수정 모드
 *
 * 비-ADMIN 접근 시 차단.
 */

const TITLE_MAX = 200;
const CONTENT_MAX = 30000;

let _editId = null;

function getEditId() {
  const params = new URLSearchParams(location.search);
  const id = parseInt(params.get('id') || '', 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function renderForbidden(message) {
  const root = document.getElementById('root');
  root.textContent = '';
  const div = document.createElement('div');
  div.className = 'forbidden';
  div.textContent = message;
  root.appendChild(div);
}

function buildForm(initialData) {
  const root = document.getElementById('root');
  root.textContent = '';

  const panel = document.createElement('div');
  panel.className = 'panel';

  // 제목
  const f1 = document.createElement('div');
  f1.className = 'field';
  const l1 = document.createElement('label');
  l1.textContent = '제목';
  l1.htmlFor = 'titleInput';
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'titleInput';
  input.maxLength = TITLE_MAX;
  input.placeholder = '공지사항 제목을 입력하세요';
  input.value = (initialData && initialData.title) || '';
  const titleCount = document.createElement('div');
  titleCount.className = 'char-count';
  titleCount.id = 'titleCount';
  input.addEventListener('input', () => {
    titleCount.textContent = input.value.length + ' / ' + TITLE_MAX;
  });
  f1.appendChild(l1);
  f1.appendChild(input);
  f1.appendChild(titleCount);

  // 내용
  const f2 = document.createElement('div');
  f2.className = 'field';
  const l2 = document.createElement('label');
  l2.textContent = '내용';
  l2.htmlFor = 'contentInput';
  const textarea = document.createElement('textarea');
  textarea.id = 'contentInput';
  textarea.maxLength = CONTENT_MAX;
  textarea.placeholder = '공지사항 내용을 입력하세요. 줄바꿈은 그대로 표시됩니다.';
  textarea.value = (initialData && initialData.content) || '';
  const contentCount = document.createElement('div');
  contentCount.className = 'char-count';
  contentCount.id = 'contentCount';
  textarea.addEventListener('input', () => {
    contentCount.textContent = textarea.value.length + ' / ' + CONTENT_MAX;
  });
  f2.appendChild(l2);
  f2.appendChild(textarea);
  f2.appendChild(contentCount);

  panel.appendChild(f1);
  panel.appendChild(f2);
  root.appendChild(panel);

  // 액션
  const actions = document.createElement('div');
  actions.className = 'actions';
  const cancel = document.createElement('a');
  cancel.className = 'btn btn-secondary';
  cancel.href = _editId ? '/announcement-detail.html?id=' + _editId : '/announcements.html';
  cancel.textContent = '취소';
  const save = document.createElement('button');
  save.className = 'btn btn-primary';
  save.id = 'saveBtn';
  save.textContent = _editId ? '수정' : '저장';
  save.addEventListener('click', handleSave);

  actions.appendChild(cancel);
  actions.appendChild(save);
  root.appendChild(actions);

  // 초기 카운트
  titleCount.textContent = input.value.length + ' / ' + TITLE_MAX;
  contentCount.textContent = textarea.value.length + ' / ' + CONTENT_MAX;

  setTimeout(() => input.focus(), 0);
}

async function handleSave() {
  const title = document.getElementById('titleInput').value.trim();
  const content = document.getElementById('contentInput').value.trim();

  if (!title) { alert('제목을 입력해주세요.'); return; }
  if (!content) { alert('내용을 입력해주세요.'); return; }
  if (title.length > TITLE_MAX) { alert('제목이 너무 깁니다.'); return; }
  if (content.length > CONTENT_MAX) { alert('내용이 너무 깁니다.'); return; }

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    if (_editId) {
      const updated = await updateAnnouncement(_editId, { title, content });
      alert('수정되었습니다.');
      location.href = '/announcement-detail.html?id=' + updated.id;
    } else {
      const created = await createAnnouncement({ title, content });
      alert('등록되었습니다.');
      location.href = '/announcement-detail.html?id=' + created.id;
    }
  } catch (err) {
    alert('저장에 실패했습니다: ' + err.message);
    btn.disabled = false;
    btn.textContent = _editId ? '수정' : '저장';
  }
}

async function init() {
  // 권한 체크
  const user = await getCurrentUserOptional();
  if (!user) {
    renderForbidden('로그인이 필요합니다.');
    setTimeout(() => { location.href = '/'; }, 1200);
    return;
  }
  if (user.role !== 'ADMIN') {
    renderForbidden('관리자만 접근할 수 있습니다.');
    return;
  }

  _editId = getEditId();

  if (_editId) {
    document.getElementById('pageTitle').textContent = '공지사항 수정';
    const mt = document.getElementById('mobileTitle');
    if (mt) mt.textContent = '공지사항 수정';
    try {
      const existing = await getAnnouncement(_editId);
      buildForm({ title: existing.title, content: existing.content });
    } catch (err) {
      renderForbidden('공지사항을 불러오지 못했습니다: ' + err.message);
    }
  } else {
    buildForm(null);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
