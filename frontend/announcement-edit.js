/**
 * 공지사항 작성/수정 페이지 (관리자 전용, wz 디자인 시스템).
 * - URL: /announcement-edit.html              -> 새 글 작성 (POST /api/announcements)
 * - URL: /announcement-edit.html?id=<id>      -> 수정 모드 (PUT /api/announcements/:id)
 *
 * 참고: window.api 는 put 메서드가 없어 post 래퍼에 { method: 'PUT' } 오버라이드로 호출.
 *
 * 비-ADMIN 접근 시 차단.
 */
(function () {
  const W = window.WZ;
  const TITLE_MAX = 200;
  const CONTENT_MAX = 30000;

  let _editId = null;

  function getEditId() {
    const params = new URLSearchParams(location.search);
    const raw = (params.get('id') || '').trim();
    return raw || null;
  }

  function showState(message, isError) {
    const root = document.getElementById('root');
    root.textContent = '';
    const div = W.el('div', { class: 'ance-state' + (isError ? ' ance-state--error' : '') });
    div.textContent = message;
    root.appendChild(div);
  }

  function buildForm(initialData) {
    const root = document.getElementById('root');
    root.textContent = '';

    const panel = W.el('div', { class: 'ance-panel' });

    /* 제목 */
    const f1 = W.el('div', { class: 'ance-field' });
    const l1 = W.el('label', { for: 'titleInput' }, '제목');
    const input = W.el('input', {
      type: 'text', id: 'titleInput', maxlength: String(TITLE_MAX),
      placeholder: '공지사항 제목을 입력하세요',
    });
    input.value = (initialData && initialData.title) || '';
    const titleCount = W.el('div', { class: 'ance-count', id: 'titleCount' });
    input.addEventListener('input', () => {
      titleCount.textContent = input.value.length + ' / ' + TITLE_MAX;
    });
    f1.append(l1, input, titleCount);

    /* 내용 */
    const f2 = W.el('div', { class: 'ance-field' });
    const l2 = W.el('label', { for: 'contentInput' }, '내용');
    const textarea = W.el('textarea', {
      id: 'contentInput', maxlength: String(CONTENT_MAX),
      placeholder: '공지사항 내용을 입력하세요. 줄바꿈은 그대로 표시됩니다.',
    });
    textarea.value = (initialData && initialData.content) || '';
    const contentCount = W.el('div', { class: 'ance-count', id: 'contentCount' });
    textarea.addEventListener('input', () => {
      contentCount.textContent = textarea.value.length + ' / ' + CONTENT_MAX;
    });
    f2.append(l2, textarea, contentCount);

    panel.append(f1, f2);
    root.appendChild(panel);

    /* 액션 */
    const actions = W.el('div', { class: 'ance-actions' });
    const cancel = W.el('a', {
      class: 'wz-btn wz-btn--ghost',
      href: _editId ? '/announcement-detail.html?id=' + encodeURIComponent(_editId) : '/announcements.html',
    }, '취소');
    const save = W.el('button', { class: 'wz-btn wz-btn--primary', id: 'saveBtn', type: 'button' }, _editId ? '수정' : '저장');
    save.addEventListener('click', handleSave);
    actions.append(cancel, save);
    root.appendChild(actions);

    /* 초기 카운트 */
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
      let result;
      if (_editId) {
        // 서버 라우트는 PUT /api/announcements/:id — post 래퍼에 method 오버라이드로 PUT 전송
        result = await window.api.post('/announcements/' + encodeURIComponent(_editId), { title, content }, { method: 'PUT' });
      } else {
        result = await window.api.post('/announcements', { title, content });
      }
      const newId = (result && result.id != null) ? result.id : _editId;
      location.href = '/announcement-detail.html?id=' + encodeURIComponent(newId);
    } catch (err) {
      alert('저장에 실패했습니다: ' + (err && err.message ? err.message : '알 수 없는 오류'));
      btn.disabled = false;
      btn.textContent = _editId ? '수정' : '저장';
    }
  }

  function setPageTitle(text) {
    const t = document.getElementById('pageTitle');
    if (t) t.textContent = text;
    document.title = text + ' · 두띵 관리자';
  }

  async function init() {
    const me = await W.fetchMe();
    if (!me) {
      showState('로그인이 필요합니다. 잠시 후 로그인 페이지로 이동합니다.', true);
      setTimeout(() => { location.href = '/login.html'; }, 1200);
      return;
    }
    if (String(me.role || '').toUpperCase() !== 'ADMIN') {
      showState('관리자만 접근할 수 있습니다.', true);
      return;
    }

    _editId = getEditId();

    if (_editId) {
      setPageTitle('공지사항 수정');
      try {
        const existing = await window.api.get('/announcements/' + encodeURIComponent(_editId));
        buildForm({ title: existing.title, content: existing.content });
      } catch (err) {
        showState('공지사항을 불러오지 못했습니다: ' + (err && err.message ? err.message : '알 수 없는 오류'), true);
      }
    } else {
      setPageTitle('공지사항 작성');
      buildForm(null);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
