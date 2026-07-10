/* =====================================================================
 * DOOTHING — 스토리 & 투표 (24시간 휘발성). window.WZStory.
 * 상단 링(renderRing) + 풀스크린 뷰어(openViewer) + 업로드(openUploader).
 * 기존 백엔드: GET/POST /api/stories, POST /api/stories/:id/vote.
 * ===================================================================== */
(function () {
  const W = window.WZ;
  if (!W) return;

  const STORY_MS = 5000; // 스토리 1개 노출 시간

  function timeAgo(iso) {
    const t = new Date(iso).getTime();
    if (!t) return '';
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return '방금';
    if (m < 60) return m + '분';
    return Math.floor(m / 60) + '시간';
  }
  function av(node, url, name) {
    if (url) { const im = W.el('img', { src: url, alt: name || '' }); im.addEventListener('error', () => { im.remove(); node.appendChild(fallback(name)); }); node.appendChild(im); }
    else node.appendChild(fallback(name));
  }
  function fallback(name) { return W.el('div', { class: 'dt-story-ring__av-fallback' }, (name || '?').slice(0, 1)); }

  /* ── 상단 스토리 링 ── 작성자별로 묶어서 하나의 링. */
  function renderRing(host, onNeedUpload) {
    if (!host) return;
    window.api.get('/stories', { silentAuthFail: true })
      .then((r) => {
        const items = (r && Array.isArray(r.items)) ? r.items : [];
        const byAuthor = {};
        items.forEach((s) => { (byAuthor[s.authorId] = byAuthor[s.authorId] || []).push(s); });
        const groups = Object.keys(byAuthor).map((aid) => byAuthor[aid]);
        paintRing(host, groups, onNeedUpload);
      })
      .catch(() => paintRing(host, [], onNeedUpload));
  }
  function paintRing(host, groups, onNeedUpload) {
    host.replaceChildren();
    const add = W.el('button', { class: 'dt-story-ring dt-story-ring--add', type: 'button' });
    const addAv = W.el('div', { class: 'dt-story-ring__av' });
    addAv.appendChild(W.el('span', { class: 'dt-story-ring__plus' }, '+'));
    add.append(addAv, W.el('span', { class: 'dt-story-ring__name' }, '내 스토리'));
    add.addEventListener('click', () => { if (onNeedUpload) onNeedUpload(); });
    host.appendChild(add);

    groups.forEach((stories) => {
      const first = stories[0];
      const ring = W.el('button', { class: 'dt-story-ring dt-story-ring--unread', type: 'button' });
      const avatar = W.el('div', { class: 'dt-story-ring__av' });
      av(avatar, first.authorPicture, first.authorName);
      ring.append(avatar, W.el('span', { class: 'dt-story-ring__name' }, first.authorName || '회원'));
      ring.addEventListener('click', () => {
        ring.classList.remove('dt-story-ring--unread');
        ring.classList.add('dt-story-ring--read');
        openViewer(stories);
      });
      host.appendChild(ring);
    });
  }

  /* ── 풀스크린 뷰어 ── */
  function openViewer(stories) {
    let idx = 0;
    let timer = null;
    const overlay = W.el('div', { class: 'dt-sv' });

    const bars = W.el('div', { class: 'dt-sv__bars' });
    stories.forEach(() => { const b = W.el('div', { class: 'dt-sv__bar' }); b.appendChild(W.el('div', { class: 'dt-sv__bar-fill' })); bars.appendChild(b); });
    overlay.appendChild(bars);

    const top = W.el('div', { class: 'dt-sv__top' });
    const avImg = W.el('img', { class: 'dt-sv__av' });
    const authorName = W.el('span', { class: 'dt-sv__author' });
    const timeEl = W.el('span', { class: 'dt-sv__time' });
    const close = W.el('button', { class: 'dt-sv__close', type: 'button', 'aria-label': '닫기' }, '×');
    close.addEventListener('click', shut);
    top.append(avImg, authorName, timeEl, close);
    overlay.appendChild(top);

    const stage = W.el('div', { class: 'dt-sv__stage' });
    overlay.appendChild(stage);

    const tapPrev = W.el('div', { class: 'dt-sv__tap dt-sv__tap--prev' });
    const tapNext = W.el('div', { class: 'dt-sv__tap dt-sv__tap--next' });
    tapPrev.addEventListener('click', () => go(idx - 1));
    tapNext.addEventListener('click', () => go(idx + 1));
    stage.append(tapPrev, tapNext);

    let sy = 0;
    overlay.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; }, { passive: true });
    overlay.addEventListener('touchend', (e) => { if (e.changedTouches[0].clientY - sy > 90) shut(); }, { passive: true });

    document.body.appendChild(overlay);
    show(0);

    function show(i) {
      idx = i;
      const s = stories[i];
      bars.querySelectorAll('.dt-sv__bar').forEach((b, bi) => {
        b.classList.toggle('is-done', bi < i);
        const fill = b.querySelector('.dt-sv__bar-fill');
        if (bi < i) fill.style.width = '100%';
        else if (bi > i) fill.style.width = '0';
      });
      stage.querySelectorAll('.dt-sv__media, .dt-sv__vote').forEach((n) => n.remove());
      const media = s.mediaType === 'video'
        ? W.el('video', { class: 'dt-sv__media', src: s.mediaUrl, autoplay: '', muted: '', playsinline: '' })
        : W.el('img', { class: 'dt-sv__media', src: s.mediaUrl, alt: '' });
      stage.insertBefore(media, tapPrev);
      // 작성자 정보 — 클릭 시 상대 프로필로 이동
      avImg.src = s.authorPicture || '';
      authorName.textContent = s.authorName || '회원';
      timeEl.textContent = timeAgo(s.createdAt);
      if (s.authorId) {
        const goAuthor = (e) => { e.stopPropagation(); shut(); location.href = '/maker.html?id=' + encodeURIComponent(s.authorId); };
        avImg.style.cursor = 'pointer'; authorName.style.cursor = 'pointer';
        avImg.onclick = goAuthor; authorName.onclick = goAuthor;
      }
      if (s.vote) stage.appendChild(VoteSticker(s));
      const curFill = bars.querySelectorAll('.dt-sv__bar')[i].querySelector('.dt-sv__bar-fill');
      curFill.style.transition = 'none'; curFill.style.width = '0';
      requestAnimationFrame(() => { curFill.style.transition = 'width ' + STORY_MS + 'ms linear'; curFill.style.width = '100%'; });
      clearTimeout(timer);
      timer = setTimeout(() => go(i + 1), STORY_MS);
    }
    function go(i) {
      if (i < 0) { show(0); return; }
      if (i >= stories.length) { shut(); return; }
      show(i);
    }
    function shut() { clearTimeout(timer); overlay.remove(); }
  }

  function VoteSticker(s) {
    const wrap = W.el('div', { class: 'dt-sv__vote' });
    wrap.style.left = (s.vote.x != null ? s.vote.x : 50) + '%';
    wrap.style.top = (s.vote.y != null ? s.vote.y : 60) + '%';
    wrap.appendChild(W.el('p', { class: 'dt-sv__vote-q' }, s.vote.q));
    const opts = W.el('div', { class: 'dt-sv__vote-opts' });
    let counts = s.voteCounts || { a: 0, b: 0 };
    let myVote = (typeof s.myVote === 'number') ? s.myVote : null;

    function pct(n) { const tot = counts.a + counts.b; return tot ? Math.round((n / tot) * 100) : 0; }
    const btnA = optBtn(s.vote.a, 0);
    const btnB = optBtn(s.vote.b, 1);
    opts.append(btnA, btnB);
    wrap.appendChild(opts);
    paint();

    function optBtn(label, opt) {
      const b = W.el('button', { class: 'dt-sv__vote-opt', type: 'button' });
      b.appendChild(W.el('span', { class: 'dt-sv__vote-fill' }));
      const lab = W.el('span', { class: 'dt-sv__vote-label' });
      lab.appendChild(W.el('span', {}, label));
      lab.appendChild(W.el('span', { class: 'dt-sv__vote-pct' }));
      b.appendChild(lab);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        try { if (navigator.vibrate) navigator.vibrate(14); } catch (_) {}
        window.api.post('/stories/' + encodeURIComponent(s.id) + '/vote', { option: opt })
          .then((r) => { if (r && r.counts) counts = r.counts; myVote = opt; paint(); })
          .catch(() => {});
      });
      return b;
    }
    function paint() {
      const voted = myVote !== null;
      [[btnA, 0, counts.a], [btnB, 1, counts.b]].forEach(function (arr) {
        const btn = arr[0], opt = arr[1], n = arr[2];
        btn.classList.toggle('is-mine', myVote === opt);
        const fill = btn.querySelector('.dt-sv__vote-fill');
        const pctEl = btn.querySelector('.dt-sv__vote-pct');
        fill.style.width = voted ? (pct(n) + '%') : '0';
        pctEl.textContent = voted ? (pct(n) + '%') : '';
      });
    }
    return wrap;
  }

  /* ── 업로드 화면 ── */
  function openUploader() {
    if (W.fetchMe) {
      W.fetchMe().then((me) => {
        if (!me) { location.href = '/login.html?return=' + encodeURIComponent('/main.html'); return; }
        buildUploader();
      });
    } else buildUploader();
  }
  function buildUploader() {
    const st = { media: null, mediaType: 'image', vote: null, x: 50, y: 60 };
    const overlay = W.el('div', { class: 'dt-su' });

    const top = W.el('div', { class: 'dt-su__top' });
    const back = W.el('button', { class: 'dt-su__back', type: 'button' }, '취소');
    back.addEventListener('click', () => overlay.remove());
    const share = W.el('button', { class: 'dt-su__share', type: 'button' }, '공유');
    share.setAttribute('disabled', 'disabled');
    share.addEventListener('click', publish);
    top.append(back, W.el('span', { class: 'dt-su__title' }, '스토리'), share);
    overlay.appendChild(top);

    const stage = W.el('div', { class: 'dt-su__stage' });
    const empty = W.el('div', { class: 'dt-su__empty' });
    const pick = W.el('button', { class: 'dt-su__pick', type: 'button' }, '사진 선택');
    empty.append(W.el('div', {}, '작업 과정을 툭 올려보세요'), pick);
    stage.appendChild(empty);
    overlay.appendChild(stage);

    const file = W.el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    pick.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const f = file.files && file.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        st.media = rd.result; st.mediaType = 'image';
        empty.remove();
        stage.querySelectorAll('.dt-su__media').forEach((n) => n.remove());
        const img = W.el('img', { class: 'dt-su__media', src: st.media, alt: '' });
        stage.insertBefore(img, stage.firstChild);
        share.removeAttribute('disabled');
      };
      rd.readAsDataURL(f);
    });
    overlay.appendChild(file);

    const tools = W.el('div', { class: 'dt-su__tools' });
    const voteTool = W.el('button', { class: 'dt-su__tool', type: 'button' }, '투표 스티커');
    let sticker = null;
    voteTool.addEventListener('click', () => {
      if (sticker) { sticker.remove(); sticker = null; st.vote = null; voteTool.classList.remove('is-on'); return; }
      voteTool.classList.add('is-on');
      sticker = buildSticker(st, stage);
      stage.appendChild(sticker);
    });
    tools.appendChild(voteTool);
    overlay.appendChild(tools);

    document.body.appendChild(overlay);

    function publish() {
      if (!st.media) return;
      share.setAttribute('disabled', 'disabled');
      if (sticker) {
        const q = sticker.querySelector('[data-k="q"]').value.trim();
        const a = sticker.querySelector('[data-k="a"]').value.trim();
        const b = sticker.querySelector('[data-k="b"]').value.trim();
        if (q && a && b) st.vote = { q, a, b, x: st.x, y: st.y };
      }
      window.api.post('/stories', { mediaUrl: st.media, mediaType: st.mediaType, vote: st.vote })
        .then(() => { overlay.remove(); if (window.WZStory && window.WZStory._onPublish) window.WZStory._onPublish(); })
        .catch((e) => {
          share.removeAttribute('disabled');
          if (e && e.status === 401) { location.href = '/login.html'; return; }
          alert('스토리 업로드에 실패했어요.');
        });
    }
  }

  function buildSticker(st, stage) {
    const s = W.el('div', { class: 'dt-su__sticker' });
    s.style.left = st.x + '%'; s.style.top = st.y + '%';
    s.appendChild(W.el('input', { type: 'text', 'data-k': 'q', placeholder: '질문 (예: 어떤 핏이 좋아?)', maxlength: '60' }));
    const opts = W.el('div', { class: 'dt-su__sticker-opts' });
    opts.appendChild(W.el('input', { type: 'text', 'data-k': 'a', placeholder: '옵션 A', maxlength: '20' }));
    opts.appendChild(W.el('input', { type: 'text', 'data-k': 'b', placeholder: '옵션 B', maxlength: '20' }));
    s.appendChild(opts);
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    s.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      dragging = true; s.classList.add('is-drag');
      sx = e.clientX; sy = e.clientY;
      const rect = stage.getBoundingClientRect();
      ox = (st.x / 100) * rect.width; oy = (st.y / 100) * rect.height;
      s.setPointerCapture(e.pointerId); e.preventDefault();
    });
    s.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = stage.getBoundingClientRect();
      const nx = ox + (e.clientX - sx); const ny = oy + (e.clientY - sy);
      st.x = Math.max(10, Math.min(90, (nx / rect.width) * 100));
      st.y = Math.max(10, Math.min(90, (ny / rect.height) * 100));
      s.style.left = st.x + '%'; s.style.top = st.y + '%';
    });
    s.addEventListener('pointerup', () => { dragging = false; s.classList.remove('is-drag'); });
    return s;
  }

  window.WZStory = { renderRing, openViewer, openUploader };
})();
