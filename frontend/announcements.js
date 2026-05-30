/**
 * 공지사항 목록 페이지 (wz 디자인 시스템).
 * - 비로그인 사용자도 열람 가능 (WZ.fetchMe 는 401 시 null 반환).
 * - ADMIN 일 때만 [글쓰기] 버튼 노출.
 * - 데이터는 GET /api/announcements 에서만. 사용자/외부 데이터는 textContent 로 렌더(XSS 방어).
 */
(function () {
  const W = window.WZ;
  const PAGE_SIZE = 20;

  let _currentPage = 1;

  /* 캘린더 아이콘 (인라인 SVG, stroke=currentColor) */
  const ICON_DATE = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
  const ICON_VIEW = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

  function formatShortDate(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '.' + m + '.' + day;
  }

  function metaSpan(iconHtml, text, extraClass) {
    const span = W.el('span', extraClass ? { class: extraClass } : {});
    const ic = W.el('i', { html: iconHtml });
    span.appendChild(ic);
    span.appendChild(document.createTextNode(text));
    return span;
  }

  function renderItem(item, index, total, page) {
    const offset = (page - 1) * PAGE_SIZE;
    const no = total - offset - index;

    const li = W.el('li', { class: 'anc-item' });
    li.addEventListener('click', () => {
      location.href = '/announcement-detail.html?id=' + encodeURIComponent(item.id);
    });

    const top = W.el('div', { class: 'anc-item__top' });
    top.appendChild(W.el('span', { class: 'anc-item__no' }, String(no)));
    const title = W.el('span', { class: 'anc-item__title' });
    title.textContent = item.title;
    top.appendChild(title);

    const meta = W.el('div', { class: 'anc-item__meta' });
    meta.appendChild(metaSpan(ICON_USER, item.authorName || '관리자', 'anc-item__author'));
    meta.appendChild(metaSpan(ICON_DATE, formatShortDate(item.createdAt)));
    meta.appendChild(metaSpan(ICON_VIEW, String(item.viewCount != null ? item.viewCount : 0)));

    li.appendChild(top);
    li.appendChild(meta);
    return li;
  }

  function stateRow(cls, text) {
    const li = W.el('li', { class: cls });
    li.textContent = text;
    return li;
  }

  function renderPager(page, totalPages) {
    const bar = document.getElementById('ancPager');
    bar.textContent = '';
    if (totalPages <= 1) return;

    const prev = W.el('button', { class: 'anc-pager__btn', type: 'button', 'aria-label': '이전', html: W.ICON.chev });
    prev.querySelector('svg').style.transform = 'rotate(90deg)';
    prev.disabled = page <= 1;
    prev.addEventListener('click', () => { _currentPage = page - 1; loadList(); });
    bar.appendChild(prev);

    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let p = start; p <= end; p++) {
      const btn = W.el('button', { class: 'anc-pager__btn' + (p === page ? ' is-active' : ''), type: 'button' }, String(p));
      const target = p;
      btn.addEventListener('click', () => { _currentPage = target; loadList(); });
      bar.appendChild(btn);
    }

    const next = W.el('button', { class: 'anc-pager__btn', type: 'button', 'aria-label': '다음', html: W.ICON.chev });
    next.querySelector('svg').style.transform = 'rotate(-90deg)';
    next.disabled = page >= totalPages;
    next.addEventListener('click', () => { _currentPage = page + 1; loadList(); });
    bar.appendChild(next);
  }

  async function loadList() {
    const list = document.getElementById('ancList');
    list.textContent = '';
    list.appendChild(stateRow('anc-loading', '불러오는 중...'));

    try {
      const res = await window.api.get('/announcements?page=' + _currentPage + '&limit=' + PAGE_SIZE);
      const items = (res && res.items) || [];
      const total = (res && Number(res.total)) || 0;
      const page = (res && Number(res.page)) || _currentPage;
      const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 0;

      list.textContent = '';
      if (items.length === 0) {
        list.appendChild(stateRow('anc-empty', '등록된 공지사항이 없습니다.'));
        renderPager(1, 0);
        return;
      }

      items.forEach((item, index) => list.appendChild(renderItem(item, index, total, page)));
      renderPager(page, totalPages);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      list.textContent = '';
      list.appendChild(stateRow('anc-error', '공지사항을 불러오지 못했습니다: ' + (err && err.message ? err.message : '알 수 없는 오류')));
      renderPager(1, 0);
    }
  }

  async function init() {
    const me = await W.fetchMe();
    if (me && String(me.role || '').toUpperCase() === 'ADMIN') {
      document.getElementById('btnWrite').style.display = '';
    }
    loadList();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
