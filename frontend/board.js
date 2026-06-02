/* =====================================================================
 * 두띵 커뮤니티 게시판 — 목록/상세/작성(리치 에디터)/댓글.
 * 본문은 리치 HTML(콘텐츠블록) — funds 스토리와 동일 모델.
 * 보안: 작성 시 클라 DOMPurify(WZ_ALLOWED_TAGS) + 서버 sanitizeStoryHtml 재새니타이즈,
 *       렌더 시 DOMPurify 후 innerHTML(+링크 rel 보강). 댓글은 평문(textNode).
 * ===================================================================== */
(function () {
  var W = window.WZ;
  var api = window.api;
  var el = W.el, esc = W.esc;
  var root, me = null;

  var CAT_LABEL = { general: '일반', promo: '홍보', question: '질문', free: '자유', review: '후기' };
  var CATS = [{ k: '', label: '전체' }, { k: 'general', label: '일반' }, { k: 'promo', label: '홍보' }, { k: 'question', label: '질문' }, { k: 'free', label: '자유' }, { k: 'review', label: '후기' }];
  var IMG_MAX = 8 * 1024 * 1024;
  var URL_RE = /(https?:\/\/[^\s<]+)/g;

  /* ---- 새니타이즈 (funds 스토리와 동일 화이트리스트, 서버가 최종 재검증) ---- */
  var ALLOWED_TAGS = ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'mark', 'span', 'div', 'ul', 'ol', 'li', 'blockquote', 'hr', 'a', 'img', 'figure', 'figcaption', 'iframe'];
  var ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height', 'style', 'class', 'allow', 'allowfullscreen', 'frameborder'];
  var IFRAME_OK = /^https:\/\/(www\.)?(youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/)/i;
  var _hooked = false;
  function sanitize(html) {
    if (!window.DOMPurify) return ''; // 안전측: 새니타이저 없으면 비움(board.html 에서 로드됨)
    if (!_hooked) {
      _hooked = true;
      window.DOMPurify.addHook('uponSanitizeElement', function (node, data) {
        if (data.tagName === 'iframe') {
          var src = node.getAttribute && node.getAttribute('src');
          if (!src || !IFRAME_OK.test(src)) node.parentNode && node.parentNode.removeChild(node);
        }
      });
    }
    return window.DOMPurify.sanitize(String(html || ''), { ALLOWED_TAGS: ALLOWED_TAGS, ALLOWED_ATTR: ALLOWED_ATTR, ADD_ATTR: ['target'] });
  }
  function htmlText(html) {
    var d = document.createElement('div'); d.innerHTML = sanitize(html);
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function firstHtml(post) {
    var b = (post && post.contentBlocks || []).find(function (x) { return x && x.type === 'html' && x.html; });
    return b ? b.html : '';
  }

  function run() {
    root = document.getElementById('board-root');
    if (!root || !W) return;
    W.fetchMe().then(function (m) { me = m; route(); });
    window.addEventListener('popstate', route);
  }
  function route() {
    var id = new URLSearchParams(location.search).get('post');
    if (id) renderDetail(id); else renderList();
  }

  /* ---------------- 목록 ---------------- */
  function renderList() {
    var cur = new URLSearchParams(location.search).get('category') || '';
    root.replaceChildren();
    var head = el('div', { class: 'bd-head' },
      el('h1', { class: 'bd-head__title' }, '게시판'),
      el('p', { class: 'bd-head__sub' }, '자유롭게 글을 남기고, 내 프로젝트나 소식을 홍보해 보세요.'));
    var writeBtn = el('button', { class: 'wz-btn wz-btn--primary bd-write', type: 'button' }, '글쓰기');
    writeBtn.addEventListener('click', function () {
      if (!me) { location.href = '/login.html?return=' + encodeURIComponent('/board.html'); return; }
      openCompose();
    });
    head.appendChild(writeBtn);
    root.appendChild(head);

    var tabs = el('div', { class: 'bd-tabs' });
    CATS.forEach(function (c) {
      var a = el('button', { class: 'bd-tab' + (c.k === cur ? ' is-on' : ''), type: 'button' }, c.label);
      a.addEventListener('click', function () { history.pushState({}, '', '/board.html' + (c.k ? '?category=' + c.k : '')); renderList(); });
      tabs.appendChild(a);
    });
    root.appendChild(tabs);

    var slot = el('div', { class: 'bd-list' }); root.appendChild(slot);
    slot.appendChild(el('div', { class: 'bd-loading' }, '불러오는 중…'));
    api.get('/board/posts' + (cur ? '?category=' + encodeURIComponent(cur) : ''))
      .then(function (res) {
        var items = (res && res.items) || [];
        slot.replaceChildren();
        if (!items.length) { slot.appendChild(el('div', { class: 'bd-empty' }, '아직 글이 없어요. 첫 글을 남겨보세요!')); return; }
        items.forEach(function (p) { slot.appendChild(postCard(p)); });
      })
      .catch(function () { slot.replaceChildren(el('div', { class: 'bd-empty' }, '목록을 불러오지 못했습니다.')); });
  }

  function postCard(p) {
    var card = el('a', { class: 'bd-card', href: '/board.html?post=' + encodeURIComponent(p.id) });
    card.appendChild(el('div', { class: 'bd-card__top' }, catBadge(p.category), el('span', { class: 'bd-card__title' }, p.title || '(제목 없음)')));
    var snip = htmlText(firstHtml(p)) || (p.body || '');
    if (snip) card.appendChild(el('p', { class: 'bd-card__snippet' }, snip.length > 120 ? snip.slice(0, 120) + '…' : snip));
    var meta = el('div', { class: 'bd-card__meta' });
    meta.appendChild(authorChip(p.author));
    meta.appendChild(el('span', { class: 'bd-card__dot' }, '·'));
    meta.appendChild(el('span', {}, fmtTime(p.createdAt)));
    if (p.commentCount) { meta.appendChild(el('span', { class: 'bd-card__dot' }, '·')); meta.appendChild(el('span', {}, '댓글 ' + p.commentCount)); }
    card.appendChild(meta);
    return card;
  }

  /* ---------------- 상세 ---------------- */
  function renderDetail(id) {
    root.replaceChildren(el('div', { class: 'bd-loading' }, '불러오는 중…'));
    api.get('/board/posts/' + encodeURIComponent(id))
      .then(function (p) {
        root.replaceChildren();
        root.appendChild(el('a', { class: 'bd-back', href: '/board.html' }, '← 목록'));
        var art = el('article', { class: 'bd-post' });
        art.appendChild(el('div', { class: 'bd-post__top' }, catBadge(p.category), el('h1', { class: 'bd-post__title' }, p.title || '(제목 없음)')));
        var meta = el('div', { class: 'bd-post__meta' });
        meta.appendChild(authorChip(p.author));
        meta.appendChild(el('span', { class: 'bd-card__dot' }, '·'));
        meta.appendChild(el('span', {}, fmtTime(p.createdAt)));
        if (canModify(p.author)) {
          var del = el('button', { class: 'bd-del', type: 'button' }, '삭제');
          del.addEventListener('click', function () {
            if (!confirm('이 글을 삭제할까요?')) return;
            del.disabled = true;
            api.del('/board/posts/' + encodeURIComponent(p.id)).then(function () { location.href = '/board.html'; }).catch(function () { del.disabled = false; toast('삭제에 실패했습니다'); });
          });
          meta.appendChild(del);
        }
        art.appendChild(meta);
        art.appendChild(renderBody(p));
        root.appendChild(art);
        renderComments(p, root);
      })
      .catch(function (e) {
        root.replaceChildren(el('div', { class: 'bd-empty' }, (e && e.status === 404) ? '삭제되었거나 없는 글입니다.' : '글을 불러오지 못했습니다.'), el('a', { class: 'bd-back', href: '/board.html' }, '← 목록'));
      });
  }

  // 본문 렌더: 리치(contentBlocks html) 우선 → DOMPurify 후 innerHTML + 링크/유튜브 안전 보강.
  // 레거시(평문 body + media 칩)는 폴백.
  function renderBody(p) {
    var html = firstHtml(p);
    var box = el('div', { class: 'bd-post__body' });
    if (html) {
      box.innerHTML = sanitize(html);
      box.querySelectorAll('a[href]').forEach(function (a) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); });
      box.querySelectorAll('iframe').forEach(function (f) { f.setAttribute('loading', 'lazy'); var w = el('div', { class: 'bd-embed' }); f.parentNode.insertBefore(w, f); w.appendChild(f); });
      box.querySelectorAll('img').forEach(function (im) { im.setAttribute('loading', 'lazy'); });
      return box;
    }
    // 레거시 평문 + 미디어
    if (p.body) linkify(box, p.body);
    (p.media || []).forEach(function (m) { var n = renderMedia(m); if (n) { var wrap = el('div', { class: 'bd-media' }); wrap.appendChild(n); box.appendChild(wrap); } });
    return box;
  }

  /* ---------------- 댓글 ---------------- */
  function renderComments(post, container) {
    var sec = el('section', { class: 'bd-comments' });
    sec.appendChild(el('h2', { class: 'bd-comments__title' }, '댓글'));
    var list = el('div', { class: 'bd-comments__list' }); sec.appendChild(list);
    container.appendChild(sec);
    function load() {
      list.replaceChildren(el('div', { class: 'bd-loading' }, '댓글 불러오는 중…'));
      api.get('/board/posts/' + encodeURIComponent(post.id) + '/comments').then(function (res) {
        var items = (res && res.items) || [];
        list.replaceChildren();
        if (!items.length) { list.appendChild(el('p', { class: 'bd-comments__empty' }, '첫 댓글을 남겨보세요.')); return; }
        items.forEach(function (c) { list.appendChild(commentRow(c, load)); });
      }).catch(function () { list.replaceChildren(el('p', { class: 'bd-comments__empty' }, '댓글을 불러오지 못했습니다.')); });
    }
    load();
    if (me) {
      var form = el('div', { class: 'bd-cform' });
      var ta = el('textarea', { class: 'bd-cform__input', rows: '2', placeholder: '댓글을 입력하세요', maxlength: '2000' });
      var send = el('button', { class: 'wz-btn wz-btn--primary', type: 'button' }, '등록');
      send.addEventListener('click', function () {
        var v = ta.value.trim(); if (!v) return; send.disabled = true;
        api.post('/board/posts/' + encodeURIComponent(post.id) + '/comments', { body: v }).then(function () { ta.value = ''; send.disabled = false; load(); }).catch(function () { send.disabled = false; toast('댓글 등록에 실패했습니다'); });
      });
      form.append(ta, send); sec.appendChild(form);
    } else {
      sec.appendChild(el('a', { class: 'bd-cform__login', href: '/login.html?return=' + encodeURIComponent('/board.html?post=' + post.id) }, '로그인하고 댓글 남기기'));
    }
  }
  function commentRow(c, reload) {
    var row = el('div', { class: 'bd-comment' });
    row.appendChild(authorChip(c.author));
    var body = el('div', { class: 'bd-comment__body' }); linkify(body, c.body); row.appendChild(body);
    var meta = el('div', { class: 'bd-comment__meta' }, el('span', {}, fmtTime(c.createdAt)));
    if (canModify(c.author)) {
      var del = el('button', { class: 'bd-comment__del', type: 'button' }, '삭제');
      del.addEventListener('click', function () { del.disabled = true; api.del('/board/comments/' + encodeURIComponent(c.id)).then(reload).catch(function () { del.disabled = false; toast('삭제 실패'); }); });
      meta.appendChild(del);
    }
    row.appendChild(meta); return row;
  }

  /* ---------------- 리치 에디터 ---------------- */
  function richEditor() {
    var bar = el('div', { class: 'bd-rte__bar' });
    var area = el('div', { class: 'bd-rte__area', contenteditable: 'true', 'data-ph': '내용을 입력하세요. 서식·사진·유튜브를 넣을 수 있어요.' });
    var fileImg = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    fileImg.addEventListener('change', function () {
      var f = fileImg.files && fileImg.files[0]; fileImg.value = '';
      if (!f) return;
      if (f.size > IMG_MAX) { toast('사진이 너무 큽니다(최대 8MB)'); return; }
      var r = new FileReader();
      r.onload = function () { restore(); insertNode(el('img', { src: String(r.result), alt: '' })); };
      r.readAsDataURL(f);
    });

    var savedRange = null;
    function save() { var s = window.getSelection(); if (s && s.rangeCount && area.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); }
    function restore() { area.focus(); if (savedRange) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); } }
    area.addEventListener('keyup', save); area.addEventListener('mouseup', save); area.addEventListener('blur', save);

    function exec(c, val) { restore(); document.execCommand(c, false, val || null); save(); }
    function insertNode(node) {
      restore();
      var s = window.getSelection();
      if (s && s.rangeCount) { var r = s.getRangeAt(0); r.deleteContents(); r.insertNode(node); r.setStartAfter(node); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
      else { area.appendChild(node); }
      save();
    }
    function tb(label, title, fn) { var b = el('button', { class: 'bd-rte__b', type: 'button', title: title }, label); b.addEventListener('mousedown', function (e) { e.preventDefault(); fn(); }); return b; }

    bar.append(
      tb('B', '굵게', function () { exec('bold'); }),
      tb('I', '기울임', function () { exec('italic'); }),
      tb('U', '밑줄', function () { exec('underline'); }),
      tb('S', '취소선', function () { exec('strikeThrough'); }),
      tb('H', '제목', function () { exec('formatBlock', 'H3'); }),
      tb('❝', '인용', function () { exec('formatBlock', 'BLOCKQUOTE'); }),
      tb('• 목록', '글머리 목록', function () { exec('insertUnorderedList'); }),
      tb('1. 목록', '번호 목록', function () { exec('insertOrderedList'); }),
      tb('링크', '링크', function () {
        save(); var u = window.prompt('링크 URL'); if (!u) return; u = u.trim(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u; exec('createLink', u);
      }),
      tb('사진', '사진 삽입', function () { save(); fileImg.click(); }),
      tb('유튜브', '유튜브 삽입', function () {
        save(); var u = window.prompt('유튜브 영상 URL'); if (!u) return;
        var id = ytId(u.trim()); if (!id) { toast('유효한 유튜브 URL이 아니에요'); return; }
        var box = el('div', { class: 'bd-embed', contenteditable: 'false' });
        box.appendChild(el('iframe', { src: 'https://www.youtube-nocookie.com/embed/' + id, frameborder: '0', allowfullscreen: 'true', allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture' }));
        insertNode(box); insertNode(el('p', {}, el('br', {})));
      }),
      tb('지우기', '서식 지우기', function () { exec('removeFormat'); }),
      fileImg);

    // 붙여넣기: 이미지는 업로드, 그 외는 평문으로(서식 오염 방지)
    area.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (items) { for (var i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') === 0) { var f = items[i].getAsFile(); if (f && f.size <= IMG_MAX) { e.preventDefault(); var r = new FileReader(); r.onload = function () { insertNode(el('img', { src: String(r.result), alt: '' })); }; r.readAsDataURL(f); return; } } } }
      e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData('text'); document.execCommand('insertText', false, t);
    });

    return { bar: bar, area: area, getHtml: function () { return sanitize(area.innerHTML); } };
  }

  function ytId(s) {
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    var m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  /* ---------------- 작성 ---------------- */
  function openCompose() {
    var back = el('div', { class: 'bd-modal' });
    var panel = el('div', { class: 'bd-modal__panel bd-modal__panel--lg' });
    panel.appendChild(el('div', { class: 'bd-modal__head' }, el('strong', {}, '글쓰기'),
      (function () { var x = el('button', { class: 'bd-modal__x', type: 'button', 'aria-label': '닫기' }, '×'); x.addEventListener('click', close); return x; })()));

    var catSel = el('select', { class: 'bd-input' });
    [['general', '일반'], ['promo', '홍보'], ['question', '질문'], ['free', '자유'], ['review', '후기']].forEach(function (o) { catSel.appendChild(el('option', { value: o[0] }, o[1])); });
    var titleIn = el('input', { class: 'bd-input', type: 'text', maxlength: '120', placeholder: '제목' });
    var ed = richEditor();

    panel.append(el('label', { class: 'bd-flabel' }, '카테고리'), catSel,
      el('label', { class: 'bd-flabel' }, '제목'), titleIn,
      el('label', { class: 'bd-flabel' }, '내용'),
      (function () { var w = el('div', { class: 'bd-rte' }); w.append(ed.bar, ed.area); return w; })());

    var msg = el('p', { class: 'bd-modal__msg' });
    var submit = el('button', { class: 'wz-btn wz-btn--primary bd-modal__submit', type: 'button' }, '등록');
    submit.addEventListener('click', function () {
      var title = titleIn.value.trim();
      var html = ed.getHtml();
      var textLen = htmlText(html).length;
      var hasMedia = /<(img|iframe)\b/i.test(html);
      if (!title) { msg.textContent = '제목을 입력해 주세요'; return; }
      if (!textLen && !hasMedia) { msg.textContent = '내용을 입력해 주세요'; return; }
      submit.disabled = true; submit.textContent = '등록 중…'; msg.textContent = '';
      api.post('/board/posts', { category: catSel.value, title: title, contentBlocks: [{ type: 'html', html: html }] })
        .then(function (p) { close(); location.href = '/board.html?post=' + encodeURIComponent(p.id); })
        .catch(function (e) { submit.disabled = false; submit.textContent = '등록'; msg.textContent = (e && e.message) || '등록에 실패했습니다'; });
    });
    panel.append(msg, submit);

    function close() { back.remove(); document.body.style.overflow = ''; }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.appendChild(panel); document.body.appendChild(back); document.body.style.overflow = 'hidden';
    titleIn.focus();
  }

  /* ---------------- 공통 ---------------- */
  function renderMedia(m) {
    if (!m || !m.type) return null;
    if (m.type === 'image') return el('img', { class: 'bd-media__img', src: m.url, alt: '', loading: 'lazy' });
    if (m.type === 'video') return el('video', { class: 'bd-media__video', src: m.url, controls: 'controls', preload: 'metadata' });
    if (m.type === 'youtube' && m.youtubeId) { var box = el('div', { class: 'bd-media__yt' }); box.appendChild(el('iframe', { src: 'https://www.youtube-nocookie.com/embed/' + m.youtubeId, title: '유튜브', frameborder: '0', allowfullscreen: 'true', loading: 'lazy', allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture' })); return box; }
    if (m.type === 'link') return el('a', { class: 'bd-media__link', href: m.url, target: '_blank', rel: 'noopener noreferrer' }, m.title || m.url);
    return null;
  }
  function authorChip(a) {
    a = a || {};
    var href = a.slug ? ('/maker.html?slug=' + encodeURIComponent(a.slug)) : (a.id ? ('/maker.html?id=' + encodeURIComponent(a.id)) : null);
    var wrap = el(href ? 'a' : 'span', href ? { class: 'bd-author', href: href } : { class: 'bd-author' });
    var av = el('span', { class: 'bd-author__av' });
    if (a.picture) av.appendChild(el('img', { src: a.picture, alt: '', loading: 'lazy' }));
    else av.textContent = (a.nickname || a.name || '익').slice(0, 1);
    wrap.append(av, el('span', { class: 'bd-author__name' }, a.nickname || a.name || '익명'));
    return wrap;
  }
  function catBadge(cat) { return el('span', { class: 'bd-cat bd-cat--' + (cat || 'general') }, CAT_LABEL[cat] || '일반'); }
  function canModify(author) { return !!me && author && (me.id === author.id || String(me.role || '').toUpperCase() === 'ADMIN'); }
  function linkify(container, text) {
    String(text || '').split('\n').forEach(function (line, li) {
      if (li > 0) container.appendChild(el('br', {}));
      var last = 0, m; URL_RE.lastIndex = 0;
      while ((m = URL_RE.exec(line)) !== null) {
        if (m.index > last) container.appendChild(document.createTextNode(line.slice(last, m.index)));
        container.appendChild(el('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer', class: 'bd-inlink' }, m[0]));
        last = m.index + m[0].length;
      }
      if (last < line.length) container.appendChild(document.createTextNode(line.slice(last)));
    });
  }
  function fmtTime(iso) {
    var d = new Date(iso); if (isNaN(d.getTime())) return '';
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return '방금'; if (s < 3600) return Math.floor(s / 60) + '분 전';
    if (s < 86400) return Math.floor(s / 3600) + '시간 전'; if (s < 7 * 86400) return Math.floor(s / 86400) + '일 전';
    return (d.getMonth() + 1) + '.' + d.getDate();
  }
  var toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = el('div', { class: 'bd-toast' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('is-on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
