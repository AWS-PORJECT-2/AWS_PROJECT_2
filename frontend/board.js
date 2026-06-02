/* =====================================================================
 * 두띵 커뮤니티 게시판 — 목록/상세/작성/댓글.
 * 보안: 본문·댓글은 평문(텍스트노드 + 자동링크)로만 렌더 → HTML 주입 불가.
 *       미디어는 서버 검증된 image/video/youtube/link 만 구조적으로 렌더.
 * ===================================================================== */
(function () {
  var W = window.WZ;
  var api = window.api;
  var el = W.el, esc = W.esc;
  var root, me = null;

  var CATS = [
    { k: '', label: '전체' }, { k: 'general', label: '일반' }, { k: 'promo', label: '홍보' },
    { k: 'question', label: '질문' }, { k: 'free', label: '자유' }, { k: 'review', label: '후기' },
  ];
  var CAT_LABEL = { general: '일반', promo: '홍보', question: '질문', free: '자유', review: '후기' };
  var IMG_MAX = 8 * 1024 * 1024;   // 8MB (서버 data URL 상한과 일치)
  var URL_RE = /(https?:\/\/[^\s<]+)/g;

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
    var q = new URLSearchParams(location.search);
    var cur = q.get('category') || '';
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
      a.addEventListener('click', function () {
        var u = '/board.html' + (c.k ? '?category=' + c.k : '');
        history.pushState({}, '', u); renderList();
      });
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
    var top = el('div', { class: 'bd-card__top' }, catBadge(p.category), el('span', { class: 'bd-card__title' }, p.title || '(제목 없음)'));
    card.appendChild(top);
    if (p.body) card.appendChild(el('p', { class: 'bd-card__snippet' }, snippet(p.body, 120)));
    var meta = el('div', { class: 'bd-card__meta' });
    meta.appendChild(authorChip(p.author));
    meta.appendChild(el('span', { class: 'bd-card__dot' }, '·'));
    meta.appendChild(el('span', {}, fmtTime(p.createdAt)));
    if (p.commentCount) { meta.appendChild(el('span', { class: 'bd-card__dot' }, '·')); meta.appendChild(el('span', {}, '댓글 ' + p.commentCount)); }
    if (hasMedia(p)) { meta.appendChild(el('span', { class: 'bd-card__dot' }, '·')); meta.appendChild(el('span', {}, '미디어')); }
    card.appendChild(meta);
    return card;
  }

  /* ---------------- 상세 ---------------- */
  function renderDetail(id) {
    root.replaceChildren(el('div', { class: 'bd-loading' }, '불러오는 중…'));
    api.get('/board/posts/' + encodeURIComponent(id))
      .then(function (p) {
        root.replaceChildren();
        var back = el('a', { class: 'bd-back', href: '/board.html' }, '← 목록');
        root.appendChild(back);

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
            api.del('/board/posts/' + encodeURIComponent(p.id)).then(function () { location.href = '/board.html'; })
              .catch(function () { del.disabled = false; toast('삭제에 실패했습니다'); });
          });
          meta.appendChild(del);
        }
        art.appendChild(meta);

        if (p.body) { var bodyEl = el('div', { class: 'bd-post__body' }); linkify(bodyEl, p.body); art.appendChild(bodyEl); }
        (p.media || []).forEach(function (m) { var n = renderMedia(m); if (n) { var wrap = el('div', { class: 'bd-media' }); wrap.appendChild(n); art.appendChild(wrap); } });
        root.appendChild(art);

        renderComments(p, root);
      })
      .catch(function (e) {
        root.replaceChildren(el('div', { class: 'bd-empty' }, (e && e.status === 404) ? '삭제되었거나 없는 글입니다.' : '글을 불러오지 못했습니다.'),
          el('a', { class: 'bd-back', href: '/board.html' }, '← 목록'));
      });
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
        var v = ta.value.trim(); if (!v) return;
        send.disabled = true;
        api.post('/board/posts/' + encodeURIComponent(post.id) + '/comments', { body: v })
          .then(function () { ta.value = ''; send.disabled = false; load(); })
          .catch(function () { send.disabled = false; toast('댓글 등록에 실패했습니다'); });
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
      del.addEventListener('click', function () {
        del.disabled = true;
        api.del('/board/comments/' + encodeURIComponent(c.id)).then(reload).catch(function () { del.disabled = false; toast('삭제 실패'); });
      });
      meta.appendChild(del);
    }
    row.appendChild(meta);
    return row;
  }

  /* ---------------- 작성(모달) ---------------- */
  function openCompose() {
    var media = [];
    var back = el('div', { class: 'bd-modal' });
    var panel = el('div', { class: 'bd-modal__panel' });
    panel.appendChild(el('div', { class: 'bd-modal__head' }, el('strong', {}, '글쓰기'),
      (function () { var x = el('button', { class: 'bd-modal__x', type: 'button', 'aria-label': '닫기' }, '×'); x.addEventListener('click', close); return x; })()));

    var catSel = el('select', { class: 'bd-input' });
    [['general', '일반'], ['promo', '홍보'], ['question', '질문'], ['free', '자유'], ['review', '후기']].forEach(function (o) {
      catSel.appendChild(el('option', { value: o[0] }, o[1]));
    });
    var titleIn = el('input', { class: 'bd-input', type: 'text', maxlength: '120', placeholder: '제목' });
    var bodyIn = el('textarea', { class: 'bd-input bd-input--body', rows: '7', maxlength: '5000', placeholder: '내용을 입력하세요. (URL 은 자동으로 링크됩니다)' });

    panel.append(el('label', { class: 'bd-flabel' }, '카테고리'), catSel,
      el('label', { class: 'bd-flabel' }, '제목'), titleIn,
      el('label', { class: 'bd-flabel' }, '내용'), bodyIn);

    // 미디어 추가
    var mediaWrap = el('div', { class: 'bd-mediaedit' });
    var bar = el('div', { class: 'bd-mediabar' });
    var fileImg = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    var fileVid = el('input', { type: 'file', accept: 'video/*', style: 'display:none' });
    fileImg.addEventListener('change', function () { pickFile(fileImg, 'image'); });
    fileVid.addEventListener('change', function () { pickFile(fileVid, 'video'); });
    function btn(label, fn) { var b = el('button', { class: 'wz-btn wz-btn--ghost bd-mbtn', type: 'button' }, label); b.addEventListener('click', fn); return b; }
    bar.append(
      btn('사진', function () { fileImg.click(); }),
      btn('영상', function () { fileVid.click(); }),
      btn('유튜브', function () { addUrlPrompt('youtube'); }),
      btn('링크', function () { addUrlPrompt('link'); }),
      fileImg, fileVid);
    var preview = el('div', { class: 'bd-mediaprev' });
    mediaWrap.append(bar, preview);
    panel.appendChild(mediaWrap);

    function pickFile(input, type) {
      var f = input.files && input.files[0]; input.value = '';
      if (!f) return;
      if (f.size > IMG_MAX) { toast('파일이 너무 큽니다(최대 8MB). 긴 영상은 유튜브 링크를 이용해 주세요.'); return; }
      var r = new FileReader();
      r.onload = function () { addMedia({ type: type, url: String(r.result) }); };
      r.readAsDataURL(f);
    }
    function addUrlPrompt(type) {
      var u = window.prompt(type === 'youtube' ? '유튜브 영상 URL 을 붙여넣으세요' : 'URL 을 입력하세요');
      if (!u) return; u = u.trim(); if (!u) return;
      if (type === 'link' && !/^https?:\/\//i.test(u)) u = 'https://' + u;
      addMedia(type === 'youtube' ? { type: 'youtube', url: u } : { type: 'link', url: u });
    }
    function addMedia(m) {
      if (media.length >= 10) { toast('미디어는 최대 10개입니다'); return; }
      media.push(m); drawPreview();
    }
    function drawPreview() {
      preview.replaceChildren();
      media.forEach(function (m, i) {
        var chip = el('div', { class: 'bd-mchip' });
        chip.appendChild(el('span', { class: 'bd-mchip__t' }, m.type === 'youtube' ? '유튜브' : (m.type === 'image' ? '사진' : (m.type === 'video' ? '영상' : '링크'))));
        chip.appendChild(el('span', { class: 'bd-mchip__v' }, snippet(m.url || '', 30)));
        var rm = el('button', { class: 'bd-mchip__x', type: 'button', 'aria-label': '제거' }, '×');
        rm.addEventListener('click', function () { media.splice(i, 1); drawPreview(); });
        chip.appendChild(rm); preview.appendChild(chip);
      });
    }

    var msg = el('p', { class: 'bd-modal__msg' });
    var submit = el('button', { class: 'wz-btn wz-btn--primary bd-modal__submit', type: 'button' }, '등록');
    submit.addEventListener('click', function () {
      var title = titleIn.value.trim();
      if (!title) { msg.textContent = '제목을 입력해 주세요'; return; }
      if (!bodyIn.value.trim() && !media.length) { msg.textContent = '내용 또는 사진·영상·링크를 추가해 주세요'; return; }
      submit.disabled = true; submit.textContent = '등록 중…'; msg.textContent = '';
      api.post('/board/posts', { category: catSel.value, title: title, body: bodyIn.value, media: media })
        .then(function (p) { close(); location.href = '/board.html?post=' + encodeURIComponent(p.id); })
        .catch(function (e) { submit.disabled = false; submit.textContent = '등록'; msg.textContent = (e && e.message) || '등록에 실패했습니다'; });
    });
    panel.append(msg, submit);

    function close() { back.remove(); document.body.style.overflow = ''; }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.appendChild(panel); document.body.appendChild(back); document.body.style.overflow = 'hidden';
    titleIn.focus();
  }

  /* ---------------- 렌더 헬퍼 ---------------- */
  function renderMedia(m) {
    if (!m || !m.type) return null;
    if (m.type === 'image') return el('img', { class: 'bd-media__img', src: m.url, alt: '', loading: 'lazy' });
    if (m.type === 'video') return el('video', { class: 'bd-media__video', src: m.url, controls: 'controls', preload: 'metadata' });
    if (m.type === 'youtube' && m.youtubeId) {
      var box = el('div', { class: 'bd-media__yt' });
      box.appendChild(el('iframe', {
        src: 'https://www.youtube.com/embed/' + m.youtubeId, title: '유튜브 영상', frameborder: '0', allowfullscreen: 'true',
        allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
      }));
      return box;
    }
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
  function hasMedia(p) { return p && Array.isArray(p.media) && p.media.length > 0; }
  function canModify(author) { return !!me && author && (me.id === author.id || String(me.role || '').toUpperCase() === 'ADMIN'); }
  function snippet(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

  // 본문/댓글: 텍스트노드 + URL 자동링크(innerHTML 미사용 → XSS 안전).
  function linkify(container, text) {
    String(text || '').split('\n').forEach(function (line, li) {
      if (li > 0) container.appendChild(el('br', {}));
      var last = 0, m;
      URL_RE.lastIndex = 0;
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
    if (s < 60) return '방금';
    if (s < 3600) return Math.floor(s / 60) + '분 전';
    if (s < 86400) return Math.floor(s / 3600) + '시간 전';
    if (s < 7 * 86400) return Math.floor(s / 86400) + '일 전';
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
