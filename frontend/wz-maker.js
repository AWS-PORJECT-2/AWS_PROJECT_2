/* =====================================================================
 * 두띵 — 메이커 공개 프로필(스토어형, from scratch). 전역 WZ(wz-core.js) 사용.
 *
 * URL: /maker.html?id=<userId>  또는  ?slug=<slug>  또는  ?me=1(내 페이지).
 * 텀블벅 보드피아형: 커버 배너 + 큰 아바타 + 이름/뱃지 + 스탯3 + [공유][팔로우].
 * 탭: 프로필 | 올린 프로젝트 N | 후기 | 팔로워 N | 팔로잉.
 * 하단: 프로필 방명록(window.WZComments.mount, targetType:"profile").
 * isMe 면 커버/테마색/소개 인라인 편집(PATCH /api/me) + "프로필 편집"(/settings.html#profile).
 *
 * 데이터: GET /api/users/:idOrSlug, /api/users/:idOrSlug/funds,
 *   POST/DELETE /api/users/:id/follow, GET /api/users/:id/followers|following.
 * 미로그인은 soft-auth(silentAuthFail) 로 무소음. 이모지 금지 — 아이콘은 인라인 SVG.
 * 사용자/외부값은 문자열 자식(textContent) 또는 W.esc 로만 삽입(XSS 안전).
 * ===================================================================== */
(function () {
  var W = window.WZ;

  /* ---- 전용 아이콘(SVG only) ---- */
  var IC = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    kakao: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.7-1.8 3.8-2.6.6.1 1.3.1 1.9.1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>',
    twitterX: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.2 2.5h3.3l-7.2 8.2 8.5 11.3h-6.7l-5.2-6.8-6 6.8H1.6l7.7-8.8L1.2 2.5h6.8l4.7 6.2 5.5-6.2zm-1.2 17.6h1.8L7.1 4.3H5.2l11.8 15.8z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg>',
    badge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8L12 2z"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    box: W.ICON.box,
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>',
  };

  /* ---- 커버 프리셋(에셋) ---- */
  var PRESET_COVERS = [
    '/assets/maker-cover-default.png',
    '/assets/maker-cover-2.png',
    '/assets/maker-cover-3.png',
    '/assets/maker-cover-4.png',
  ];

  // 상대경로 커버(/assets/...)를 절대 URL(http(s))로 정규화.
  // 서버(PATCH /api/me)는 coverUrl 로 http(s) 또는 data:image 만 허용하므로
  // 프리셋·기본 커버는 origin 을 붙여 절대 URL 로 보내야 저장에 성공한다.
  // 이미 http(s)/data: 인 값(커스텀 업로드 data URL 포함)은 그대로 둔다.
  function absCover(u) {
    var s = (u == null) ? '' : String(u);
    if (!s) return '';
    if (/^(https?:)?\/\//i.test(s) || /^data:/i.test(s)) return s;
    if (s.charAt(0) === '/') return window.location.origin + s;
    return s;
  }

  /* ---- 상태 ---- */
  var state = {
    me: null,           // 로그인 유저(또는 null)
    profile: null,      // GET /api/users/:idOrSlug
    funds: null,        // 올린 공구 items
    followers: null,    // 팔로워 목록
    following: null,    // 팔로잉 목록
    tab: 'profile',     // profile | funds | reviews | followers | following
    busyFollow: false,
  };
  var refs = {};

  /* ---- 진입 식별자: ?me=1 | ?id= | ?slug= ---- */
  function targetParam() {
    var p = new URLSearchParams(location.search);
    if (p.get('me') === '1') return { me: true };
    var id = p.get('id');
    if (id) return { idOrSlug: id };
    var slug = p.get('slug');
    if (slug) return { idOrSlug: slug };
    return { me: true }; // 파라미터 없으면 내 페이지로 간주
  }

  function run() {
    var root = document.getElementById('wz-maker');
    if (!root || !W) return;
    refs.root = root;
    root.appendChild(W.el('div', { class: 'wz-skel-page' }, W.skelGrid(8)));   // 텍스트 로딩 대신 스켈레톤 카드
    load();
  }

  /* ---- 데이터 로드 ---- */
  function load() {
    var tp = targetParam();
    // 먼저 로그인 정보(있으면). me=1 이면 그걸로 idOrSlug 결정.
    W.fetchMe().then(function (me) {
      state.me = me || null;
      var idOrSlug;
      if (tp.me) {
        if (!me) { renderNeedLogin(); return; }
        idOrSlug = me.slug || me.userId;
      } else {
        idOrSlug = tp.idOrSlug;
      }
      fetchProfile(idOrSlug);
    });
  }

  function fetchProfile(idOrSlug) {
    window.api.get('/users/' + encodeURIComponent(idOrSlug), { silentAuthFail: true })
      .then(function (prof) {
        state.profile = prof || null;
        if (!state.profile) { renderNotFound(); return; }
        applyTheme(state.profile.themeColor);
        // 초기 탭: ?tab= 지원
        var t = new URLSearchParams(location.search).get('tab');
        if (['profile', 'funds', 'reviews', 'followers', 'following'].indexOf(t) !== -1) state.tab = t;
        render();
        // 올린 공구 선조회(프로젝트 미리보기/탭 카운트)
        loadFunds();
      })
      .catch(function () { renderNotFound(); });
  }

  function loadFunds() {
    if (state.funds) return Promise.resolve(state.funds);
    var key = state.profile.slug || state.profile.userId;
    return window.api.get('/users/' + encodeURIComponent(key) + '/funds', { silentAuthFail: true })
      .then(function (r) {
        state.funds = (r && r.items) || [];
        // 프로필 탭 미리보기 / 올린 프로젝트 탭이 열려 있으면 갱신
        if (refs.tabBar) syncTabCounts();
        // 비소유자에게는 /funds 가 공개 펀드만 반환 → 히어로 '올린 프로젝트' 스탯도 공개 수로 보정.
        refreshProjectStat();
        if (state.tab === 'profile') renderPreviewGrid();
        if (state.tab === 'funds') renderTabBody();
        return state.funds;
      })
      .catch(function () { state.funds = state.funds || []; });
  }

  function applyTheme(color) {
    // themeColor 는 커버 그라데이션 색으로만 사용된다(커버 이미지 없을 때 applyCoverGrad). 유효 hex 아니면 미적용.
    if (!color || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(color))) { refs.theme = null; return; }
    refs.theme = color;
  }

  /* =================== 전체 렌더 =================== */
  function render() {
    var prof = state.profile;
    var root = refs.root;
    root.replaceChildren();

    root.appendChild(Hero());
    root.appendChild(TabBar());

    refs.body = W.el('div', { class: 'wz-mk-body dt-wrap' });
    root.appendChild(refs.body);
    renderTabBody();

    // 하단: 프로필 방명록(댓글)
    root.appendChild(CommentsSection());
  }

  /* =================== 히어로(커버 + 아바타 + 정보) =================== */
  function Hero() {
    var prof = state.profile;
    var isMe = !!prof.isMe;
    var hero = W.el('section', { class: 'wz-mk-hero' });

    /* 커버 배너 */
    var cover = W.el('div', { class: 'wz-mk-cover' });
    if (prof.coverUrl) {
      var cimg = W.el('img', { class: 'wz-mk-cover__img', src: prof.coverUrl, alt: '', loading: 'eager' });
      cimg.addEventListener('error', function () { cimg.remove(); cover.classList.add('wz-mk-cover--grad'); applyCoverGrad(cover); });
      cover.appendChild(cimg);
    } else {
      cover.classList.add('wz-mk-cover--grad');
      applyCoverGrad(cover);
    }
    if (isMe) {
      var coverEdit = W.el('button', { class: 'wz-mk-cover__edit', type: 'button', 'aria-label': '커버 편집', html: IC.camera + '<span>커버 편집</span>' });
      coverEdit.addEventListener('click', openCustomize);
      cover.appendChild(coverEdit);
    }
    hero.appendChild(cover);

    /* 정보 줄 */
    var info = W.el('div', { class: 'wz-mk-hero__inner dt-wrap' });

    var avatar = W.el('div', { class: 'wz-mk-avatar' });
    if (prof.picture) {
      var aimg = W.el('img', { src: prof.picture, alt: prof.name || '' });
      aimg.addEventListener('error', function () { aimg.remove(); avatar.innerHTML = IC.user; });
      avatar.appendChild(aimg);
    } else { avatar.innerHTML = IC.user; }
    info.appendChild(avatar);

    var main = W.el('div', { class: 'wz-mk-hero__main' });

    // 이름 줄
    var nameRow = W.el('div', { class: 'wz-mk-hero__namerow' });
    nameRow.appendChild(W.el('h1', { class: 'wz-mk-name' }, prof.name || prof.nickname || '메이커'));
    if (prof.nickname && prof.nickname !== prof.name) {
      nameRow.appendChild(W.el('span', { class: 'wz-mk-nick' }, '@' + prof.nickname));
    }
    main.appendChild(nameRow);

    // 뱃지 칩(있으면)
    if (Array.isArray(prof.badges) && prof.badges.length) {
      var bwrap = W.el('div', { class: 'wz-mk-badges' });
      prof.badges.forEach(function (b) {
        var chip = W.el('span', { class: 'wz-mk-badge', title: b.desc || '' });
        chip.appendChild(W.el('span', { class: 'wz-mk-badge__ic', html: IC.badge }));
        chip.appendChild(W.el('span', {}, b.label || b.key || ''));
        bwrap.appendChild(chip);
      });
      main.appendChild(bwrap);
    }

    // 웹사이트(있으면)
    if (prof.website) {
      var wsHref = /^https?:\/\//i.test(prof.website) ? prof.website : 'https://' + prof.website;
      var ws = W.el('a', { class: 'wz-mk-site', href: wsHref, target: '_blank', rel: 'noopener noreferrer nofollow' });
      ws.appendChild(W.el('span', { class: 'wz-mk-site__ic', html: IC.link }));
      ws.appendChild(W.el('span', {}, prof.website));
      main.appendChild(ws);
    }

    // 스탯 3개
    var stats = W.el('div', { class: 'wz-mk-stats' });
    stats.appendChild(statBtn('팔로워', prof.followerCount, function () { selectTab('followers'); }));
    stats.appendChild(stat('누적 후원자', prof.supporterCount));
    stats.appendChild(statBtn('올린 프로젝트', prof.projectCount, function () { selectTab('funds'); }));
    main.appendChild(stats);

    info.appendChild(main);

    // 우측 액션
    var actions = W.el('div', { class: 'wz-mk-hero__actions' });
    var shareBtn = W.el('button', { class: 'wz-btn wz-btn--outline wz-mk-share', type: 'button', html: IC.share + '<span>공유</span>' });
    shareBtn.addEventListener('click', onShare);
    actions.appendChild(shareBtn);

    if (isMe) {
      var editBtn = W.el('a', { class: 'wz-btn wz-btn--primary wz-mk-editbtn', href: '/settings.html#profile', html: IC.edit + '<span>프로필 편집</span>' });
      actions.appendChild(editBtn);
    } else {
      refs.followBtn = FollowBtn();
      actions.appendChild(refs.followBtn);
      // 본인이 아닐 때만 "이 메이커 신고하기"
      var reportBtn = W.el('button', { class: 'wz-rp-trigger wz-mk-report', type: 'button', html: IC.flag + '<span>이 메이커 신고하기</span>' });
      reportBtn.addEventListener('click', function () {
        if (!window.WZReport || typeof window.WZReport.open !== 'function') return;
        window.WZReport.open({
          targetType: 'maker',
          targetId: prof.userId,
          targetLabel: prof.name || prof.nickname || '메이커',
        });
      });
      actions.appendChild(reportBtn);
    }
    info.appendChild(actions);

    hero.appendChild(info);
    return hero;
  }

  function applyCoverGrad(node) {
    var c = refs.theme;
    if (c) {
      node.style.background = 'linear-gradient(120deg, ' + c + ', var(--c-primary-600))';
    }
    // theme 없으면 CSS 기본 보라 그라데이션(.wz-mk-cover--grad) 사용.
  }

  function stat(label, value) {
    var box = W.el('div', { class: 'wz-mk-stat' });
    box.appendChild(W.el('span', { class: 'wz-mk-stat__num' }, fmt(value)));
    box.appendChild(W.el('span', { class: 'wz-mk-stat__label' }, label));
    return box;
  }
  function statBtn(label, value, onClick) {
    var box = W.el('button', { class: 'wz-mk-stat wz-mk-stat--btn', type: 'button' });
    box.addEventListener('click', onClick);
    box.appendChild(W.el('span', { class: 'wz-mk-stat__num' }, fmt(value)));
    box.appendChild(W.el('span', { class: 'wz-mk-stat__label' }, label));
    return box;
  }
  function fmt(n) { return (Number(n) || 0).toLocaleString(); }

  /* ---- 팔로우 버튼 ---- */
  function FollowBtn() {
    var prof = state.profile;
    var following = !!prof.isFollowing;
    var btn = W.el('button', { class: 'wz-btn wz-mk-follow ' + (following ? 'wz-btn--ghost is-following' : 'wz-btn--primary'), type: 'button' });
    paintFollow(btn, following);
    btn.addEventListener('click', function () { onToggleFollow(btn); });
    return btn;
  }
  function paintFollow(btn, following) {
    btn.replaceChildren();
    if (following) {
      btn.classList.remove('wz-btn--primary'); btn.classList.add('wz-btn--ghost', 'is-following');
      btn.appendChild(W.el('span', { class: 'wz-mk-follow__ic', html: IC.check }));
      btn.appendChild(W.el('span', {}, '팔로잉'));
    } else {
      btn.classList.remove('wz-btn--ghost', 'is-following'); btn.classList.add('wz-btn--primary');
      btn.appendChild(W.el('span', { class: 'wz-mk-follow__ic', html: IC.plus }));
      btn.appendChild(W.el('span', {}, '팔로우'));
    }
  }
  function onToggleFollow(btn) {
    var prof = state.profile;
    if (!state.me) { location.href = '/login.html'; return; }
    if (state.busyFollow) return;
    state.busyFollow = true;
    btn.disabled = true;
    var willFollow = !prof.isFollowing;
    var call = willFollow
      ? window.api.post('/users/' + encodeURIComponent(prof.userId) + '/follow', {})
      : window.api.del('/users/' + encodeURIComponent(prof.userId) + '/follow');
    call.then(function (r) {
      prof.isFollowing = (r && typeof r.following === 'boolean') ? r.following : willFollow;
      if (r && typeof r.followerCount === 'number') prof.followerCount = r.followerCount;
      paintFollow(btn, prof.isFollowing);
      refreshFollowerStat();
      // 팔로워 목록 캐시 무효화(다시 진입 시 새로 로드)
      state.followers = null;
    }).catch(function () {
      alert('처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.');
    }).finally(function () {
      state.busyFollow = false; btn.disabled = false;
    });
  }
  function refreshFollowerStat() {
    if (!refs.root) return;
    var nums = refs.root.querySelectorAll('.wz-mk-stat');
    // 첫 stat = 팔로워
    if (nums[0]) {
      var numEl = nums[0].querySelector('.wz-mk-stat__num');
      if (numEl) numEl.textContent = fmt(state.profile.followerCount);
    }
    syncTabCounts();
  }
  // 비소유자 페이지에서는 /funds 가 공개 펀드만 내려오므로, 히어로 '올린 프로젝트'(3번째 스탯)를
  // 실제 로드된 공개 펀드 수로 보정한다. 소유자는 백엔드 projectCount(비공개 포함)를 그대로 둔다.
  function refreshProjectStat() {
    if (!refs.root || !state.profile || state.profile.isMe) return;
    if (!Array.isArray(state.funds)) return;
    var nums = refs.root.querySelectorAll('.wz-mk-stat');
    // 세 번째 stat = 올린 프로젝트
    if (nums[2]) {
      var numEl = nums[2].querySelector('.wz-mk-stat__num');
      if (numEl) numEl.textContent = fmt(state.funds.length);
    }
  }

  /* ---------- 공유(카카오/X/페이스북/링크) — 상세(wz-detail) 공유시트와 동일 동작 ---------- */
  function copyLink(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast('링크를 복사했어요'); }).catch(function () { toast(url); });
    } else {
      toast(url);
    }
  }
  function openShareWindow(shareUrl) {
    // 클릭(사용자 제스처) 첫 줄에서 동기 호출되어야 팝업 차단을 피한다.
    window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=540');
  }
  // 카카오톡: SDK/도메인 등록 없이 — 링크 복사 + 카카오톡 앱 실행 시도(설치 시 열림, 아니면 무시).
  function openKakaoTalk() {
    try {
      var ifr = document.createElement('iframe');
      ifr.style.display = 'none';
      ifr.src = 'kakaotalk://';
      document.body.appendChild(ifr);
      setTimeout(function () { try { ifr.remove(); } catch (_) {} }, 1500);
    } catch (_) { /* 무시 */ }
  }

  function onShare() {
    var url = location.href;
    var enc = encodeURIComponent(url);
    var title = (state.profile && (state.profile.name || state.profile.nickname)) || '메이커';
    var encTitle = encodeURIComponent(title + ' · 두띵');

    // 각 항목은 클릭 즉시(동기) 처리 — window.open 은 핸들러 첫 줄에서(팝업 차단 방지). 모두 <button>.
    var items = [
      ['kakao', '카카오톡', IC.kakao, function () { try { if (navigator.clipboard) navigator.clipboard.writeText(url); } catch (_) { /* 무시 */ } openKakaoTalk(); }],
      ['twitterX', 'X', IC.twitterX, function () { openShareWindow('https://twitter.com/intent/tweet?url=' + enc + '&text=' + encTitle); }],
      ['facebook', '페이스북', IC.facebook, function () { openShareWindow('https://www.facebook.com/sharer/sharer.php?u=' + enc); }],
      ['link', '링크 복사', IC.link, function () { copyLink(url); }],
    ];

    var overlay = W.el('div', { class: 'wz-mk-sharesheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': '공유하기' });
    var box = W.el('div', { class: 'wz-mk-sharesheet__box' });
    var close = function () { overlay.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (e.key === 'Escape') close(); }

    var head = W.el('div', { class: 'wz-mk-sharesheet__head' });
    var closeBtn = W.el('button', { class: 'wz-mk-sharesheet__close', type: 'button', 'aria-label': '닫기', html: W.ICON.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h3', {}, '공유하기'), closeBtn);

    var grid = W.el('div', { class: 'wz-mk-sharesheet__grid' });
    items.forEach(function (it) {
      var key = it[0], label = it[1], icon = it[2], action = it[3];
      var btn = W.el('button', { class: 'wz-mk-shareitem wz-mk-shareitem--' + key, type: 'button' },
        W.el('span', { class: 'wz-mk-shareitem__ic', html: icon }),
        W.el('span', { class: 'wz-mk-shareitem__label' }, label));
      // 핸들러 첫 줄에서 action() 동기 실행(window.open 이 제스처 안에서) 후 시트 닫기.
      btn.addEventListener('click', function () { action(); close(); });
      grid.appendChild(btn);
    });

    box.append(head, grid);
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  /* =================== 탭 바 =================== */
  function TabBar() {
    var bar = W.el('nav', { class: 'wz-mk-tabs', 'aria-label': '메이커 탭' });
    var inner = W.el('div', { class: 'wz-mk-tabs__inner dt-wrap' });
    refs.tabBar = inner;
    renderTabs(inner);
    bar.appendChild(inner);
    return bar;
  }
  function tabDefs() {
    var prof = state.profile;
    var fundN = state.funds ? state.funds.length : (prof.projectCount || 0);
    return [
      { key: 'profile', label: '프로필' },
      { key: 'funds', label: '올린 프로젝트', count: fundN },
      { key: 'reviews', label: '후기' },
      { key: 'followers', label: '팔로워', count: prof.followerCount },
      { key: 'following', label: '팔로잉', count: prof.followingCount },
    ];
  }
  function renderTabs(inner) {
    inner.replaceChildren();
    tabDefs().forEach(function (t) {
      var b = W.el('button', { class: 'wz-mk-tab' + (state.tab === t.key ? ' is-active' : ''), type: 'button' });
      b.dataset.key = t.key;
      b.appendChild(W.el('span', {}, t.label));
      if (typeof t.count === 'number') b.appendChild(W.el('span', { class: 'wz-mk-tab__count' }, fmt(t.count)));
      b.addEventListener('click', function () { selectTab(t.key); });
      inner.appendChild(b);
    });
  }
  function syncTabCounts() {
    if (!refs.tabBar) return;
    renderTabs(refs.tabBar);
  }
  function selectTab(key) {
    if (state.tab === key) return;
    state.tab = key;
    if (refs.tabBar) renderTabs(refs.tabBar);
    renderTabBody();
    try {
      var qs = new URLSearchParams(location.search);
      qs.set('tab', key);
      history.replaceState({}, '', location.pathname + '?' + qs.toString());
    } catch (_) {}
  }

  /* =================== 탭 본문 =================== */
  function renderTabBody() {
    var body = refs.body;
    if (!body) return;
    body.replaceChildren();
    if (state.tab === 'profile') return renderProfileTab(body);
    if (state.tab === 'funds') return renderFundsTab(body);
    if (state.tab === 'reviews') return renderReviewsTab(body);
    if (state.tab === 'followers') return renderPeopleTab(body, 'followers');
    if (state.tab === 'following') return renderPeopleTab(body, 'following');
  }

  /* ---- 프로필 탭: 소개 + 뱃지 설명 + 프로젝트 미리보기 ---- */
  function renderProfileTab(body) {
    var prof = state.profile;

    var sec = W.el('section', { class: 'wz-mk-sec' });
    sec.appendChild(W.el('h2', { class: 'wz-mk-sec__title' }, '소개'));
    var introBox = W.el('div', { class: 'wz-mk-intro' });
    if (prof.intro) {
      // 줄바꿈 보존, XSS 안전: 줄별 textContent
      String(prof.intro).split(/\n/).forEach(function (line, i) {
        if (i > 0) introBox.appendChild(W.el('br', {}));
        introBox.appendChild(document.createTextNode(line));
      });
    } else {
      introBox.classList.add('wz-mk-intro--empty');
      introBox.appendChild(document.createTextNode('등록된 소개가 없습니다'));
    }
    sec.appendChild(introBox);
    if (prof.isMe) {
      var editIntro = W.el('button', { class: 'wz-mk-textbtn', type: 'button', html: IC.edit + '<span>소개 · 커버 편집</span>' });
      editIntro.addEventListener('click', openCustomize);
      sec.appendChild(editIntro);
    }
    body.appendChild(sec);

    // 뱃지 설명(있으면)
    if (Array.isArray(prof.badges) && prof.badges.length) {
      var bsec = W.el('section', { class: 'wz-mk-sec' });
      bsec.appendChild(W.el('h2', { class: 'wz-mk-sec__title' }, '활동 뱃지'));
      var list = W.el('div', { class: 'wz-mk-badgelist' });
      prof.badges.forEach(function (b) {
        var item = W.el('div', { class: 'wz-mk-badgelist__item' });
        item.appendChild(W.el('span', { class: 'wz-mk-badgelist__ic', html: IC.badge }));
        var txt = W.el('div', { class: 'wz-mk-badgelist__txt' });
        txt.appendChild(W.el('p', { class: 'wz-mk-badgelist__label' }, b.label || b.key || ''));
        if (b.desc) txt.appendChild(W.el('p', { class: 'wz-mk-badgelist__desc' }, b.desc));
        item.appendChild(txt);
        list.appendChild(item);
      });
      bsec.appendChild(list);
      body.appendChild(bsec);
    }

    // 올린 프로젝트 미리보기
    var psec = W.el('section', { class: 'wz-mk-sec' });
    var head = W.el('div', { class: 'wz-mk-sec__head' });
    head.appendChild(W.el('h2', { class: 'wz-mk-sec__title' }, '올린 프로젝트'));
    var more = W.el('button', { class: 'wz-mk-sec__more', type: 'button' }, '전체 보기');
    more.addEventListener('click', function () { selectTab('funds'); });
    head.appendChild(more);
    psec.appendChild(head);
    refs.previewGrid = W.el('div', { class: 'wz-mk-grid' });
    psec.appendChild(refs.previewGrid);
    body.appendChild(psec);
    renderPreviewGrid();
  }

  function renderPreviewGrid() {
    var grid = refs.previewGrid;
    if (!grid || state.tab !== 'profile') return;
    grid.replaceChildren();
    if (state.funds == null) { grid.appendChild(loadingCell()); return; }
    if (!state.funds.length) {
      grid.appendChild(emptyState('box', '아직 올린 프로젝트가 없어요'));
      return;
    }
    state.funds.slice(0, 4).forEach(function (f) { grid.appendChild(fundCard(f)); });
  }

  /* ---- 올린 프로젝트 탭 ---- */
  function renderFundsTab(body) {
    var sec = W.el('section', { class: 'wz-mk-sec' });
    sec.appendChild(W.el('h2', { class: 'wz-mk-sec__title' }, '올린 프로젝트'));
    var grid = W.el('div', { class: 'wz-mk-grid' });
    sec.appendChild(grid);
    body.appendChild(sec);

    if (state.funds == null) {
      grid.appendChild(loadingCell());
      loadFunds().then(function () { if (state.tab === 'funds') fillFundsGrid(grid); });
    } else {
      fillFundsGrid(grid);
    }
  }
  function fillFundsGrid(grid) {
    grid.replaceChildren();
    if (!state.funds || !state.funds.length) {
      grid.appendChild(emptyState('box', '아직 올린 프로젝트가 없어요'));
      return;
    }
    state.funds.forEach(function (f) { grid.appendChild(fundCard(f)); });
  }

  /* ---- 후기 탭(추후) ---- */
  function renderReviewsTab(body) {
    var sec = W.el('section', { class: 'wz-mk-sec' });
    sec.appendChild(W.el('h2', { class: 'wz-mk-sec__title' }, '후기'));
    sec.appendChild(emptyState('chat', '아직 등록된 후기가 없어요'));
    body.appendChild(sec);
  }

  /* ---- 팔로워/팔로잉 탭 ---- */
  function renderPeopleTab(body, kind) {
    var sec = W.el('section', { class: 'wz-mk-sec' });
    sec.appendChild(W.el('h2', { class: 'wz-mk-sec__title' }, kind === 'followers' ? '팔로워' : '팔로잉'));
    var list = W.el('div', { class: 'wz-mk-people' });
    sec.appendChild(list);
    body.appendChild(sec);

    var cached = kind === 'followers' ? state.followers : state.following;
    if (Array.isArray(cached)) { fillPeople(list, cached, kind); return; }
    list.appendChild(loadingCell());
    var key = state.profile.userId;
    window.api.get('/users/' + encodeURIComponent(key) + '/' + kind, { silentAuthFail: true })
      .then(function (arr) {
        var rows = Array.isArray(arr) ? arr : [];
        if (kind === 'followers') state.followers = rows; else state.following = rows;
        if (state.tab === kind) fillPeople(list, rows, kind);
      })
      .catch(function () { if (state.tab === kind) { list.replaceChildren(errorState()); } });
  }
  function fillPeople(list, rows, kind) {
    list.replaceChildren();
    if (!rows.length) {
      list.appendChild(emptyState('user', kind === 'followers' ? '아직 팔로워가 없어요' : '아직 팔로우한 메이커가 없어요'));
      return;
    }
    rows.forEach(function (u) { list.appendChild(personRow(u)); });
  }
  function personRow(u) {
    var to = '/maker.html?' + (u.slug ? 'slug=' + encodeURIComponent(u.slug) : 'id=' + encodeURIComponent(u.userId));
    var row = W.el('div', { class: 'wz-mk-person' });
    var link = W.el('a', { class: 'wz-mk-person__link', href: to });
    var av = W.el('div', { class: 'wz-mk-person__av' });
    if (u.picture) {
      var img = W.el('img', { src: u.picture, alt: u.name || '' });
      img.addEventListener('error', function () { img.remove(); av.innerHTML = IC.user; });
      av.appendChild(img);
    } else { av.innerHTML = IC.user; }
    link.appendChild(av);
    var meta = W.el('div', { class: 'wz-mk-person__meta' });
    meta.appendChild(W.el('p', { class: 'wz-mk-person__name' }, u.name || u.nickname || '메이커'));
    if (u.nickname) meta.appendChild(W.el('p', { class: 'wz-mk-person__nick' }, '@' + u.nickname));
    link.appendChild(meta);
    row.appendChild(link);

    // 팔로우 토글(본인이 아니고 로그인 상태일 때)
    var isSelf = state.me && state.me.userId === u.userId;
    if (!isSelf) {
      var fb = W.el('button', { class: 'wz-btn wz-mk-person__follow ' + (u.isFollowing ? 'wz-btn--ghost is-following' : 'wz-btn--outline'), type: 'button' });
      paintPersonFollow(fb, !!u.isFollowing);
      fb.addEventListener('click', function () { onPersonFollow(fb, u); });
      row.appendChild(fb);
    }
    return row;
  }
  function paintPersonFollow(btn, following) {
    btn.replaceChildren();
    if (following) {
      btn.classList.remove('wz-btn--outline'); btn.classList.add('wz-btn--ghost', 'is-following');
      btn.appendChild(W.el('span', {}, '팔로잉'));
    } else {
      btn.classList.remove('wz-btn--ghost', 'is-following'); btn.classList.add('wz-btn--outline');
      btn.appendChild(W.el('span', {}, '팔로우'));
    }
  }
  function onPersonFollow(btn, u) {
    if (!state.me) { location.href = '/login.html'; return; }
    if (btn.disabled) return;
    btn.disabled = true;
    var willFollow = !u.isFollowing;
    var call = willFollow
      ? window.api.post('/users/' + encodeURIComponent(u.userId) + '/follow', {})
      : window.api.del('/users/' + encodeURIComponent(u.userId) + '/follow');
    call.then(function (r) {
      u.isFollowing = (r && typeof r.following === 'boolean') ? r.following : willFollow;
      paintPersonFollow(btn, u.isFollowing);
      // 토글 대상이 이 페이지의 메이커 본인이면 히어로 팔로우 버튼/팔로워 스탯도 동기화.
      var prof = state.profile;
      if (prof && String(u.userId) === String(prof.userId)) {
        prof.isFollowing = u.isFollowing;
        if (r && typeof r.followerCount === 'number') prof.followerCount = r.followerCount;
        if (refs.followBtn) paintFollow(refs.followBtn, prof.isFollowing);
        refreshFollowerStat();
        // 팔로워 목록 캐시 무효화(다시 진입 시 새로 로드)
        state.followers = null;
      }
    }).catch(function () {
      alert('처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.');
    }).finally(function () { btn.disabled = false; });
  }

  /* =================== 공구 카드 (WZ.fillThumb) =================== */
  var FUND_STATUS = {
    open: { label: '진행 중', cls: 'open' },
    pending_review: { label: '심사 중', cls: 'pending' },
    pending: { label: '심사 중', cls: 'pending' },
    scheduled: { label: '공개 예정', cls: 'pending' },
    rejected: { label: '반려', cls: 'rejected' },
    cancelled: { label: '취소', cls: 'rejected' },
    failed: { label: '실패', cls: 'rejected' },
    closed: { label: '종료', cls: 'done' },
    ended: { label: '종료', cls: 'done' },
    executing: { label: '제작 중', cls: 'done' },
    success: { label: '성공', cls: 'done' },
    achieved: { label: '성공', cls: 'done' },
    completed: { label: '성공', cls: 'done' },
  };
  function fundCard(f) {
    var card = W.el('a', { class: 'wz-mk-card', href: '/detail.html?id=' + encodeURIComponent(f.id) });
    var th = W.el('div', { class: 'wz-mk-card__thumb' });
    // groupbuy 아이템은 coverImageUrl 사용. fillThumb 의 imageUrl 로 매핑
    W.fillThumb(th, { id: f.id, title: f.title, imageUrl: f.coverImageUrl || f.imageUrl, category: f.category });
    var st = FUND_STATUS[String(f.status || '').toLowerCase()];
    if (st) th.appendChild(W.el('span', { class: 'wz-mk-card__badge wz-mk-card__badge--' + st.cls }, st.label));
    card.appendChild(th);
    var rate = (typeof f.achievementRate === 'number') ? f.achievementRate : W.rate(f);
    card.appendChild(W.el('p', { class: 'wz-mk-card__rate' }, rate + '% 달성'));
    card.appendChild(W.el('p', { class: 'wz-mk-card__title' }, f.title || '프로젝트'));
    var who = f.creatorName || (state.profile && (state.profile.name || state.profile.nickname)) || '';
    if (who) card.appendChild(W.el('p', { class: 'wz-mk-card__author' }, who));
    return card;
  }

  /* =================== 하단 방명록(댓글) =================== */
  function CommentsSection() {
    var sec = W.el('section', { class: 'wz-mk-comments dt-wrap' });
    sec.appendChild(W.el('h2', { class: 'wz-mk-sec__title wz-mk-comments__title' }, '방명록'));
    var host = W.el('div', { id: 'profile-comments' });
    sec.appendChild(host);
    // 댓글 컴포넌트가 로드돼 있으면 mount, 아니면 안내(graceful).
    if (window.WZComments && typeof window.WZComments.mount === 'function') {
      try {
        window.WZComments.mount(host, { targetType: 'profile', targetId: String(state.profile.userId) });
      } catch (_) {
        host.appendChild(emptyState('chat', '방명록을 불러오지 못했어요'));
      }
    } else {
      host.appendChild(emptyState('chat', '방명록을 불러오지 못했어요'));
    }
    return sec;
  }

  /* =================== isMe 커스터마이즈(인라인 PATCH /api/me) =================== */
  function openCustomize() {
    var prof = state.profile;
    if (!prof || !prof.isMe) return;
    if (document.querySelector('.wz-mk-modal')) return;

    var overlay = W.el('div', { class: 'wz-mk-modal' });
    var card = W.el('div', { class: 'wz-mk-modal__card', role: 'dialog', 'aria-modal': 'true', 'aria-label': '프로필 꾸미기' });

    card.appendChild(W.el('h3', { class: 'wz-mk-modal__title' }, '프로필 꾸미기'));

    // ---- 커버: 프리셋 4종 선택 또는 직접 업로드(클릭 + 드래그앤드롭) ----
    // 선택값은 항상 절대 URL(http(s)) 또는 data URL 로 유지 → 서버 검증 통과.
    var coverUrl = absCover(prof.coverUrl || '');
    var coverWrap = W.el('div', { class: 'wz-mk-modal__field' });
    coverWrap.appendChild(W.el('label', { class: 'dt-field-label' }, '커버 이미지'));

    // 미리보기(현재 선택)
    var coverPrev = W.el('div', { class: 'wz-mk-coverprev' });
    var coverGrid = W.el('div', { class: 'wz-mk-covergrid' });
    var thumbs = [];

    function paintCoverPrev() {
      coverPrev.replaceChildren();
      if (coverUrl) {
        coverPrev.classList.remove('wz-mk-coverprev--empty');
        coverPrev.appendChild(W.el('img', { class: 'wz-mk-coverprev__img', src: coverUrl, alt: '' }));
      } else {
        coverPrev.classList.add('wz-mk-coverprev--empty');
        coverPrev.appendChild(W.el('span', {}, '커버 없음 · 테마색 배너로 표시돼요'));
      }
    }
    function selectCover(url) {
      // 프리셋·기본 커버 상대경로는 절대 URL 로 정규화, data URL/외부 URL 은 그대로.
      coverUrl = absCover(url || '');
      paintCoverPrev();
      thumbs.forEach(function (t) {
        t.classList.toggle('is-on', !!coverUrl && t.dataset.url === coverUrl);
      });
    }
    paintCoverPrev();
    coverWrap.appendChild(coverPrev);

    // 프리셋 썸네일 그리드. dataset.url 과 선택값은 절대 URL 로 통일(서버 검증 + is-on 매칭).
    PRESET_COVERS.forEach(function (url) {
      var abs = absCover(url);
      var t = W.el('button', { class: 'wz-mk-coverthumb', type: 'button', 'aria-label': '커버 프리셋 선택' });
      t.dataset.url = abs;
      t.appendChild(W.el('img', { src: url, alt: '', loading: 'lazy' }));
      if (coverUrl === abs) t.classList.add('is-on');
      t.addEventListener('click', function () { selectCover(abs); });
      thumbs.push(t);
      coverGrid.appendChild(t);
    });
    coverWrap.appendChild(coverGrid);

    // 직접 업로드(클릭 + 드래그앤드롭)
    var coverFileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
    var coverDrop = W.el('button', { class: 'wz-mk-coverdrop', type: 'button' });
    coverDrop.appendChild(W.el('span', { class: 'wz-mk-coverdrop__ic', html: IC.camera }));
    coverDrop.appendChild(W.el('span', {}, '직접 업로드 · 클릭 또는 끌어다 놓기'));
    coverDrop.appendChild(W.el('span', { class: 'wz-mk-coverdrop__hint' }, 'PNG · JPG · WEBP (최대 8MB)'));
    coverDrop.addEventListener('click', function () { coverFileIn.click(); });
    coverFileIn.addEventListener('change', function () {
      var f = coverFileIn.files && coverFileIn.files[0];
      readImage(f, function (dataUrl) { selectCover(dataUrl); });
      coverFileIn.value = '';
    });
    enableDrop(coverDrop, function (dataUrl) { selectCover(dataUrl); });
    coverWrap.append(coverDrop, coverFileIn);
    card.appendChild(coverWrap);

    // 테마 색
    var themeWrap = W.el('div', { class: 'wz-mk-modal__field' });
    themeWrap.appendChild(W.el('label', { class: 'dt-field-label' }, '커버 그라데이션 색 (커버 이미지 없을 때만 적용)'));
    var themeRow = W.el('div', { class: 'wz-mk-modal__themerow' });
    var swatches = W.el('div', { class: 'wz-mk-swatches' });
    var presets = ['#8B5CF6', '#7C3AED', '#F472B6', '#FB7185', '#34D399', '#38BDF8', '#FBBF24', '#A78BFA'];
    var colorInput = W.el('input', { class: 'wz-mk-colorinput', type: 'color', value: normColor(prof.themeColor) || '#8B5CF6', 'aria-label': '테마 색 선택' });
    presets.forEach(function (c) {
      var sw = W.el('button', { class: 'wz-mk-swatch', type: 'button', 'aria-label': '색 ' + c });
      sw.style.background = c;
      if (normColor(prof.themeColor) === c.toLowerCase()) sw.classList.add('is-on');
      sw.addEventListener('click', function () {
        colorInput.value = c;
        swatches.querySelectorAll('.wz-mk-swatch').forEach(function (x) { x.classList.remove('is-on'); });
        sw.classList.add('is-on');
      });
      swatches.appendChild(sw);
    });
    themeRow.append(swatches, colorInput);
    themeWrap.appendChild(themeRow);
    card.appendChild(themeWrap);

    // 소개
    var introWrap = W.el('div', { class: 'wz-mk-modal__field' });
    introWrap.appendChild(W.el('label', { class: 'dt-field-label' }, '소개'));
    var introTa = W.el('textarea', { class: 'dt-input wz-mk-modal__textarea', rows: '4', placeholder: '메이커 소개를 입력하세요' });
    introTa.value = prof.intro || '';
    introWrap.appendChild(introTa);
    card.appendChild(introWrap);

    // 액션
    var hint = W.el('p', { class: 'wz-mk-modal__hint' }, '더 자세한 설정은 ');
    var hintLink = W.el('a', { href: '/settings.html#profile' }, '설정 > 프로필');
    hint.append(hintLink, document.createTextNode(' 에서 변경할 수 있어요.'));
    card.appendChild(hint);

    var btns = W.el('div', { class: 'wz-mk-modal__btns' });
    var cancel = W.el('button', { class: 'wz-btn wz-btn--ghost', type: 'button' }, '취소');
    var save = W.el('button', { class: 'wz-btn wz-btn--primary', type: 'button' }, '저장');
    cancel.addEventListener('click', close);
    save.addEventListener('click', function () {
      var body = {
        // 서버는 http(s) 또는 data:image 만 허용 → 절대 URL 로 정규화해 전송(저장 성공).
        coverUrl: absCover(coverUrl),
        themeColor: colorInput.value,
        intro: introTa.value,
      };
      save.disabled = true; save.textContent = '저장 중...';
      window.api.patch('/me', body).then(function (updated) {
        // 갱신된 프로필 일부 병합
        if (updated && typeof updated === 'object') {
          ['coverUrl', 'themeColor', 'intro', 'name', 'nickname', 'website', 'picture', 'slug'].forEach(function (k) {
            if (k in updated) state.profile[k] = updated[k];
          });
        } else {
          state.profile.coverUrl = body.coverUrl; state.profile.themeColor = body.themeColor; state.profile.intro = body.intro;
        }
        applyTheme(state.profile.themeColor);
        close();
        render();
        toast('프로필을 저장했어요');
      }).catch(function () {
        save.disabled = false; save.textContent = '저장';
        alert('저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
      });
    });
    btns.append(cancel, save);
    card.appendChild(btns);

    overlay.appendChild(card);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onEsc);

    function onEsc(e) { if (e.key === 'Escape') close(); }
    function close() { overlay.remove(); document.removeEventListener('keydown', onEsc); }
  }

  function normColor(c) {
    if (!c || !/^#([0-9a-fA-F]{6})$/.test(String(c))) return null;
    return String(c).toLowerCase();
  }

  // 이미지 파일 → data URL (PNG/JPG/WEBP, 8MB 제한)
  function readImage(file, cb) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast('PNG·JPG·WEBP 이미지만 업로드할 수 있어요'); return; }
    if (file.size > 8 * 1024 * 1024) { toast('이미지는 최대 8MB까지 가능합니다'); return; }
    var r = new FileReader();
    r.onload = function () { cb(String(r.result)); };
    r.onerror = function () { toast('이미지를 읽지 못했습니다'); };
    r.readAsDataURL(file);
  }

  // 드래그앤드롭: 대상 요소에 부착 → 파일을 떨어뜨리면 readImage 로 처리(하이라이트 포함).
  function enableDrop(node, cb) {
    if (!node) return node;
    node.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); node.classList.add('is-drag'); });
    node.addEventListener('dragleave', function (e) { e.preventDefault(); e.stopPropagation(); node.classList.remove('is-drag'); });
    node.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation(); node.classList.remove('is-drag');
      var files = (e.dataTransfer && e.dataTransfer.files) ? Array.prototype.slice.call(e.dataTransfer.files) : [];
      if (files.length) readImage(files[0], cb);
    });
    return node;
  }

  /* =================== 공용 빈/로딩/에러/토스트 =================== */
  function emptyState(icon, msg) {
    var box = W.el('div', { class: 'wz-mk-empty' });
    box.appendChild(W.el('div', { class: 'wz-mk-empty__ic', html: IC[icon] || IC.box }));
    box.appendChild(W.el('p', {}, msg));
    return box;
  }
  function errorState() {
    return W.el('div', { class: 'wz-mk-empty' },
      W.el('div', { class: 'wz-mk-empty__ic', html: IC.box }),
      W.el('p', {}, '목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'));
  }
  function loadingCell() { return W.el('div', { class: 'wz-mk-loading wz-mk-loading--cell' }, '불러오는 중...'); }

  function renderNotFound() {
    refs.root.replaceChildren(
      W.el('div', { class: 'wz-mk-fallback dt-wrap' },
        W.el('div', { class: 'wz-mk-empty__ic', html: IC.user }),
        W.el('h1', { class: 'wz-mk-fallback__title' }, '메이커를 찾을 수 없어요'),
        W.el('p', { class: 'wz-mk-fallback__desc' }, '주소가 올바르지 않거나 삭제된 메이커일 수 있어요.'),
        W.el('a', { class: 'wz-btn wz-btn--primary', href: '/main.html' }, '홈으로')));
  }
  function renderNeedLogin() {
    refs.root.replaceChildren(
      W.el('div', { class: 'wz-mk-fallback dt-wrap' },
        W.el('div', { class: 'wz-mk-empty__ic', html: IC.user }),
        W.el('h1', { class: 'wz-mk-fallback__title' }, '로그인이 필요해요'),
        W.el('p', { class: 'wz-mk-fallback__desc' }, '내 메이커 페이지를 보려면 로그인하세요.'),
        W.el('a', { class: 'wz-btn wz-btn--primary', href: '/login.html' }, '로그인하기')));
  }

  function toast(msg) {
    var ex = document.querySelector('.wz-mk-toast');
    if (ex) ex.remove();
    var t = W.el('div', { class: 'wz-mk-toast' }, msg);
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-on'); });
    setTimeout(function () { t.classList.remove('is-on'); setTimeout(function () { t.remove(); }, 250); }, 1800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
