/* =====================================================================
 * 두띵 — 알림 센터 (전역, 모든 페이지 공통)
 *
 * - 헤더 종(bell) 아이콘 클릭 → 우측 슬라이드 패널(wz 톤) 열림
 * - 데이터 출처: window.MOCK_PRODUCTS(GET /api/groupbuys 실데이터) 중
 *   현재 사용자가 예약/참여한 항목(isReserved === true). 없는 알림은 지어내지 않음.
 *     · 100% 달성 + 미결제 → 결제 유도
 *     · 결제 완료 → 상세 이동
 *     · 진행 중 → 상세 이동
 * - 읽음 상태: 서버 알림 API 가 없으므로 localStorage('readNotifications')
 *   의 읽은 알림 id 집합으로 관리. 패널을 열면 전체 읽음, 항목 클릭 시 해당 읽음.
 * - 미확인 배지: #wz-bell(없으면 aria-label="알림" 아이콘)에 빨간 원형 배지.
 *   1~99 숫자, 99 초과 "99+", 0 이면 숨김.
 *
 * 규칙: Vanilla JS, 전역 window.WZ / window.api 재사용. 이모지 금지(SVG 만).
 *       색은 tokens.css 변수(보라 --c-primary-*). 다크모드 반응형 없음.
 *       사용자/외부 데이터는 textContent 또는 escapeHTML 로만 삽입(XSS 안전).
 * ===================================================================== */
(function () {
  var W = window.WZ || {};
  var esc = (typeof window.escapeHTML === 'function')
    ? window.escapeHTML
    : (W && W.esc) || function (v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      };
  // 외부 폴백 노출(다른 스크립트 호환)
  if (typeof window.escapeHTML !== 'function') window.escapeHTML = esc;

  var STYLE_ID = 'wz-notif-style';
  var READ_KEY = 'readNotifications';

  /* ===== 스타일 주입(1회) — wz 톤, tokens.css 변수만 사용 ===== */
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ''
      + '.wz-notif{display:none;position:fixed;inset:0;z-index:1200;}'
      + '.wz-notif__backdrop{position:absolute;inset:0;background:rgba(16,24,40,.45);'
        + 'opacity:0;transition:opacity .28s ease;}'
      + '.wz-notif.is-open .wz-notif__backdrop{opacity:1;}'
      + '.wz-notif__panel{position:absolute;top:0;right:0;width:100%;max-width:400px;height:100%;'
        + 'background:var(--c-surface,#fff);box-shadow:var(--sh-3,-8px 0 24px rgba(16,24,40,.12));'
        + 'display:flex;flex-direction:column;transform:translateX(100%);transition:transform .28s ease;'
        + 'font-family:var(--font-sans);}'
      + '.wz-notif.is-open .wz-notif__panel{transform:translateX(0);}'
      + '.wz-notif__head{display:flex;align-items:center;justify-content:space-between;gap:8px;'
        + 'padding:var(--sp-4,16px) var(--sp-5,20px);border-bottom:1px solid var(--c-divider,#F3F4F6);}'
      + '.wz-notif__title{display:flex;align-items:center;gap:8px;font-size:var(--fs-h3,18px);'
        + 'font-weight:700;color:var(--c-text,#1A1A1A);}'
      + '.wz-notif__title svg{width:20px;height:20px;color:var(--c-primary-500,#8B5CF6);}'
      + '.wz-notif__count{min-width:20px;height:20px;padding:0 6px;border-radius:var(--r-full,999px);'
        + 'background:var(--c-primary-50,#F5F3FF);color:var(--c-primary-700,#6D28D9);'
        + 'font-size:var(--fs-caption,12px);font-weight:700;display:inline-flex;align-items:center;'
        + 'justify-content:center;line-height:1;}'
      + '.wz-notif__close{background:none;border:none;cursor:pointer;padding:6px;border-radius:var(--r-sm,8px);'
        + 'color:var(--c-text-muted,#6B7280);display:inline-flex;}'
      + '.wz-notif__close:hover{background:var(--c-primary-50,#F5F3FF);color:var(--c-primary-600,#7C3AED);}'
      + '.wz-notif__close svg{width:22px;height:22px;}'
      + '.wz-notif__list{flex:1;overflow-y:auto;padding:var(--sp-3,12px);display:flex;flex-direction:column;gap:var(--sp-2,8px);}'
      + '.wz-notif__item{display:block;text-decoration:none;color:inherit;border:1px solid var(--c-border,#E5E7EB);'
        + 'border-radius:var(--r-md,12px);padding:var(--sp-3,12px) var(--sp-4,16px);background:var(--c-surface,#fff);'
        + 'box-shadow:var(--sh-1,0 1px 2px rgba(16,24,40,.06));transition:box-shadow .16s,border-color .16s,background .16s;}'
      + '.wz-notif__item:hover{box-shadow:var(--sh-2,0 4px 12px rgba(16,24,40,.08));border-color:var(--c-primary-200,#DDD6FE);}'
      + '.wz-notif__item.is-unread{background:var(--c-primary-50,#F5F3FF);border-color:var(--c-primary-200,#DDD6FE);}'
      + '.wz-notif__row{display:flex;gap:var(--sp-3,12px);align-items:center;}'
      + '.wz-notif__udot{width:8px;height:8px;border-radius:50%;background:var(--c-primary-500,#8B5CF6);flex-shrink:0;}'
      + '.wz-notif__item:not(.is-unread) .wz-notif__udot{visibility:hidden;}'
      + '.wz-notif__thumb{width:52px;height:52px;border-radius:var(--r-sm,8px);overflow:hidden;flex-shrink:0;'
        + 'background:var(--c-divider,#F3F4F6);}'
      + '.wz-notif__thumb img{width:100%;height:100%;object-fit:cover;display:block;}'
      + '.wz-notif__body{flex:1;min-width:0;}'
      + '.wz-notif__name{font-size:var(--fs-body-sm,14px);font-weight:600;color:var(--c-text,#1A1A1A);'
        + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.wz-notif__item.is-unread .wz-notif__name{font-weight:700;}'
      + '.wz-notif__msg{font-size:var(--fs-caption,12px);margin-top:3px;color:var(--c-text-muted,#6B7280);}'
      + '.wz-notif__msg--go{color:var(--c-primary-600,#7C3AED);font-weight:600;}'
      + '.wz-notif__msg--done{color:var(--c-success,#16A34A);font-weight:600;}'
      + '.wz-notif__progress{height:6px;border-radius:var(--r-full,999px);background:var(--c-primary-100,#EDE9FE);'
        + 'overflow:hidden;margin-top:8px;}'
      + '.wz-notif__progress > span{display:block;height:100%;background:var(--c-primary-500,#8B5CF6);'
        + 'border-radius:var(--r-full,999px);}'
      + '.wz-notif__progress--done > span{background:var(--c-success,#16A34A);}'
      + '.wz-notif__cta{display:flex;width:100%;align-items:center;justify-content:center;margin-top:10px;'
        + 'height:42px;border-radius:var(--r-md,12px);background:var(--c-primary-500,#8B5CF6);color:#fff;'
        + 'font-size:var(--fs-body-sm,14px);font-weight:700;text-decoration:none;transition:background .16s;}'
      + '.wz-notif__cta:hover{background:var(--c-primary-600,#7C3AED);}'
      + '.wz-notif__meta{display:flex;justify-content:space-between;gap:8px;margin-top:6px;}'
      + '.wz-notif__rate{font-size:var(--fs-caption,12px);font-weight:700;color:var(--c-primary-700,#6D28D9);}'
      + '.wz-notif__rate--done{color:var(--c-success,#16A34A);}'
      + '.wz-notif__size{font-size:var(--fs-caption,12px);color:var(--c-text-faint,#9CA3AF);}'
      + '.wz-notif__empty{display:flex;flex-direction:column;align-items:center;text-align:center;'
        + 'padding:72px 24px;color:var(--c-text-faint,#9CA3AF);}'
      + '.wz-notif__empty svg{width:48px;height:48px;color:var(--c-primary-200,#DDD6FE);margin-bottom:14px;}'
      + '.wz-notif__empty strong{font-size:var(--fs-body,16px);font-weight:600;color:var(--c-text-sub,#4B5563);}'
      + '.wz-notif__empty span{font-size:var(--fs-body-sm,14px);margin-top:6px;}'
      // 레거시(main.js) aria-label="알림" 버튼용 배지(.wz-hd__icon 이 아닐 때)
      + '.wz-notif-badge{position:absolute;top:0;right:0;min-width:16px;height:16px;padding:0 4px;'
        + 'border-radius:999px;background:var(--c-danger,#EF4444);color:#fff;font-size:10px;font-weight:700;'
        + 'line-height:16px;display:none;align-items:center;justify-content:center;}';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ===== 읽음 상태(localStorage) ===== */
  function getReadIds() {
    var ids;
    try { ids = JSON.parse(localStorage.getItem(READ_KEY) || '[]'); }
    catch (e) { ids = []; }
    return Array.isArray(ids) ? ids : [];
  }
  function saveReadIds(ids) {
    try { localStorage.setItem(READ_KEY, JSON.stringify(ids)); } catch (e) { /* noop */ }
  }
  function isRead(id) {
    return getReadIds().indexOf(id) !== -1;
  }
  function markRead(id) {
    var ids = getReadIds();
    if (ids.indexOf(id) === -1) { ids.push(id); saveReadIds(ids); }
    updateNotificationBadges();
  }

  /* ===== 데이터: 예약/참여한 항목(기존 출처 유지) ===== */
  function getNotifications() {
    var products = (Array.isArray(window.MOCK_PRODUCTS)) ? window.MOCK_PRODUCTS : [];
    return products.filter(function (p) { return p && p.isReserved === true; });
  }

  function rateOf(item) {
    if (typeof calcAchievementRate === 'function') return calcAchievementRate(item);
    if (!item.targetQuantity) return 0;
    return Math.round((item.currentQuantity / item.targetQuantity) * 100);
  }

  /* ===== 패널 생성 ===== */
  function ensurePanel() {
    if (document.getElementById('notificationPanel')) return;
    ensureStyle();

    var panel = document.createElement('div');
    panel.id = 'notificationPanel';
    panel.className = 'wz-notif';
    // 정적 셸 — 사용자 데이터 없음.
    panel.innerHTML = ''
      + '<div class="wz-notif__backdrop" data-notif-close></div>'
      + '<aside class="wz-notif__panel" role="dialog" aria-label="알림 내역" aria-modal="true">'
      +   '<div class="wz-notif__head">'
      +     '<div class="wz-notif__title">'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>'
      +       '<span>알림</span>'
      +       '<span class="wz-notif__count" id="notifCount" hidden></span>'
      +     '</div>'
      +     '<button type="button" class="wz-notif__close" data-notif-close aria-label="닫기">'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>'
      +     '</button>'
      +   '</div>'
      +   '<div class="wz-notif__list" id="notifList"></div>'
      + '</aside>';
    document.body.appendChild(panel);

    // 닫기 핸들러(백드롭/닫기 버튼)
    panel.querySelectorAll('[data-notif-close]').forEach(function (n) {
      n.addEventListener('click', closeNotification);
    });
    // ESC 로 닫기
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) closeNotification();
    });
  }

  /* ===== 열기/닫기 ===== */
  function openNotification() {
    ensurePanel();
    var panel = document.getElementById('notificationPanel');
    if (!panel) return;
    panel.style.display = 'block';
    renderList();
    // reflow 후 transition 적용
    requestAnimationFrame(function () { panel.classList.add('is-open'); });
    // 패널 열면 전체 읽음 처리 → 배지 갱신
    markAllAsRead();
  }

  function closeNotification() {
    var panel = document.getElementById('notificationPanel');
    if (!panel) return;
    panel.classList.remove('is-open');
    setTimeout(function () { panel.style.display = 'none'; }, 300);
  }

  /* ===== 리스트 렌더링 ===== */
  function renderList() {
    var container = document.getElementById('notifList');
    if (!container) return;

    var items = getNotifications();
    var countEl = document.getElementById('notifCount');
    if (countEl) {
      if (items.length > 0) { countEl.textContent = String(items.length); countEl.hidden = false; }
      else { countEl.hidden = true; }
    }

    if (items.length === 0) {
      container.innerHTML = ''
        + '<div class="wz-notif__empty">'
        +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>'
        +   '<strong>알림이 없습니다</strong>'
        +   '<span>공구에 참여하면 알림을 받을 수 있어요</span>'
        + '</div>';
      return;
    }

    container.innerHTML = items.map(function (item) {
      var rate = rateOf(item);
      var capped = Math.min(rate, 100);
      var achieved = rate >= 100;
      var size = localStorage.getItem('selectedSize_' + item.id) || 'Free';

      var id = encodeURIComponent(item.id);
      var title = esc(item.title);
      var imageUrl = esc(item.imageUrl);
      var safeSize = esc(size);
      var sizeForUrl = encodeURIComponent(size);
      var unread = !isRead(item.id) ? ' is-unread' : '';
      var dataId = esc(item.id);

      var thumb = imageUrl
        ? '<div class="wz-notif__thumb"><img src="' + imageUrl + '" alt="' + title + '"></div>'
        : '<div class="wz-notif__thumb"></div>';

      if (achieved && !item.isPaid) {
        // 100% 달성 + 미결제 → 결제 유도 (CTA 는 별도 링크, 항목 본체는 상세)
        return ''
          + '<div class="wz-notif__item' + unread + '" data-notif-id="' + dataId + '">'
          +   '<a class="wz-notif__row" href="detail.html?id=' + id + '" data-notif-link data-notif-id="' + dataId + '" style="text-decoration:none;color:inherit;">'
          +     '<span class="wz-notif__udot" aria-hidden="true"></span>'
          +     thumb
          +     '<span class="wz-notif__body">'
          +       '<span class="wz-notif__name">' + title + '</span>'
          +       '<span class="wz-notif__msg wz-notif__msg--go">100% 달성! 결제를 진행해 주세요</span>'
          +     '</span>'
          +   '</a>'
          +   '<div class="wz-notif__progress wz-notif__progress--done"><span style="width:100%"></span></div>'
          +   '<div class="wz-notif__meta">'
          +     '<span class="wz-notif__rate wz-notif__rate--done">' + rate + '% 달성</span>'
          +     '<span class="wz-notif__size">사이즈: ' + safeSize + '</span>'
          +   '</div>'
          +   '<a class="wz-notif__cta" href="payment.html?id=' + id + '&size=' + sizeForUrl + '" data-notif-link data-notif-id="' + dataId + '">결제하기</a>'
          + '</div>';
      }

      if (item.isPaid) {
        // 결제 완료 → 상세
        return ''
          + '<a class="wz-notif__item' + unread + '" href="detail.html?id=' + id + '" data-notif-link data-notif-id="' + dataId + '">'
          +   '<div class="wz-notif__row">'
          +     '<span class="wz-notif__udot" aria-hidden="true"></span>'
          +     thumb
          +     '<div class="wz-notif__body">'
          +       '<div class="wz-notif__name">' + title + '</div>'
          +       '<div class="wz-notif__msg wz-notif__msg--done">결제 완료</div>'
          +     '</div>'
          +   '</div>'
          + '</a>';
      }

      // 진행 중 → 상세
      return ''
        + '<a class="wz-notif__item' + unread + '" href="detail.html?id=' + id + '" data-notif-link data-notif-id="' + dataId + '">'
        +   '<div class="wz-notif__row">'
        +     '<span class="wz-notif__udot" aria-hidden="true"></span>'
        +     thumb
        +     '<div class="wz-notif__body">'
        +       '<div class="wz-notif__name">' + title + '</div>'
        +       '<div class="wz-notif__msg">공구가 현재 ' + rate + '% 진행 중입니다</div>'
        +       '<div class="wz-notif__progress"><span style="width:' + capped + '%"></span></div>'
        +     '</div>'
        +   '</div>'
        + '</a>';
    }).join('');

    // 항목 클릭 → 해당 읽음 처리(이동은 링크 기본 동작)
    container.querySelectorAll('[data-notif-link]').forEach(function (a) {
      a.addEventListener('click', function () {
        var nid = a.getAttribute('data-notif-id');
        if (nid) markRead(nid);
      });
    });
  }

  /* ===== 미확인 배지 ===== */
  function getUnreadCount() {
    var items = getNotifications();
    var readIds = getReadIds();
    return items.filter(function (p) { return readIds.indexOf(p.id) === -1; }).length;
  }

  function markAllAsRead() {
    var ids = getNotifications().map(function (p) { return p.id; });
    // 기존 읽음 + 현재 알림 전체(중복 제거)
    var merged = getReadIds().slice();
    ids.forEach(function (id) { if (merged.indexOf(id) === -1) merged.push(id); });
    saveReadIds(merged);
    updateNotificationBadges();
  }

  // 헤더 종 아이콘 후보: 우선 #wz-bell, 없으면 wz 헤더의 알림 아이콘, 그 외 aria-label="알림"
  function getBellTargets() {
    var targets = [];
    var seen = [];
    function add(n) { if (n && seen.indexOf(n) === -1) { seen.push(n); targets.push(n); } }
    var byId = document.getElementById('wz-bell');
    if (byId) add(byId);
    document.querySelectorAll('.wz-hd__icon[aria-label="알림"]').forEach(add);
    document.querySelectorAll('[aria-label="알림"]').forEach(add);
    return targets;
  }

  function updateNotificationBadges() {
    var count = getUnreadCount();
    var label = count > 99 ? '99+' : String(count);
    getBellTargets().forEach(function (el) {
      var isWzIcon = el.classList && el.classList.contains('wz-hd__icon');
      var badge = el.querySelector(isWzIcon ? '.wz-dot' : '.wz-notif-badge');
      if (count <= 0) { if (badge) badge.style.display = 'none'; return; }
      if (!badge) {
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        badge = document.createElement('span');
        // wz 헤더 아이콘은 wz.css 의 .wz-dot 재사용, 그 외(레거시)는 자체 배지 클래스
        badge.className = isWzIcon ? 'wz-dot' : 'wz-notif-badge';
        badge.setAttribute('aria-hidden', 'true');
        el.appendChild(badge);
      }
      badge.textContent = label;
      badge.style.display = 'flex';
    });
  }

  // wz 헤더 종은 <a href="/notice.html"> — 클릭 시 슬라이드 패널 열도록 가로채기(1회 바인딩)
  function bindBellClicks() {
    getBellTargets().forEach(function (el) {
      if (el.getAttribute('data-notif-bound') === '1') return;
      el.setAttribute('data-notif-bound', '1');
      el.addEventListener('click', function (e) {
        // 앵커면 기본 이동 막고 패널 오픈(레거시 button 은 main.js 가 이미 openNotification 호출하므로 중복 방지)
        if (el.tagName === 'A') {
          e.preventDefault();
          openNotification();
        }
      });
    });
  }

  function injectNotificationBadges() {
    ensureStyle();
    bindBellClicks();
    updateNotificationBadges();
  }

  /* ===== 전역 노출 ===== */
  window.openNotification = openNotification;
  window.closeNotification = closeNotification;
  window.renderNotificationList = renderList;
  window.updateNotificationBadges = updateNotificationBadges;
  window.injectNotificationBadges = injectNotificationBadges;

  /* ===== 초기화 ===== */
  function init() {
    injectNotificationBadges();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 헤더가 동적으로 추가되는 wz 페이지: 벨이 늦게 생기거나 데이터가 늦게 로드돼도 배지 갱신
  window.addEventListener('mockproducts:updated', injectNotificationBadges);
  // wz-core 헤더 주입 직후를 대비한 짧은 지연 재시도(셸 에이전트의 #wz-bell 부여 포함)
  setTimeout(injectNotificationBadges, 400);
})();
