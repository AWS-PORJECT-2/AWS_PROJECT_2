/* =====================================================================
 * 두띵 — 프로젝트 분석 리포트(전용 창). 텀블벅 '데이터·인사이트' 사이드바형.
 * 진입: /analytics.html?id=<fundId> (plus/pro 펀드의 "분석 리포트" 버튼).
 *
 * 데이터: GET /api/me/funds/:id/analytics (소유자 전용, 타인/없음 → 404).
 *   { plan, planLabel, tier, summary, rewardBreakdown,
 *     fundingTimeline, likeTimeline, depositStatus, supporters, lockedFeatures }
 *
 * 요금제 게이팅:
 *   - basic: summary + rewardBreakdown 만. 나머지 잠금(자물쇠 안내).
 *   - plus : + 후원/좋아요 추이 + 입금 현황 + 서포터(최근 일부). supporters_full 잠금.
 *   - pro  : 전부.
 * lockedFeatures 에 든 섹션은 자물쇠+흐리게+"Professional에서 제공".
 *
 * 차트: 외부 라이브러리 없이 Vanilla(CSS 막대 / 인라인 SVG). 보라 #8B5CF6 톤.
 * 사용자값(닉네임/리워드명)은 textContent/WZ.esc 로 XSS 방지.
 * ===================================================================== */
(function () {
  var W = window.WZ;

  /* ---- 아이콘(인라인 SVG, stroke=currentColor) ---- */
  var IC = {
    chart:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-9"/></svg>',
    trend:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>',
    heart:  W.ICON.heart,
    gift:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 12h18M12 8v13M12 8S10 3 7.5 3 5 6 5 6s.5 2 3 2M12 8s2-5 4.5-5S19 6 19 6s-.5 2-3 2"/></svg>',
    card:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    users:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1A4 4 0 0 1 16 11"/></svg>',
    lock:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    back:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    user:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    coin:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h3.2a1.8 1.8 0 0 1 0 3.6H9.5h3.6a1.8 1.8 0 0 1 0 3.6H9.5"/></svg>',
    clock:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    eye:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    bell:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  };

  /* 섹션 정의. key=식별자, lock=이 섹션을 잠그는 lockedFeatures 키(있으면).
   * 서포터는 basic 에서 'supporters'(완전잠금), plus 에서 'supporters_full'(전체만 잠금) 둘 다 관여 → 렌더에서 따로 처리. */
  var SECTIONS = [
    { key: 'summary',  label: '요약',         icon: 'chart' },
    { key: 'funding',  label: '후원 추이',     icon: 'trend',  lock: 'fundingTimeline' },
    { key: 'likes',    label: '관심 추이',     icon: 'heart',  lock: 'likeTimeline' },
    { key: 'rewards',  label: '리워드 분포',   icon: 'gift' },
    { key: 'deposit',  label: '결제(입금) 현황', icon: 'card', lock: 'depositStatus' },
    { key: 'supporters', label: '서포터 정보', icon: 'users',  lock: 'supporters' },
  ];

  var state = { fundId: null, data: null, locked: {}, section: 'summary' };
  var refs = {};

  function run() {
    var root = document.getElementById('wz-analytics');
    if (!root || !W) return;

    state.fundId = new URLSearchParams(location.search).get('id');

    var wrap = W.el('div', { class: 'wz-an' });
    root.appendChild(wrap);
    refs.root = wrap;

    if (!state.fundId) {
      wrap.appendChild(stateBox(IC.chart, '잘못된 접근', '분석할 프로젝트가 지정되지 않았어요.', '내 프로젝트로', '/profile.html#funds'));
      return;
    }

    wrap.appendChild(loadingBox());

    // 로그인 확인 → 미로그인 시 로그인 페이지(복귀 경로 포함)
    W.fetchMe().then(function (me) {
      if (!me) {
        var ret = location.pathname + location.search;
        location.href = '/login.html?return=' + encodeURIComponent(ret);
        return;
      }
      load();
    });
  }

  function load() {
    window.api.get('/me/funds/' + encodeURIComponent(state.fundId) + '/analytics')
      .then(function (a) {
        state.data = a || {};
        state.locked = {};
        (Array.isArray(a && a.lockedFeatures) ? a.lockedFeatures : []).forEach(function (k) { state.locked[k] = true; });
        render();
      })
      .catch(function (err) {
        refs.root.replaceChildren();
        if (err && err.status === 404) {
          refs.root.appendChild(stateBox(IC.lock, '분석을 볼 수 없어요',
            '본인이 개설한 프로젝트만 분석 리포트를 볼 수 있어요. 프로젝트가 삭제되었거나 권한이 없을 수 있어요.',
            '내 프로젝트로', '/profile.html#funds'));
        } else {
          refs.root.appendChild(stateBox(IC.chart, '불러오지 못했어요',
            '분석 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.', '다시 시도', null, function () { location.reload(); }));
        }
      });
  }

  /* ============ 전체 레이아웃 ============ */
  function render() {
    var a = state.data;
    var tier = mapTier(a.tier);
    refs.root.replaceChildren();

    // 상단 헤더(뒤로 + 제목 + 요금제 배지)
    var head = W.el('div', { class: 'wz-an__head' });
    var back = W.el('a', { class: 'wz-an__back', href: '/profile.html#funds', 'aria-label': '내 프로젝트로', html: IC.back });
    var titleWrap = W.el('div', { class: 'wz-an__titlewrap' });
    titleWrap.appendChild(W.el('p', { class: 'wz-an__eyebrow' }, '데이터 · 인사이트'));
    titleWrap.appendChild(W.el('h1', { class: 'wz-an__title' }, '프로젝트 분석 리포트'));
    var plan = W.el('span', { class: 'wz-an__plan wz-an__plan--' + tier }, a.planLabel || 'Basic');
    head.append(back, titleWrap, plan);
    refs.root.appendChild(head);

    // basic 안내 배너(이 요금제는 상세 리포트 미제공)
    if (tier === 'basic') {
      var banner = W.el('div', { class: 'wz-an__notice' });
      banner.appendChild(W.el('span', { class: 'wz-an__notice-ic', html: IC.lock }));
      var nb = W.el('div', {});
      nb.appendChild(W.el('p', { class: 'wz-an__notice-title' }, 'Basic 요금제는 상세 리포트를 제공하지 않아요'));
      nb.appendChild(W.el('p', { class: 'wz-an__notice-desc' }, '요약과 리워드 분포만 확인할 수 있어요. 후원 추이·결제 현황·서포터 정보는 Plus / Professional 요금제에서 제공돼요.'));
      banner.appendChild(nb);
      refs.root.appendChild(banner);
    }

    // 본문: 좌측 섹션 메뉴 + 우측 패널
    var layout = W.el('div', { class: 'wz-an__layout' });
    refs.nav = W.el('aside', { class: 'wz-an__nav', role: 'tablist', 'aria-label': '분석 섹션' });
    refs.panel = W.el('div', { class: 'wz-an__panel' });
    layout.append(refs.nav, refs.panel);
    refs.root.appendChild(layout);

    refs.navBtns = {};
    SECTIONS.forEach(function (sec) {
      var btn = W.el('button', { class: 'wz-an__navitem', type: 'button', role: 'tab' });
      btn.appendChild(W.el('span', { class: 'wz-an__navic', html: IC[sec.icon] }));
      btn.appendChild(W.el('span', { class: 'wz-an__navlabel' }, sec.label));
      if (isLocked(sec)) btn.appendChild(W.el('span', { class: 'wz-an__navlock', html: IC.lock, 'aria-label': '잠김' }));
      btn.addEventListener('click', function () { selectSection(sec.key); });
      refs.navBtns[sec.key] = btn;
      refs.nav.appendChild(btn);
    });

    selectSection('summary');
  }

  function selectSection(key) {
    state.section = key;
    Object.keys(refs.navBtns).forEach(function (k) {
      refs.navBtns[k].classList.toggle('is-active', k === key);
      refs.navBtns[k].setAttribute('aria-selected', k === key ? 'true' : 'false');
    });
    refs.panel.replaceChildren();
    var sec = SECTIONS.find(function (s) { return s.key === key; }) || SECTIONS[0];
    var node;
    switch (key) {
      case 'summary':    node = renderSummary(); break;
      case 'funding':    node = renderFunding(); break;
      case 'likes':      node = renderLikes(); break;
      case 'rewards':    node = renderRewards(); break;
      case 'deposit':    node = renderDeposit(); break;
      case 'supporters': node = renderSupporters(); break;
      default:           node = renderSummary();
    }
    var card = W.el('section', { class: 'wz-an__section' });
    card.appendChild(sectionHead(sec));
    card.appendChild(node);
    refs.panel.appendChild(card);
  }

  function sectionHead(sec) {
    var h = W.el('div', { class: 'wz-an__sechead' });
    h.appendChild(W.el('span', { class: 'wz-an__secic', html: IC[sec.icon] }));
    h.appendChild(W.el('h2', { class: 'wz-an__sectitle' }, sec.label));
    return h;
  }

  /* ============ 잠금 판단 ============
   * 섹션의 lock 키가 lockedFeatures 에 있으면 잠김. (서포터는 'supporters' 완전잠금만 여기서 처리;
   * 'supporters_full' 은 서포터 패널 내부에서 부분 안내) */
  function isLocked(sec) { return !!(sec.lock && state.locked[sec.lock]); }

  /* 잠금 패널 — 자물쇠 + 흐리게 + 안내 */
  function lockedPanel(msg) {
    var box = W.el('div', { class: 'wz-an__locked' });
    box.appendChild(W.el('div', { class: 'wz-an__locked-ic', html: IC.lock }));
    box.appendChild(W.el('p', { class: 'wz-an__locked-title' }, 'Professional에서 제공'));
    box.appendChild(W.el('p', { class: 'wz-an__locked-desc' }, msg || '상위 요금제로 업그레이드하면 이 데이터를 볼 수 있어요.'));
    return box;
  }

  /* ============ 1) 요약 ============
   * summary: backerCount, totalAmount, targetAmount, achievementRate, likeCount,
   *          daysLeft, status, soldQuantity, viewCount, subscriberCount */
  function renderSummary() {
    var s = (state.data && state.data.summary) || {};
    var box = W.el('div', {});

    var rate = num(s.achievementRate);
    var backerCount = num(s.backerCount);
    var totalAmount = num(s.totalAmount);
    var likeCount = num(s.likeCount);
    var soldQuantity = num(s.soldQuantity);
    var viewCount = num(s.viewCount);
    var subscriberCount = num(s.subscriberCount);

    // 큰 숫자 카드
    var grid = W.el('div', { class: 'wz-an__stats' });
    grid.append(
      statCard(IC.users, '후원자', String(backerCount) + '명', backerCount === 0 ? '아직 후원이 없어요' : null),
      statCard(IC.coin, '총 모금액', W.money(totalAmount), totalAmount === 0 ? '확정 결제 대기 중' : null),
      statCard(IC.gift, '판매 수량', String(soldQuantity) + '개', null),
      statCard(IC.heart, '관심(좋아요)', String(likeCount), likeCount === 0 ? '아직 관심이 없어요' : null),
      statCard(IC.clock, '남은 기간', daysLeftText(s.daysLeft), null)
    );
    box.appendChild(grid);

    // 조회수/알림(있을 때만 — 추적값)
    var sub = W.el('div', { class: 'wz-an__substats' });
    sub.append(
      miniStat(IC.eye, '상세 조회수', String(viewCount)),
      miniStat(IC.bell, '공개예정 알림 신청', String(subscriberCount) + '명')
    );
    box.appendChild(sub);

    // 달성률 게이지(막대)
    var gauge = W.el('div', { class: 'wz-an__gauge' });
    var ghead = W.el('div', { class: 'wz-an__gauge-head' });
    ghead.append(
      W.el('span', { class: 'wz-an__gauge-label' }, '목표 달성률'),
      W.el('span', { class: 'wz-an__gauge-val' }, rate + '%')
    );
    gauge.appendChild(ghead);
    var track = W.el('div', { class: 'wz-an__gauge-track' });
    var fill = W.el('div', { class: 'wz-an__gauge-fill' + (rate >= 100 ? ' is-over' : '') });
    fill.style.width = Math.max(0, Math.min(100, rate)) + '%';
    track.appendChild(fill);
    gauge.appendChild(track);
    var goalNote = W.el('p', { class: 'wz-an__gauge-note' });
    var target = num(s.targetAmount);
    if (target > 0) {
      goalNote.textContent = W.money(totalAmount) + ' / 목표 ' + W.money(target);
    } else {
      goalNote.textContent = '확정 모금 ' + W.money(totalAmount) + ' · 수량 기준 달성률';
    }
    gauge.appendChild(goalNote);
    box.appendChild(gauge);

    return box;
  }

  function statCard(icon, label, value, hint) {
    var c = W.el('div', { class: 'wz-an__stat' });
    c.appendChild(W.el('span', { class: 'wz-an__stat-ic', html: icon }));
    c.appendChild(W.el('span', { class: 'wz-an__stat-label' }, label));
    c.appendChild(W.el('span', { class: 'wz-an__stat-val' }, value));
    if (hint) c.appendChild(W.el('span', { class: 'wz-an__stat-hint' }, hint));
    return c;
  }
  function miniStat(icon, label, value) {
    var c = W.el('div', { class: 'wz-an__mini' });
    c.appendChild(W.el('span', { class: 'wz-an__mini-ic', html: icon }));
    c.appendChild(W.el('span', { class: 'wz-an__mini-label' }, label));
    c.appendChild(W.el('span', { class: 'wz-an__mini-val' }, value));
    return c;
  }

  /* ============ 2) 후원 추이 ============
   * fundingTimeline: [{ date:'YYYY-MM-DD', backerCount, amount }] */
  function renderFunding() {
    if (state.locked.fundingTimeline) return lockedPanel('일자별 후원자 수와 모금액 추이는 Plus / Professional에서 확인할 수 있어요.');
    var rows = Array.isArray(state.data.fundingTimeline) ? state.data.fundingTimeline : [];
    if (!rows.length) return emptyHint('아직 후원이 없어요', '후원이 들어오면 일자별 추이가 여기에 표시돼요.');

    var box = W.el('div', {});
    // 토글: 후원자 수 / 모금액
    var toggle = W.el('div', { class: 'wz-an__toggle' });
    var byCountBtn = W.el('button', { class: 'wz-an__toggle-btn is-active', type: 'button' }, '후원자 수');
    var byAmountBtn = W.el('button', { class: 'wz-an__toggle-btn', type: 'button' }, '모금액');
    toggle.append(byCountBtn, byAmountBtn);
    box.appendChild(toggle);

    var chartHost = W.el('div', { class: 'wz-an__charthost' });
    box.appendChild(chartHost);

    function draw(mode) {
      byCountBtn.classList.toggle('is-active', mode === 'count');
      byAmountBtn.classList.toggle('is-active', mode === 'amount');
      var series = rows.map(function (r) {
        return {
          date: r.date,
          value: mode === 'count' ? num(r.backerCount) : num(r.amount),
          label: mode === 'count' ? (num(r.backerCount) + '명') : W.money(num(r.amount)),
        };
      });
      chartHost.replaceChildren(svgBars(series, mode === 'count' ? '일별 후원자 수' : '일별 모금액'));
    }
    byCountBtn.addEventListener('click', function () { draw('count'); });
    byAmountBtn.addEventListener('click', function () { draw('amount'); });
    draw('count');

    // 합계 요약
    var totalBackers = rows.reduce(function (s, r) { return s + num(r.backerCount); }, 0);
    var totalAmount = rows.reduce(function (s, r) { return s + num(r.amount); }, 0);
    var sum = W.el('p', { class: 'wz-an__chartsum' },
      '기간 합계 · 후원 ' + totalBackers + '명 · ' + W.money(totalAmount));
    box.appendChild(sum);
    return box;
  }

  /* ============ 3) 관심(좋아요) 추이 ============
   * likeTimeline: [{ date:'YYYY-MM-DD', count }] */
  function renderLikes() {
    if (state.locked.likeTimeline) return lockedPanel('일자별 관심(좋아요) 추이는 Plus / Professional에서 확인할 수 있어요.');
    var rows = Array.isArray(state.data.likeTimeline) ? state.data.likeTimeline : [];
    if (!rows.length) return emptyHint('아직 관심이 없어요', '프로젝트에 좋아요가 쌓이면 일자별 추이가 여기에 표시돼요.');

    var box = W.el('div', {});
    var series = rows.map(function (r) {
      return { date: r.date, value: num(r.count), label: num(r.count) + '개' };
    });
    box.appendChild(svgBars(series, '일별 관심(좋아요) 수'));
    var total = rows.reduce(function (s, r) { return s + num(r.count); }, 0);
    box.appendChild(W.el('p', { class: 'wz-an__chartsum' }, '기간 합계 · 좋아요 ' + total + '개'));
    return box;
  }

  /* ============ 4) 리워드 분포 ============ (전 티어 공통)
   * rewardBreakdown: [{ rewardLabel, count, amount }] */
  function renderRewards() {
    var rows = Array.isArray(state.data.rewardBreakdown) ? state.data.rewardBreakdown : [];
    if (!rows.length) return emptyHint('아직 후원이 없어요', '후원이 들어오면 리워드별 선택 분포가 여기에 표시돼요.');

    var maxCount = rows.reduce(function (m, r) { return Math.max(m, num(r.count)); }, 0) || 1;
    var box = W.el('div', { class: 'wz-an__rewards' });
    rows.forEach(function (r) {
      var row = W.el('div', { class: 'wz-an__rwrow' });
      var top = W.el('div', { class: 'wz-an__rwtop' });
      top.append(
        W.el('span', { class: 'wz-an__rwlabel' }, r.rewardLabel || '리워드'),
        W.el('span', { class: 'wz-an__rwcount' }, num(r.count) + '건')
      );
      row.appendChild(top);
      var track = W.el('div', { class: 'wz-an__rwtrack' });
      var fill = W.el('div', { class: 'wz-an__rwfill' });
      fill.style.width = Math.round((num(r.count) / maxCount) * 100) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(W.el('p', { class: 'wz-an__rwamount' }, W.money(num(r.amount))));
      box.appendChild(row);
    });
    return box;
  }

  /* ============ 5) 결제(입금) 현황 ============
   * depositStatus: { confirmedCount, pendingCount, confirmedAmount, pendingAmount } | null */
  function renderDeposit() {
    if (state.locked.depositStatus) return lockedPanel('입금 확정·대기 현황은 Plus / Professional에서 확인할 수 있어요.');
    var d = state.data.depositStatus;
    if (!d) return emptyHint('입금 데이터가 없어요', '후원이 들어오면 확정/대기 현황이 여기에 표시돼요.');

    var confirmedCount = num(d.confirmedCount);
    var pendingCount = num(d.pendingCount);
    var confirmedAmount = num(d.confirmedAmount);
    var pendingAmount = num(d.pendingAmount);
    var maxCount = Math.max(confirmedCount, pendingCount, 1);

    if (confirmedCount === 0 && pendingCount === 0) {
      return emptyHint('아직 결제 건이 없어요', '후원이 들어오면 입금 확정/대기 현황이 여기에 표시돼요.');
    }

    var box = W.el('div', { class: 'wz-an__deposit' });
    box.appendChild(depositBar('입금 확정', confirmedCount, confirmedAmount, maxCount, 'confirmed'));
    box.appendChild(depositBar('입금 대기', pendingCount, pendingAmount, maxCount, 'pending'));

    var foot = W.el('div', { class: 'wz-an__deposit-foot' });
    var totalCount = confirmedCount + pendingCount;
    var confirmRate = totalCount > 0 ? Math.round((confirmedCount / totalCount) * 100) : 0;
    foot.appendChild(W.el('p', { class: 'wz-an__deposit-rate' }, '입금 확정률 ' + confirmRate + '%'));
    foot.appendChild(W.el('p', { class: 'wz-an__deposit-note' },
      '확정 ' + W.money(confirmedAmount) + ' · 대기 ' + W.money(pendingAmount)));
    box.appendChild(foot);
    return box;
  }
  function depositBar(label, count, amount, maxCount, kind) {
    var row = W.el('div', { class: 'wz-an__dbrow' });
    var top = W.el('div', { class: 'wz-an__dbtop' });
    top.append(
      W.el('span', { class: 'wz-an__dblabel wz-an__dblabel--' + kind }, label),
      W.el('span', { class: 'wz-an__dbcount' }, count + '건 · ' + W.money(amount))
    );
    row.appendChild(top);
    var track = W.el('div', { class: 'wz-an__dbtrack' });
    var fill = W.el('div', { class: 'wz-an__dbfill wz-an__dbfill--' + kind });
    fill.style.width = Math.round((count / maxCount) * 100) + '%';
    track.appendChild(fill);
    row.appendChild(track);
    return row;
  }

  /* ============ 6) 서포터 정보 ============
   * supporters: [{ nickname, amount, rewardLabel, status, backedAt }]
   *  - 완전잠금(basic, locked.supporters): 잠금 패널.
   *  - 부분(plus, locked.supporters_full): 최근 일부만 + "전체는 Professional" 안내. */
  function renderSupporters() {
    if (state.locked.supporters) {
      return lockedPanel('후원해 주신 서포터 목록은 Plus / Professional에서 확인할 수 있어요.');
    }
    var rows = Array.isArray(state.data.supporters) ? state.data.supporters : [];
    var box = W.el('div', {});

    if (!rows.length) {
      box.appendChild(emptyHint('아직 서포터가 없어요', '후원이 들어오면 서포터 정보가 여기에 표시돼요.'));
      if (state.locked.supporters_full) box.appendChild(partialSupporterNote());
      return box;
    }

    // 부분 공개 안내(plus)
    if (state.locked.supporters_full) box.appendChild(partialSupporterNote());

    var table = W.el('div', { class: 'wz-an__sup' });
    // 헤더 행
    var head = W.el('div', { class: 'wz-an__suprow wz-an__suprow--head' });
    ['서포터', '리워드', '금액', '상태', '일시'].forEach(function (h, i) {
      head.appendChild(W.el('span', { class: 'wz-an__supcell wz-an__supcell--c' + i }, h));
    });
    table.appendChild(head);

    rows.forEach(function (sp) {
      var row = W.el('div', { class: 'wz-an__suprow' });
      // 닉네임(개인정보 없음; 빈 값은 익명 서포터)
      var nameCell = W.el('span', { class: 'wz-an__supcell wz-an__supcell--c0' });
      nameCell.appendChild(W.el('span', { class: 'wz-an__supav', html: IC.user }));
      nameCell.appendChild(W.el('span', { class: 'wz-an__supname' }, (sp.nickname && String(sp.nickname).trim()) ? sp.nickname : '익명 서포터'));
      row.appendChild(nameCell);
      row.appendChild(W.el('span', { class: 'wz-an__supcell wz-an__supcell--c1' }, sp.rewardLabel || '-'));
      row.appendChild(W.el('span', { class: 'wz-an__supcell wz-an__supcell--c2' }, W.money(num(sp.amount))));
      var stCell = W.el('span', { class: 'wz-an__supcell wz-an__supcell--c3' });
      var st = supStatus(sp.status);
      stCell.appendChild(W.el('span', { class: 'wz-an__supbadge wz-an__supbadge--' + st.cls }, st.label));
      row.appendChild(stCell);
      row.appendChild(W.el('span', { class: 'wz-an__supcell wz-an__supcell--c4' }, fmtDate(sp.backedAt)));
      table.appendChild(row);
    });
    box.appendChild(table);
    box.appendChild(W.el('p', { class: 'wz-an__supcount' }, '총 ' + rows.length + '명 표시'));
    return box;
  }
  function partialSupporterNote() {
    var n = W.el('div', { class: 'wz-an__partial' });
    n.appendChild(W.el('span', { class: 'wz-an__partial-ic', html: IC.lock }));
    n.appendChild(W.el('p', { class: 'wz-an__partial-txt' },
      '최근 서포터 일부만 표시돼요. 전체 서포터 목록은 Professional 요금제에서 제공돼요.'));
    return n;
  }
  function supStatus(s) {
    if (String(s) === 'confirmed') return { label: '확정', cls: 'confirmed' };
    return { label: '입금 대기', cls: 'awaiting' };
  }

  /* ============ 공용 차트: 인라인 SVG 막대 ============
   * series: [{ date:'YYYY-MM-DD', value:number, label:string }]
   * 외부 라이브러리 없이 SVG rect 로 그림. <title> 로 hover 툴팁. */
  function svgBars(series, ariaLabel) {
    var SVGNS = 'http://www.w3.org/2000/svg';
    var VW = 100, VH = 100; // viewBox(%), preserveAspectRatio none
    var n = series.length;
    var max = series.reduce(function (m, d) { return Math.max(m, num(d.value)); }, 0);
    if (max <= 0) max = 1;
    var gap = Math.min(2.4, 14 / Math.max(1, n));
    var bw = (VW - gap * (n + 1)) / n;

    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'wz-an__bars');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', ariaLabel || '추이');

    series.forEach(function (d, i) {
      var v = num(d.value);
      var bh = (v / max) * (VH - 4); // 상단 여백 4
      var x = gap + i * (bw + gap);
      var rect = document.createElementNS(SVGNS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(VH - Math.max(bh, v > 0 ? 1 : 0.5)));
      rect.setAttribute('width', String(Math.max(bw, 0.5)));
      rect.setAttribute('height', String(Math.max(bh, v > 0 ? 1 : 0.5)));
      rect.setAttribute('rx', '0.8');
      rect.setAttribute('class', v > 0 ? 'wz-an__bar' : 'wz-an__bar is-zero');
      var t = document.createElementNS(SVGNS, 'title');
      t.textContent = (d.date ? fmtDay(d.date) : '') + ' · ' + (d.label != null ? d.label : v);
      rect.appendChild(t);
      svg.appendChild(rect);
    });

    var chartBox = W.el('div', { class: 'wz-an__barsbox' });
    chartBox.appendChild(svg);
    var axis = W.el('div', { class: 'wz-an__barsaxis' });
    var first = series[0] && series[0].date ? mmdd(series[0].date) : '';
    var last = series[n - 1] && series[n - 1].date ? mmdd(series[n - 1].date) : '';
    axis.append(W.el('span', {}, first), W.el('span', {}, last));
    var wrap = W.el('div', { class: 'wz-an__barswrap' });
    wrap.append(chartBox, axis);
    return wrap;
  }

  /* ============ 공용 빈/로딩/상태 ============ */
  function emptyHint(title, desc) {
    var box = W.el('div', { class: 'wz-an__empty' });
    box.appendChild(W.el('div', { class: 'wz-an__empty-ic', html: IC.chart }));
    box.appendChild(W.el('p', { class: 'wz-an__empty-title' }, title));
    if (desc) box.appendChild(W.el('p', { class: 'wz-an__empty-desc' }, desc));
    return box;
  }
  function loadingBox() { return W.el('div', { class: 'wz-an__loading' }, '분석 리포트를 불러오는 중...'); }
  // onClick(선택): 버튼을 링크 대신 콜백으로.
  function stateBox(icon, title, desc, btnLabel, btnHref, onClick) {
    var box = W.el('div', { class: 'wz-an__state' });
    box.appendChild(W.el('div', { class: 'wz-an__state-ic', html: icon }));
    box.appendChild(W.el('h2', { class: 'wz-an__state-title' }, title));
    if (desc) box.appendChild(W.el('p', { class: 'wz-an__state-desc' }, desc));
    if (btnLabel) {
      if (onClick) {
        var b = W.el('button', { class: 'wz-an__state-btn', type: 'button' }, btnLabel);
        b.addEventListener('click', onClick);
        box.appendChild(b);
      } else if (btnHref) {
        box.appendChild(W.el('a', { class: 'wz-an__state-btn', href: btnHref }, btnLabel));
      }
    }
    return box;
  }

  /* ============ 유틸 ============ */
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function mapTier(t) {
    if (t === 'pro' || t === 'plus' || t === 'basic') return t;
    if (t === 'boost') return 'pro';
    if (t === 'run') return 'plus';
    return 'basic';
  }
  function daysLeftText(d) {
    if (d == null) return '상시';
    var n = num(d);
    if (n <= 0) return '마감';
    return n + '일';
  }
  // 'YYYY-MM-DD' → 'MM.DD'
  function mmdd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? (m[2] + '.' + m[3]) : String(s || '');
  }
  // 'YYYY-MM-DD' → 'YYYY.MM.DD'
  function fmtDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? (m[1] + '.' + m[2] + '.' + m[3]) : String(s || '');
  }
  // ISO → 'YYYY.MM.DD'
  function fmtDate(iso) {
    if (!iso) return '-';
    var t = new Date(iso);
    if (isNaN(t.getTime())) return '-';
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return t.getFullYear() + '.' + p(t.getMonth() + 1) + '.' + p(t.getDate());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
