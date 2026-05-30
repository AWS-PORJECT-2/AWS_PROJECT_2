/* =====================================================================
 * 두띵 — 설정 페이지 로직 (와디즈 세로 리스트형, from scratch).
 * 전역 WZ(wz-core.js) 사용. 데이터: GET /api/auth/me.
 * 프로필 수정: PATCH /api/me {nickname|phone|picture}. 탈퇴: DELETE /api/me.
 * 이모지 금지 — 아이콘은 인라인 SVG(stroke=currentColor). 사용자값은 WZ.el 문자열 자식(textContent)으로만.
 * ===================================================================== */
(function () {
  var WZ = window.WZ;
  var el = WZ.el;
  var root = document.getElementById('wz-settings');

  /* 알림 설정 로컬 저장 키 */
  var NOTIF_KEY = 'wz_notif_prefs';
  var NOTIF_ITEMS = [
    { key: 'funding', label: '펀딩 소식', desc: '참여한 프로젝트의 진행·마감·배송 알림' },
    { key: 'comment', label: '댓글·답글', desc: '내 활동에 달린 댓글과 답글 알림' },
    { key: 'marketing', label: '혜택·이벤트', desc: '두띵 추천 프로젝트와 이벤트 소식' },
  ];

  /* ===== 인라인 SVG 아이콘 (stroke=currentColor) ===== */
  var SVG = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    google: '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.6-.05-1.2-.16-1.8H12v3.4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.1z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="#EA4335" d="M12 6.6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 8.3 9.4 6.6 12 6.6z"/></svg>',
  };

  function chevron() { return el('span', { class: 'wzs-row__chevron', html: SVG.chevron }); }

  /* ===== 토스트 ===== */
  var toastNode;
  function toast(msg) {
    if (!toastNode) { toastNode = el('div', { class: 'wzs-toast' }); document.body.appendChild(toastNode); }
    toastNode.textContent = msg;
    toastNode.classList.add('is-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastNode.classList.remove('is-show'); }, 2200);
  }

  /* ===== 알림 환경설정 로드/저장 ===== */
  function loadNotif() {
    try { return Object.assign({ funding: true, comment: true, marketing: false }, JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}')); }
    catch (_) { return { funding: true, comment: true, marketing: false }; }
  }
  function saveNotif(p) { try { localStorage.setItem(NOTIF_KEY, JSON.stringify(p)); } catch (_) {} }

  /* ===== 토글 위젯 ===== */
  function toggle(on, onChange) {
    var t = el('button', { class: 'wzs-toggle' + (on ? ' is-on' : ''), type: 'button', role: 'switch', 'aria-checked': String(!!on) },
      el('span', { class: 'wzs-toggle__track' }), el('span', { class: 'wzs-toggle__knob' }));
    t.addEventListener('click', function (e) {
      e.stopPropagation();
      var next = !t.classList.contains('is-on');
      t.classList.toggle('is-on', next);
      t.setAttribute('aria-checked', String(next));
      onChange(next);
    });
    return t;
  }

  /* ===== 일반 행(라벨 + 값/배지 + chevron) ===== */
  function row(opts) {
    // opts: { label, sub, valueNode|value, valueMuted, chevron(bool), onClick }
    var r = opts.onClick
      ? el('button', { class: 'wzs-row', type: 'button' })
      : el('div', { class: 'wzs-row wzs-row--static' });
    var main = el('div', { class: 'wzs-row__main' });
    var label = el('div', { class: 'wzs-row__label' }, opts.label);
    if (opts.labelBadge) label.appendChild(opts.labelBadge);
    main.appendChild(label);
    if (opts.sub) main.appendChild(el('div', { class: 'wzs-row__sub' }, opts.sub));
    r.appendChild(main);
    if (opts.valueNode) r.appendChild(opts.valueNode);
    else if (opts.value != null) r.appendChild(el('div', { class: 'wzs-row__value' + (opts.valueMuted ? ' wzs-row__value--muted' : '') }, opts.value));
    if (opts.chevron) r.appendChild(chevron());
    if (opts.onClick) r.addEventListener('click', opts.onClick);
    return r;
  }

  /* ===== 인라인 편집기 ===== */
  // field: 'nickname' | 'phone'. PATCH /api/me 후 me 갱신 + 재렌더.
  function startInlineEdit(rowNode, opts) {
    if (rowNode._editing) return;
    rowNode._editing = true;
    var prevHTML = rowNode.cloneNode(true);

    var wrap = el('div', { class: 'wzs-row' });
    var main = el('div', { class: 'wzs-row__main' }, el('div', { class: 'wzs-row__label' }, opts.label));
    var input = el('input', { type: opts.type || 'text', value: opts.current || '', placeholder: opts.placeholder || '', 'aria-label': opts.label });
    if (opts.maxlength) input.setAttribute('maxlength', String(opts.maxlength));
    var save = el('button', { class: 'wzs-inline__btn', type: 'button' }, '저장');
    var cancel = el('button', { class: 'wzs-inline__btn wzs-inline__cancel', type: 'button' }, '취소');
    var inline = el('div', { class: 'wzs-inline' }, input, save, cancel);
    var errNode = el('div', { class: 'wzs-inline__err' });
    errNode.style.display = 'none';

    main.appendChild(inline);
    main.appendChild(errNode);
    wrap.appendChild(main);
    rowNode.replaceWith(wrap);
    input.focus();
    input.select && input.select();

    function fail(msg) { errNode.textContent = msg; errNode.style.display = 'block'; save.disabled = false; }
    function commit() {
      var v = input.value.trim();
      var err = opts.validate ? opts.validate(v) : null;
      if (err) { fail(err); return; }
      save.disabled = true; errNode.style.display = 'none';
      var patch = {}; patch[opts.field] = v;
      window.api.patch('/me', patch)
        .then(function (updated) {
          // 백엔드가 전체 me 객체 반환 -> state 갱신
          if (updated) { state.me = Object.assign({}, state.me, updated); }
          else { state.me[opts.field] = v; }
          render();
          toast(opts.successMsg || '저장되었습니다');
        })
        .catch(function (e) { fail((e && e.message) || '저장에 실패했습니다'); });
    }
    save.addEventListener('click', commit);
    cancel.addEventListener('click', function () { wrap.replaceWith(prevHTML); rowNode._editing = false; });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { wrap.replaceWith(prevHTML); rowNode._editing = false; }
    });
  }

  /* ===== 프로필 사진 변경 (파일 선택 -> data URL -> PATCH) ===== */
  function pickPicture() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/png,image/jpeg,image/webp';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) { toast('PNG·JPG·WEBP 이미지만 가능합니다'); return; }
      if (f.size > 3 * 1024 * 1024) { toast('이미지는 3MB 이하만 가능합니다'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || '');
        toast('업로드 중...');
        window.api.patch('/me', { picture: dataUrl })
          .then(function (updated) {
            if (updated) state.me = Object.assign({}, state.me, updated);
            else state.me.picture = dataUrl;
            render();
            toast('프로필 사진이 변경되었습니다');
          })
          .catch(function (e) { toast((e && e.message) || '사진 변경에 실패했습니다'); });
      };
      reader.onerror = function () { toast('이미지를 읽지 못했습니다'); };
      reader.readAsDataURL(f);
    });
    inp.click();
  }

  /* ===== 검증기 ===== */
  function validateNickname(v) {
    if (!v) return '닉네임을 입력해 주세요';
    if (v.length > 40) return '닉네임은 40자 이하입니다';
    return null;
  }
  function validatePhone(v) {
    if (!v) return null; // 빈값 허용(전화번호 삭제)
    if (!/^[0-9\-+ ]{7,20}$/.test(v)) return '전화번호 형식이 올바르지 않습니다';
    return null;
  }

  /* ===== 회원 탈퇴 ===== */
  function withdraw() {
    if (!window.confirm('정말 탈퇴하시겠어요?\n계정과 관련 정보가 삭제되며 되돌릴 수 없습니다.')) return;
    window.api.del('/me')
      .then(function () {
        toast('탈퇴가 완료되었습니다');
        setTimeout(function () { location.href = '/landing.html'; }, 1200);
      })
      .catch(function (e) {
        window.alert((e && e.message) || '탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      });
  }

  /* ===== 상태 ===== */
  var state = { me: null };

  /* ===== 렌더 ===== */
  function render() {
    root.innerHTML = '';
    var me = state.me;

    root.appendChild(el('h1', { class: 'wzs-title' }, '설정'));

    /* --- 비로그인 --- */
    if (!me) {
      root.appendChild(el('div', { class: 'wzs-guest' },
        el('p', {}, '설정을 보려면 로그인이 필요합니다.'),
        el('a', { class: 'wz-btn wz-btn--primary', href: '/login.html' }, '로그인하기')));
      return;
    }

    var displayName = me.nickname || me.name || '회원';
    var email = me.email || '';

    /* --- 히어로: 아바타 + 편집 배지 + 이름/이메일 --- */
    var hero = el('div', { class: 'wzs-hero' });
    var avatarWrap = el('div', { class: 'wzs-avatar-wrap' });
    var avatar = el('div', { class: 'wzs-avatar' });
    if (me.picture) {
      var img = el('img', { src: me.picture, alt: displayName });
      img.addEventListener('error', function () { img.remove(); avatar.innerHTML = SVG.user; });
      avatar.appendChild(img);
    } else {
      avatar.innerHTML = SVG.user;
    }
    var editBtn = el('button', { class: 'wzs-avatar-edit', type: 'button', 'aria-label': '프로필 사진 변경', html: SVG.pencil });
    editBtn.addEventListener('click', pickPicture);
    avatarWrap.append(avatar, editBtn);
    hero.appendChild(avatarWrap);
    hero.appendChild(el('p', { class: 'wzs-hero__name' }, displayName));
    if (email) hero.appendChild(el('p', { class: 'wzs-hero__email' }, email));
    root.appendChild(hero);

    /* --- 그룹1: 닉네임 / 이메일 / 국가·지역 --- */
    var g1 = el('div', { class: 'wzs-list' });

    var nickRow;
    nickRow = row({
      label: '닉네임',
      value: me.nickname || me.name || '미설정',
      valueMuted: !(me.nickname || me.name),
      chevron: true,
      onClick: function () {
        startInlineEdit(nickRow, {
          field: 'nickname', label: '닉네임', current: me.nickname || me.name || '',
          placeholder: '닉네임 입력', maxlength: 40, validate: validateNickname, successMsg: '닉네임이 변경되었습니다',
        });
      },
    });
    g1.appendChild(nickRow);

    g1.appendChild(row({
      label: '이메일',
      labelBadge: el('span', { class: 'wzs-badge wzs-badge--verified' }, el('span', { html: SVG.check, style: 'display:inline-flex;width:12px;height:12px' }), '인증됨'),
      value: email || '미설정',
      valueMuted: !email,
    }));

    g1.appendChild(row({
      label: '국가 / 지역',
      value: '한국 (KRW) ₩',
      valueMuted: true,
    }));

    root.appendChild(g1);

    /* --- 구분선 + "설정" 소제목 + 그룹2 --- */
    root.appendChild(el('hr', { class: 'wzs-divider' }));
    root.appendChild(el('h2', { class: 'wzs-subtitle' }, '설정'));

    var g2 = el('div', { class: 'wzs-list' });

    // 비밀번호 설정 — 백엔드 없음 -> 준비 중
    g2.appendChild(row({
      label: '비밀번호 설정',
      sub: '구글 계정으로 로그인 중입니다',
      chevron: true,
      onClick: function () { toast('준비 중입니다'); },
    }));

    // 알림 설정 — 토글 시트(localStorage)
    var notifRow = row({
      label: '알림 설정',
      sub: '받을 알림 종류를 선택하세요',
      chevron: true,
      onClick: function () { toggleNotifSheet(notifRow); },
    });
    g2.appendChild(notifRow);

    // 전화번호 설정 — 인라인 편집 PATCH /me {phone}
    var phoneRow;
    phoneRow = row({
      label: '전화번호 설정',
      value: me.phone || '미설정',
      valueMuted: !me.phone,
      chevron: true,
      onClick: function () {
        startInlineEdit(phoneRow, {
          field: 'phone', label: '전화번호', current: me.phone || '', type: 'tel',
          placeholder: '01012345678', maxlength: 20, validate: validatePhone, successMsg: '전화번호가 변경되었습니다',
        });
      },
    });
    g2.appendChild(phoneRow);

    // 생일 정보 설정 — 백엔드 없음 -> 준비 중
    g2.appendChild(row({
      label: '생일 정보 설정',
      value: '미설정',
      valueMuted: true,
      chevron: true,
      onClick: function () { toast('준비 중입니다'); },
    }));

    // 친구 관리 — 백엔드 없음 -> 준비 중
    g2.appendChild(row({
      label: '친구 관리',
      chevron: true,
      onClick: function () { toast('준비 중입니다'); },
    }));

    root.appendChild(g2);

    /* --- 구분선 + "SNS 계정 연동" --- */
    root.appendChild(el('hr', { class: 'wzs-divider' }));
    root.appendChild(el('h2', { class: 'wzs-subtitle' }, 'SNS 계정 연동'));

    var sns = el('div', { class: 'wzs-list' });
    var googleConnected = !!email; // 구글 OAuth 로 로그인 -> 연동 중
    var snsRow = el('div', { class: 'wzs-sns' },
      el('span', { class: 'wzs-sns__ic', html: SVG.google }),
      el('span', { class: 'wzs-sns__name' }, '구글'),
      el('span', { class: 'wzs-sns__status' },
        googleConnected
          ? el('span', { class: 'wzs-badge wzs-badge--connected' }, '연동 중')
          : el('span', { class: 'wzs-badge wzs-badge--verified' }, '미연동')));
    sns.appendChild(snsRow);
    root.appendChild(sns);

    /* --- 하단: 로그아웃 / 회원 탈퇴 --- */
    var account = el('div', { class: 'wzs-account' });
    var logoutBtn = el('button', { class: 'wzs-account__logout', type: 'button' }, '로그아웃');
    logoutBtn.addEventListener('click', function (e) { WZ.logout(e); });
    var withdrawBtn = el('button', { class: 'wzs-account__withdraw', type: 'button' }, '회원 탈퇴');
    withdrawBtn.addEventListener('click', withdraw);
    account.append(logoutBtn, withdrawBtn);
    root.appendChild(account);
  }

  /* 알림 설정 시트 토글(행 바로 아래 펼침) */
  function toggleNotifSheet(rowNode) {
    var existing = rowNode.nextSibling;
    if (existing && existing.classList && existing.classList.contains('wzs-notif')) { existing.remove(); return; }
    var prefs = loadNotif();
    var sheet = el('div', { class: 'wzs-notif' });
    NOTIF_ITEMS.forEach(function (it) {
      var r = el('div', { class: 'wzs-notif__row' });
      var main = el('div', { class: 'wzs-row__main' },
        el('div', { class: 'wzs-notif__label' }, it.label),
        el('div', { class: 'wzs-notif__desc' }, it.desc));
      var t = toggle(prefs[it.key], function (next) {
        prefs[it.key] = next; saveNotif(prefs); toast('알림 설정이 저장되었습니다');
      });
      r.append(main, t);
      sheet.appendChild(r);
    });
    rowNode.parentNode.insertBefore(sheet, rowNode.nextSibling);
  }

  /* ===== 부트스트랩 ===== */
  root.appendChild(el('h1', { class: 'wzs-title' }, '설정'));
  root.appendChild(el('div', { class: 'wzs-loading' }, '불러오는 중...'));

  WZ.fetchMe().then(function (me) {
    state.me = me || null;
    render();
  }).catch(function () {
    state.me = null;
    render();
  });
})();
