/* =====================================================================
 * 두띵 — 재사용 댓글 위젯 (펀딩 상세 / 메이커 프로필 공용). from scratch.
 *
 * 사용:
 *   window.WZComments.mount(container, { targetType: 'fund'|'profile', targetId: '<UUID>' });
 *
 * API 계약:
 *   GET    /api/comments?targetType=&targetId=  [soft-auth]
 *          → [{ id, targetType, targetId, userId, userName, userPicture, userSlug,
 *               content, parentId, createdAt, mine }]  (최신순)
 *   POST   /api/comments  body {targetType, targetId, content, parentId?}  (auth)
 *   DELETE /api/comments/:id  (작성자 본인만; 204)
 *
 * 규칙: Vanilla JS, 전역 window.WZ / window.api 재사용. 이모지 금지(아이콘은 SVG).
 *       사용자/외부 데이터는 textContent 또는 window.escapeHTML 로만 삽입(XSS 안전).
 *       색은 tokens.css 변수(보라 --c-primary-*). 다크모드 반응형 없음.
 * ===================================================================== */
(function () {
  var W = window.WZ || {};
  var el = (W && W.el) || function (tag, props) {
    // 폴백: WZ 미로드 시 안전한 최소 구현(원칙적으로 wz-core.js 가 먼저 로드됨)
    var n = document.createElement(tag);
    for (var k in (props || {})) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      var v = props[k];
      if (v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'onClick') n.addEventListener('click', v);
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var kids = arguments[i];
      if (!Array.isArray(kids)) kids = [kids];
      for (var j = 0; j < kids.length; j++) {
        var c = kids[j];
        if (c == null || c === false) continue;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return n;
  };

  var MAX_LEN = 1000;

  /* ---- 전용 아이콘 (SVG, stroke=currentColor) ---- */
  var IC = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z"/></svg>',
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17l-5-5 5-5"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
  };

  /* ---- 상대시간 (방금 / N분 전 / N시간 전 / N일 전 / YYYY.MM.DD) ---- */
  function relTime(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var diff = Date.now() - t;
    if (diff < 0) diff = 0;
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return '방금 전';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + '분 전';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + '시간 전';
    var day = Math.floor(hr / 24);
    if (day < 7) return day + '일 전';
    var d = new Date(t);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
  }

  /* ---- 아바타 노드(이미지 or 폴백 SVG) ---- */
  function avatar(c) {
    var av = el('div', { class: 'wzc-avatar' });
    if (c && c.userPicture) {
      var img = el('img', { src: c.userPicture, alt: c.userName || '', loading: 'lazy' });
      img.addEventListener('error', function () { img.remove(); av.innerHTML = IC.user; });
      av.appendChild(img);
    } else {
      av.innerHTML = IC.user;
    }
    return av;
  }

  /* ---- 이름 노드(slug 있으면 메이커 프로필 링크) ---- */
  function nameNode(c) {
    var nm = (c && c.userName) ? c.userName : '익명';
    if (c && c.userId) {
      var a = el('a', {
        class: 'wzc-name',
        href: '/maker.html?id=' + encodeURIComponent(c.userId),
      });
      a.textContent = nm; // 사용자 데이터 → textContent (XSS 안전)
      return a;
    }
    var span = el('span', { class: 'wzc-name' });
    span.textContent = nm;
    return span;
  }

  /* ===================================================================
   * mount: 컨테이너에 댓글 위젯 마운트
   * =================================================================== */
  function mount(container, opts) {
    if (!container) return;
    opts = opts || {};
    var targetType = opts.targetType;
    var targetId = opts.targetId;
    if (!targetType || targetId == null || targetId === '') return;
    targetId = String(targetId);

    // 컨테이너 초기화 후 골격 구성
    container.innerHTML = '';
    var root = el('section', { class: 'wzc', 'aria-label': '댓글' });

    var head = el('div', { class: 'wzc-head' });
    var hicon = el('span', { class: 'wzc-head__ic', html: IC.chat });
    var htitle = el('h3', { class: 'wzc-head__title' }, '댓글');
    var hcount = el('span', { class: 'wzc-head__count' }, '0');
    head.append(hicon, htitle, hcount);

    var composerSlot = el('div', { class: 'wzc-composer-slot' });
    var list = el('ul', { class: 'wzc-list' });

    root.append(head, composerSlot, list);
    container.appendChild(root);

    var state = { me: null, items: [], byParent: {}, top: [] };

    /* ---- 본문 로드 ---- */
    function load() {
      var q = '/comments?targetType=' + encodeURIComponent(targetType) +
        '&targetId=' + encodeURIComponent(targetId);
      window.api.get(q, { silentAuthFail: true })
        .then(function (data) {
          state.items = Array.isArray(data) ? data : [];
          render();
        })
        .catch(function () {
          // API 미응답/에러 → 조용히 빈 목록
          state.items = [];
          render();
        });
    }

    /* ---- 로그인 사용자 확인 후 작성창 구성 ---- */
    function setupComposer() {
      var fetchMe = (W && W.fetchMe) ? W.fetchMe : function () { return Promise.resolve(null); };
      fetchMe()
        .then(function (me) { state.me = me || null; })
        .catch(function () { state.me = null; })
        .then(function () { renderComposer(); render(); });
    }

    function renderComposer() {
      composerSlot.innerHTML = '';
      if (!state.me) {
        var notice = el('div', { class: 'wzc-loginnotice' });
        var txt = el('span', {}, '댓글을 남기려면 ');
        var link = el('a', { class: 'wzc-loginnotice__link', href: '/login.html' }, '로그인');
        var tail = el('span', {}, ' 해주세요.');
        notice.append(txt, link, tail);
        composerSlot.appendChild(notice);
        return;
      }
      composerSlot.appendChild(buildComposer(null, null));
    }

    /* ---- 작성/대댓글 입력창 빌더 ----
     * parentId: null = 최상위 작성, 값 = 해당 댓글에 대한 답글
     * onDone: 답글 인라인 닫기 콜백(있으면 호출)  */
    function buildComposer(parentId, onDone) {
      var form = el('form', { class: 'wzc-form' + (parentId ? ' wzc-form--reply' : '') });

      var av = avatar(state.me);

      var area = el('div', { class: 'wzc-form__area' });
      var ta = el('textarea', {
        class: 'wzc-form__input',
        rows: parentId ? '2' : '3',
        maxlength: String(MAX_LEN),
        placeholder: parentId ? '답글을 입력하세요' : '응원과 궁금한 점을 남겨보세요',
        'aria-label': parentId ? '답글 입력' : '댓글 입력',
      });

      var bottom = el('div', { class: 'wzc-form__bottom' });
      var counter = el('span', { class: 'wzc-form__counter' }, '0 / ' + MAX_LEN);
      var actions = el('div', { class: 'wzc-form__actions' });

      var cancelBtn = null;
      if (parentId) {
        cancelBtn = el('button', { type: 'button', class: 'wzc-btn wzc-btn--ghost' }, '취소');
        cancelBtn.addEventListener('click', function () { if (onDone) onDone(); });
        actions.appendChild(cancelBtn);
      }

      var submitBtn = el('button', { type: 'submit', class: 'wzc-btn wzc-btn--primary' });
      submitBtn.innerHTML = (parentId ? '' : IC.send) + '<span>' + (parentId ? '답글 등록' : '등록') + '</span>';
      submitBtn.disabled = true;
      actions.appendChild(submitBtn);

      bottom.append(counter, actions);
      area.append(ta, bottom);
      form.append(av, area);

      function refresh() {
        var len = ta.value.length;
        counter.textContent = len + ' / ' + MAX_LEN;
        submitBtn.disabled = (ta.value.trim().length === 0);
      }
      ta.addEventListener('input', refresh);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var content = ta.value.trim();
        if (!content) return;
        if (content.length > MAX_LEN) content = content.slice(0, MAX_LEN);
        submitBtn.disabled = true;
        var body = { targetType: targetType, targetId: targetId, content: content };
        if (parentId) body.parentId = parentId;
        window.api.post('/comments', body)
          .then(function (created) {
            ta.value = '';
            refresh();
            if (created && created.id != null) {
              // 새 댓글을 상태에 반영(최신순: 최상위는 앞, 대댓글은 부모 아래)
              state.items.unshift(created);
              render();
            } else {
              load();
            }
            if (onDone) onDone();
          })
          .catch(function () {
            submitBtn.disabled = false;
            // 조용히 실패(상세 에러 노출 안 함). 입력값은 보존.
          });
      });

      return form;
    }

    /* ---- 단일 댓글 노드 ---- */
    function commentNode(c, isReply) {
      var li = el('li', { class: 'wzc-item' + (isReply ? ' wzc-item--reply' : '') });

      var av = avatar(c);

      var body = el('div', { class: 'wzc-body' });

      var meta = el('div', { class: 'wzc-meta' });
      meta.appendChild(nameNode(c));
      var time = el('time', { class: 'wzc-time' }, relTime(c.createdAt));
      if (c.createdAt) time.setAttribute('datetime', String(c.createdAt));
      meta.appendChild(time);

      var text = el('div', { class: 'wzc-text' });
      text.textContent = (c.content == null ? '' : String(c.content)); // XSS 안전

      var foot = el('div', { class: 'wzc-actions' });
      // 답글 버튼: 대댓글에는 달지 않음(1단계만 지원)
      if (!isReply && state.me) {
        var replyBtn = el('button', { type: 'button', class: 'wzc-act' });
        replyBtn.innerHTML = IC.reply + '<span>답글</span>';
        var replyHolder = el('div', { class: 'wzc-replyform' });
        replyBtn.addEventListener('click', function () {
          if (replyHolder.firstChild) {
            replyHolder.innerHTML = '';
            replyBtn.classList.remove('is-open');
            return;
          }
          replyBtn.classList.add('is-open');
          var f = buildComposer(c.id, function () {
            replyHolder.innerHTML = '';
            replyBtn.classList.remove('is-open');
          });
          replyHolder.appendChild(f);
          var ta = f.querySelector('textarea');
          if (ta) ta.focus();
        });
        foot.appendChild(replyBtn);
        body.dataset.hasReplyHolder = '1';
        body._replyHolder = replyHolder;
      }

      if (c.mine) {
        var delBtn = el('button', { type: 'button', class: 'wzc-act wzc-act--danger' });
        delBtn.innerHTML = IC.trash + '<span>삭제</span>';
        delBtn.addEventListener('click', function () {
          if (!window.confirm('이 댓글을 삭제할까요?')) return;
          delBtn.disabled = true;
          window.api.del('/comments/' + encodeURIComponent(c.id))
            .then(function () {
              // 상태에서 제거(해당 댓글 + 그 대댓글들)
              state.items = state.items.filter(function (x) {
                return String(x.id) !== String(c.id) && String(x.parentId) !== String(c.id);
              });
              render();
            })
            .catch(function () { delBtn.disabled = false; });
        });
        foot.appendChild(delBtn);
      }

      body.append(meta, text);
      if (foot.childNodes.length) body.appendChild(foot);
      if (body._replyHolder) body.appendChild(body._replyHolder);

      li.append(av, body);
      return li;
    }

    /* ---- 전체 렌더 ---- */
    function render() {
      // 부모/자식 그룹핑
      var byParent = {};
      var top = [];
      var items = state.items || [];
      items.forEach(function (c) {
        if (c.parentId != null && c.parentId !== '') {
          var k = String(c.parentId);
          (byParent[k] || (byParent[k] = [])).push(c);
        } else {
          top.push(c);
        }
      });

      // 카운트(전체 댓글 수)
      hcount.textContent = String(items.length);

      list.innerHTML = '';
      if (!top.length) {
        var empty = el('li', { class: 'wzc-empty' });
        empty.appendChild(el('div', { class: 'wzc-empty__ic', html: IC.chat }));
        empty.appendChild(el('p', { class: 'wzc-empty__txt' }, '첫 댓글을 남겨보세요'));
        list.appendChild(empty);
        return;
      }

      top.forEach(function (c) {
        list.appendChild(commentNode(c, false));
        var kids = byParent[String(c.id)];
        if (kids && kids.length) {
          // 대댓글은 오래된→최신(읽기 흐름). 원본은 최신순이므로 뒤집음.
          kids.slice().reverse().forEach(function (k) {
            list.appendChild(commentNode(k, true));
          });
        }
      });
    }

    // 초기 구동
    setupComposer();
    load();
  }

  window.WZComments = { mount: mount };
})();
