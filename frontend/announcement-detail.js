/**
 * 공지사항 상세 페이지 (wz 디자인 시스템).
 * - URL: ?id=<announcementId>
 * - ADMIN 일 때만 [수정/삭제] 버튼 노출.
 * - content 는 textContent 로 렌더링(XSS 방어). CSS white-space:pre-wrap 로 줄바꿈 보존.
 * - 데이터는 GET /api/announcements/:id, 삭제는 DELETE /api/announcements/:id.
 */
(function () {
  const W = window.WZ;

  let _me = null;
  let _announcement = null;

  function getId() {
    const params = new URLSearchParams(location.search);
    const raw = (params.get('id') || '').trim();
    return raw || null;
  }

  function formatDateTime(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function showState(message, isError) {
    const root = document.getElementById('content');
    root.textContent = '';
    const div = W.el('div', { class: 'anc-state' + (isError ? ' anc-state--error' : '') });
    div.textContent = message;
    root.appendChild(div);
  }

  function render() {
    const root = document.getElementById('content');
    root.textContent = '';

    root.appendChild(W.el('span', { class: 'wzc-doc__eyebrow' }, '공지사항'));

    const title = W.el('h1', { class: 'wzc-doc__title' });
    title.textContent = _announcement.title;
    root.appendChild(title);

    const meta = W.el('p', { class: 'wzc-doc__meta anc-detail-meta' });
    const author = W.el('span', {});
    author.appendChild(document.createTextNode('작성자 '));
    author.appendChild(W.el('span', {}, _announcement.authorName || '관리자'));
    const date = W.el('span', {});
    date.appendChild(document.createTextNode('작성일 '));
    date.appendChild(W.el('span', {}, formatDateTime(_announcement.createdAt)));
    const view = W.el('span', {});
    view.appendChild(document.createTextNode('조회 '));
    view.appendChild(W.el('span', {}, String(_announcement.viewCount != null ? _announcement.viewCount : 0)));
    meta.appendChild(author);
    meta.appendChild(date);
    meta.appendChild(view);
    root.appendChild(meta);

    const body = W.el('div', { class: 'anc-detail-body' });
    body.textContent = _announcement.content;
    root.appendChild(body);

    const actions = W.el('div', { class: 'anc-detail-actions' });
    const left = W.el('div', { class: 'anc-detail-actions__group' });
    left.appendChild(W.el('a', { class: 'wz-btn wz-btn--ghost', href: '/announcements.html' }, '목록으로'));

    const right = W.el('div', { class: 'anc-detail-actions__group' });
    if (_me && String(_me.role || '').toUpperCase() === 'ADMIN') {
      right.appendChild(W.el('a', {
        class: 'wz-btn wz-btn--outline',
        href: '/announcement-edit.html?id=' + encodeURIComponent(_announcement.id),
      }, '수정'));
      const del = W.el('button', { class: 'wz-btn wz-btn--primary', type: 'button' }, '삭제');
      del.addEventListener('click', handleDelete);
      right.appendChild(del);
    }

    actions.appendChild(left);
    actions.appendChild(right);
    root.appendChild(actions);
  }

  async function handleDelete() {
    if (!confirm('이 공지사항을 정말 삭제하시겠습니까?')) return;
    try {
      await window.api.del('/announcements/' + encodeURIComponent(_announcement.id));
      location.href = '/announcements.html';
    } catch (err) {
      alert('삭제에 실패했습니다: ' + (err && err.message ? err.message : '알 수 없는 오류'));
    }
  }

  async function init() {
    const id = getId();
    if (!id) {
      showState('잘못된 접근입니다.', true);
      return;
    }

    _me = await W.fetchMe();

    try {
      _announcement = await window.api.get('/announcements/' + encodeURIComponent(id));
      render();
    } catch (err) {
      showState('공지사항을 불러오지 못했습니다: ' + (err && err.message ? err.message : '알 수 없는 오류'), true);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
