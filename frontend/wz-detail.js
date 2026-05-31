/* =====================================================================
 * 두띵 — 와디즈 클론 프로젝트 상세 (from scratch). 전역 WZ(wz-core.js) 사용.
 * 데이터: GET /api/groupbuys/:id (?id= 쿼리). 후원: POST /api/funds/:id/back.
 * 팔로우: GET/POST/DELETE /api/users/:id/follow. 찜: window.toggleLike/isLiked.
 * 이모지 금지(SVG만). 사용자값은 문자열 자식(textContent) 또는 WZ.esc.
 * ===================================================================== */
(function () {
  const W = window.WZ;

  /* 페이지 전용 인라인 SVG (stroke=currentColor) */
  const SVG = {
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0V4z"/><path d="M6 6H4a2 2 0 0 0 0 4h2M18 6h2a2 2 0 0 1 0 4h-2"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V4z"/><path d="M8 8h7M8 12h7M8 16h4"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.9L12 16.9 6.8 19.2l1-5.9L3.5 9.2l5.9-.9L12 3z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    /* 브랜드 글리프 — 단색 currentColor fill */
    kakao: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.7-1.8 3.8-2.6.6.1 1.3.1 1.9.1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>',
    twitterX: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.2 2.5h3.3l-7.2 8.2 8.5 11.3h-6.7l-5.2-6.8-6 6.8H1.6l7.7-8.8L1.2 2.5h6.8l4.7 6.2 5.5-6.2zm-1.2 17.6h1.8L7.1 4.3H5.2l11.8 15.8z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg>',
  };

  /* 소유자 수정 모달 전용 아이콘(stroke=currentColor) */
  const EDIT_IC = {
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none"/></svg>',
  };

  const root = document.getElementById('wz-detail');

  /* ===================================================================
   * 스토리 HTML 새니타이즈 (DOMPurify) — 렌더 시점 1차 방어.
   * 공유 allowlist 와 동일. DOMPurify 미로드 시 빈 문자열 반환(안전측 가드).
   * 저장된 HTML 에 악성 코드가 있어도 화면 삽입 전에 제거 → 실행 불가.
   * =================================================================== */
  var _wzPurifyHookDone = false;
  function wzInstallPurifyHook() {
    if (_wzPurifyHookDone || !window.DOMPurify || typeof DOMPurify.addHook !== 'function') return;
    // iframe src 화이트리스트(youtube/youtube-nocookie/vimeo embed 아니면 노드 제거). 1회 등록.
    DOMPurify.addHook('uponSanitizeElement', function (node, data) {
      if (data.tagName === 'iframe') {
        var src = (node.getAttribute && node.getAttribute('src')) || '';
        if (!/^https:\/\/(www\.youtube\.com\/embed\/|www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(src)) {
          if (typeof node.remove === 'function') node.remove();
        }
      }
    });
    _wzPurifyHookDone = true;
  }
  function wzSanitize(html) {
    if (!window.DOMPurify) return ''; // 가드: 미로드 시 빈값(안전측)
    wzInstallPurifyHook();
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'mark', 'span', 'div', 'ul', 'ol', 'li', 'blockquote', 'hr', 'a', 'img', 'figure', 'figcaption', 'iframe', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'audio', 'video', 'source'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height', 'style', 'class', 'data-align', 'data-width', 'controls', 'allow', 'allowfullscreen', 'frameborder', 'colspan', 'rowspan'],
      ALLOW_DATA_ATTR: true,
      ADD_ATTR: ['target'],
    });
  }

  /* ---------- helpers ---------- */
  function getId() {
    const u = new URL(location.href);
    return u.searchParams.get('id') || '';
  }
  // 마감 D-day 는 공유 KST 함수(WZ.dday)로 통일 — 카드(밖)와 동일 기준(한국시간). 로컬/UTC 차이로 인한 불일치 제거.
  function daysLeft(deadline) {
    return W.dday(deadline);
  }
  function fmtPeriod(deadline) {
    if (!deadline) return null;
    const d = new Date(deadline);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0') + ' 마감';
  }
  /* YYYY.MM.DD 한 줄 날짜 — 펀딩 기간/결제일 등 상세 dl 표기용. 파싱 불가면 null. */
  function fmtDate(v) {
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }
  /* 마감 다음날(N일 차) 날짜 — 텀블벅식 "목표 달성 시 마감 다음날 결제". 마감 없으면 null. */
  function fmtDatePlusDays(v, plus) {
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + (Number(plus) || 0));
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }
  /* D-day 라벨/상태 산출. null 이면 기간 정보 없음(배지 미노출).
   *  - 지난 건 '마감'(is-ended), 오늘은 '오늘 마감'(is-urgent), D-3 이하 임박(is-urgent), 그 외 D-n. */
  function ddayInfo(deadline) {
    const n = daysLeft(deadline);
    if (n == null) return null;
    if (n < 0) return { label: '마감', state: 'ended' };
    if (n === 0) return { label: '오늘 마감', state: 'urgent' };
    if (n <= 3) return { label: 'D-' + n, state: 'urgent' };
    return { label: 'D-' + n, state: 'normal' };
  }
  /* D-day 강조 배지 엘리먼트. 보라 톤, 임박/마감 상태에 따라 클래스 부여. */
  function DdayBadge(deadline) {
    const info = ddayInfo(deadline);
    if (!info) return null;
    return W.el('span', { class: 'wz-d-dday is-' + info.state }, info.label);
  }

  /* ---------- 공개예정(scheduled) 판정 ----------
   * 백엔드 계약: detail.status='scheduled' 또는 openAt(ISO)이 미래면 공개예정.
   * (서버는 open_at 이 지난 scheduled 의 status 를 'open' 으로 노출하므로 둘 다 본다.) */
  function openAtDate(f) {
    if (!f || !f.openAt) return null;
    const d = new Date(f.openAt);
    return isNaN(d.getTime()) ? null : d;
  }
  function isScheduled(f) {
    if (!f) return false;
    if (f.status === 'scheduled') return true;
    const d = openAtDate(f);
    return !!(d && d.getTime() > Date.now());
  }
  /* 공개까지 남은 일수(올림). 과거/없음이면 null. */
  function openInDays(f) {
    const d = openAtDate(f);
    if (!d) return null;
    const n = W.dday(d); // 공개 D-day 도 KST 캘린더 기준 통일
    return (n == null || n < 0) ? null : n;
  }
  /* 공개예정 D-day 라벨(공개 기준). openAt 없으면 'OPEN' 폴백. */
  function openDdayLabel(f) {
    const n = openInDays(f);
    if (n == null) return 'OPEN 예정';
    if (n === 0) return '오늘 공개';
    return '공개 D-' + n;
  }
  function openWhenText(f) {
    const n = openInDays(f);
    if (n == null) return '곧 공개됩니다';
    if (n === 0) return '오늘 공개됩니다';
    return n + '일 후 공개됩니다';
  }
  /* contentBlocks 이미지 url 추출 (계약: {type:"image", url}). 구버전 value 도 허용. */
  function blockImageUrl(b) {
    if (!b || b.type !== 'image') return '';
    return b.url || b.value || '';
  }
  function blockText(b) {
    if (!b || b.type !== 'text') return '';
    return b.text != null ? b.text : (b.value != null ? b.value : '');
  }
  /* 분할(split) 블록 이미지 url — 계약 키 url 우선, 구버전 image/value 폴백. */
  function splitImageUrl(b) {
    if (!b || b.type !== 'split') return '';
    return b.url || b.image || b.value || '';
  }
  /* html 블록 본문에서 <img src> 들을 추출(갤러리/og 폴백용, best-effort).
   * 새니타이즈 후 임시 DOM 에서 추출 → 안전한 src 만 수집(http(s)/상대/허용 data:image).
   * DOMPurify 미로드 등으로 깨지면 빈 배열(무시). */
  function htmlBlockImages(b) {
    if (!b || b.type !== 'html' || typeof b.html !== 'string') return [];
    const safe = wzSanitize(b.html);
    if (!safe) return [];
    const out = [];
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = safe;
      tmp.querySelectorAll('img').forEach((im) => {
        const src = im.getAttribute('src') || '';
        if (!src) return;
        if (/^https?:\/\//i.test(src) || /^\//.test(src) || /^data:image\/(png|jpe?g|webp|gif)/i.test(src)) {
          if (out.indexOf(src) === -1) out.push(src);
        }
      });
    } catch (_) { /* 무시 */ }
    return out;
  }
  /* 허용 enum 중 하나면 그대로, 아니면 기본값(서버가 이미 정규화하지만 프론트도 방어). */
  function pickEnum(v, allowed, fallback) {
    return (typeof v === 'string' && allowed.indexOf(v) !== -1) ? v : fallback;
  }
  const TEXT_VARIANTS = ['heading', 'subheading', 'body', 'quote'];
  const BLK_ALIGNS = ['left', 'center', 'right'];
  const IMG_WIDTHS = ['sm', 'md', 'lg', 'full'];
  const IMG_SIDES = ['left', 'right'];
  function galleryImages(f) {
    const out = [];
    [f.coverImageUrl, f.designImageUrl, f.tryonImageUrl].forEach((u) => { if (u && out.indexOf(u) === -1) out.push(u); });
    (Array.isArray(f.contentBlocks) ? f.contentBlocks : []).forEach((b) => {
      const u = blockImageUrl(b);
      if (u && out.indexOf(u) === -1) out.push(u);
      // html 블록이면 본문 첫 이미지들도 갤러리 후보로(best-effort).
      if (b && b.type === 'html') {
        htmlBlockImages(b).forEach((src) => { if (out.indexOf(src) === -1) out.push(src); });
      }
    });
    return out;
  }
  function moneyRaised(f) {
    return (Number(f.finalPrice) || 0) * (Number(f.currentQuantity) || 0);
  }

  /* ---------- 금액 기준 달성 (백엔드 계약) ----------
   * 서버 계약: detail 에 targetAmount(목표금액)·achievedAmount(모인 금액)·achievementRate(금액 기준 %).
   * 신규 펀드는 금액 기준으로 표기. targetAmount 가 없거나 0(구펀드)이면 수량 파생값으로 폴백
   * (achievedAmount → finalPrice×currentQuantity, rate → W.rate, 목표 표기는 수량으로).
   * 반환: { achieved, target, rate, isAmount }. isAmount=true 면 금액 목표가 존재(=금액 기준 표기). */
  function detailAmounts(f) {
    const target = Number(f.targetAmount) || 0;
    const isAmount = target > 0;
    // achievedAmount 계약 필드 우선, 없으면 수량×단가 폴백(구펀드/누락 대비)
    const achieved = (typeof f.achievedAmount === 'number')
      ? Math.max(0, f.achievedAmount)
      : moneyRaised(f);
    // achievementRate 계약 필드(금액 기준) 우선, 없으면 공용 rate(수량 기준) 폴백
    const rate = (typeof f.achievementRate === 'number')
      ? Math.max(0, Math.round(f.achievementRate))
      : W.rate(f);
    return { achieved, target, rate, isAmount };
  }

  /* ---------- 대표 영상 파싱 ----------
   * videoUrl(공개 상세 키)이 있으면 대표 영역을 영상으로 대체.
   *  - data:video/(mp4|webm|quicktime) 또는 mp4/webm 으로 끝나는 http(s) → <video>
   *  - YouTube / Vimeo URL → 화이트리스트 도메인만 안전 iframe 임베드
   * 그 외(인식 불가)는 null 반환 → 호출부에서 기존 이미지 갤러리로 폴백. */
  function classifyVideo(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const url = raw.trim();
    if (!url) return null;

    // 1) data: 동영상
    if (/^data:video\/(mp4|webm|quicktime);base64,/i.test(url)) {
      return { kind: 'file', src: url };
    }
    // http(s) 만 허용 (javascript:, data:text 등 차단)
    if (!/^https?:\/\//i.test(url)) return null;

    let u;
    try { u = new URL(url); } catch (e) { return null; }
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();

    // 2) YouTube
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const vid = u.searchParams.get('v') || (/^\/(embed|shorts)\/([\w-]{6,})/.exec(u.pathname) || [])[2];
      if (vid && /^[\w-]{6,}$/.test(vid)) return { kind: 'embed', src: 'https://www.youtube-nocookie.com/embed/' + vid };
      return null;
    }
    if (host === 'youtu.be') {
      const vid = u.pathname.replace(/^\/+/, '').split('/')[0];
      if (vid && /^[\w-]{6,}$/.test(vid)) return { kind: 'embed', src: 'https://www.youtube-nocookie.com/embed/' + vid };
      return null;
    }
    // 3) Vimeo
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const m = /(\d{6,})/.exec(u.pathname);
      if (m) return { kind: 'embed', src: 'https://player.vimeo.com/video/' + m[1] };
      return null;
    }
    // 4) 직접 동영상 파일 http URL
    if (/\.(mp4|webm|mov)(\?|#|$)/i.test(u.pathname)) {
      return { kind: 'file', src: url };
    }
    return null;
  }

  /* 메이커 정보 정규화 (계약: f.maker{userId,name,slug,picture,followerCount,isFollowing}).
     구버전 호환: maker 없으면 creator* 필드로 폴백. */
  function makerOf(f) {
    const m = f.maker || {};
    return {
      userId: m.userId || f.creatorId || '',
      name: m.name || f.creatorName || '',
      slug: m.slug || f.creatorSlug || '',
      picture: m.picture || '',
      followerCount: typeof m.followerCount === 'number' ? m.followerCount : 0,
      isFollowing: !!m.isFollowing,
    };
  }
  function makerName(m) { return m.name || '두띵 창작자'; }
  function makerHref(m) {
    if (m.slug) return '/u/' + encodeURIComponent(m.slug);
    if (m.userId) return '/maker.html?id=' + encodeURIComponent(m.userId);
    return null;
  }

  /* ---------- 상태 빈/에러 ---------- */
  function showState(title, msg) {
    root.replaceChildren(W.el('div', { class: 'wz-d-state' },
      W.el('div', { class: 'wz-d-state__ic', html: SVG.box }),
      W.el('h2', {}, title),
      msg ? W.el('p', {}, msg) : null,
      W.el('a', { class: 'wz-btn wz-btn--outline', href: '/feed.html' }, '다른 프로젝트 둘러보기')));
  }

  /* 삭제/없음 안내 — 관리자 삭제 펀드(404/GROUPBUY_NOT_FOUND)나 로드 실패 시.
   * 펀드 내용은 렌더하지 않고(recordRecent 등도 호출 안 함) 안내 + 홈으로 가기 버튼만 표시. */
  function showDeleted() {
    root.replaceChildren(W.el('div', { class: 'wz-d-state wz-d-state--deleted' },
      W.el('div', { class: 'wz-d-state__ic', html: SVG.box }),
      W.el('h2', {}, '삭제되었거나 존재하지 않는 프로젝트입니다'),
      W.el('a', { class: 'wz-btn wz-btn--primary', href: '/main.html' }, '홈으로 가기')));
  }

  /* ===================================================================
   * 메인 렌더
   * =================================================================== */
  // 최근 본 프로젝트를 localStorage(recentFunds)에 기록 — 홈/프로필 "최근 본 프로젝트"가 읽는다. 최신 우선, 최대 20.
  function recordRecent(f) {
    if (!f || f.id == null) return;
    try {
      let list = JSON.parse(localStorage.getItem('recentFunds') || '[]');
      if (!Array.isArray(list)) list = [];
      list = list.filter((r) => r && String(r.id) !== String(f.id));
      // 이미지가 data: URL(업로드 base64, 수 MB)이면 저장하지 않는다 — localStorage 용량(약 5MB) 초과로
      // setItem 이 통째로 실패해 "최근 본"이 영영 비어 보이던 버그의 원인. http(s) URL 만 저장, data: 면 빈값(카드는 카테고리 아이콘 폴백).
      var rawImg = f.coverImageUrl || f.designImageUrl || '';
      var safeImg = /^https?:\/\//.test(rawImg) ? rawImg : '';
      // 카드 렌더에 필요한 필드까지 저장 → 홈 "최근 본"이 현재 로드된 목록에 없어도 그대로 그릴 수 있게.
      list.unshift({
        id: f.id,
        title: f.title || '',
        imageUrl: safeImg,
        creatorName: f.creatorName || '',
        achievementRate: (typeof f.achievementRate === 'number') ? f.achievementRate : undefined,
        deadline: f.deadline || '',
        category: f.category || '',
      });
      localStorage.setItem('recentFunds', JSON.stringify(list.slice(0, 20)));
    } catch (_) { /* 저장 실패 무시 */ }
  }

  function render(f) {
    const backers = Number(f.currentQuantity) || 0;
    const dleft = daysLeft(f.deadline);
    const imgs = galleryImages(f);
    const tiers = Array.isArray(f.rewardTiers) ? f.rewardTiers : [];
    recordRecent(f); // 최근 본 프로젝트 기록

    root.replaceChildren();
    document.body.classList.add('wz-detail-page'); // 상세: 헤더 비고정 → 탭바가 맨 위에 sticky

    /* ----- 상단 탭바 (메인 / 스토리 / 댓글 — 섹션 스크롤) ----- */
    const tabs = W.el('div', { class: 'wz-d-tabs' });
    const tabsInner = W.el('div', { class: 'wz-d-tabs__inner' });
    const grid = W.el('div', { class: 'wz-d-grid' });

    /* ----- 좌측: 대표 영역(영상 우선, 없으면 갤러리) + 스토리 + 댓글 + 안내 ----- */
    const mainCol = W.el('div', { class: 'wz-d-main' });
    const video = classifyVideo(f.videoUrl);
    const galleryEl = video ? VideoHero(video, f.title) : Gallery(imgs, f.title);
    const storyEl = Story(f);
    const commentsEl = Comments(f);
    /* 끝 섹션: 펀딩/환불 안내 → 교환·환불 정책 → 안내사항 → 창작자(메이커) 정보.
     * 정책은 스토리(contentBlocks)와 분리된 별도 컬럼(refundPolicy/legalNotice)에서만 렌더한다. */
    mainCol.append(galleryEl, storyEl, commentsEl, FundingNotice());
    const policyEl = PolicySection('교환·환불 정책', f.refundPolicy);
    if (policyEl) mainCol.appendChild(policyEl);
    const legalEl = PolicySection('안내사항', f.legalNotice);
    if (legalEl) mainCol.appendChild(legalEl);
    const makerInfoEl = MakerInfoSection(f);
    if (makerInfoEl) mainCol.appendChild(makerInfoEl);
    // 작성자 본인일 때만: 프로젝트 삭제 요청(관리자 처리). 타인/관리자에겐 미노출.
    const delReqEl = OwnerDeleteRequest(f);
    if (delReqEl) mainCol.appendChild(delReqEl);

    /* ----- 우측 sticky 후원 패널 ----- */
    const sideCol = W.el('aside', { class: 'wz-d-side' });
    buildSide(sideCol, f, { backers, dleft, tiers });
    grid.append(mainCol, sideCol);

    const sections = { main: galleryEl, story: storyEl, comments: commentsEl };
    const TAB_DEFS = [['main', '메인'], ['story', '스토리'], ['comments', '댓글']];
    const tabBtns = {};
    function setActive(key) { Object.keys(tabBtns).forEach((k) => tabBtns[k].classList.toggle('is-active', k === key)); }
    function stickyOffset() {
      // 상세에선 헤더가 스크롤되어 사라지고 탭바만 top:0 으로 고정되므로 탭바 높이만 보정
      return (tabs.offsetHeight || 50) + 12;
    }
    function goSection(key) {
      const el = sections[key];
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - stickyOffset();
      window.scrollTo({ top: y < 0 ? 0 : y, behavior: 'smooth' });
    }
    TAB_DEFS.forEach(([key, label]) => {
      const b = W.el('button', { class: 'wz-d-tab', type: 'button' }, label);
      b.addEventListener('click', () => { setActive(key); goSection(key); });
      tabBtns[key] = b;
      tabsInner.appendChild(b);
    });
    tabs.appendChild(tabsInner);
    root.append(tabs, grid);

    /* 우측 독립 스크롤 패널의 sticky top·max-height 기준값.
     * 상세 페이지는 헤더가 static 이라 스크롤 시 탭바(top:0)만 고정되므로 탭바 높이를 변수로 노출. */
    function setTabH() {
      const h = tabs.offsetHeight || 58;
      document.documentElement.style.setProperty('--wz-d-tabh', h + 'px');
    }
    setTabH();
    window.addEventListener('resize', setTabH, { passive: true });

    /* ----- 모바일 하단 고정 바 ----- */
    root.appendChild(MobileBar(f, tiers));

    /* 스크롤 스파이 — 현재 보이는 섹션 탭 자동 활성화 */
    function onScroll() {
      const off = stickyOffset() + 8;
      let cur = 'main';
      ['main', 'story', 'comments'].forEach((k) => {
        const el = sections[k];
        if (el && el.getBoundingClientRect().top - off <= 0) cur = k;
      });
      setActive(cur);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    setActive('main');
  }

  /* ---------- 대표 영상 (영상 우선) ----------
   * file: data: 또는 직접 mp4/webm/mov → <video controls playsinline muted>
   * embed: YouTube/Vimeo → 화이트리스트 도메인 src 의 sandbox iframe */
  function VideoHero(video, title) {
    const box = W.el('div', { class: 'wz-d-video' });
    if (video.kind === 'file') {
      const v = W.el('video', {
        class: 'wz-d-video__el',
        src: video.src,
        controls: 'controls',
        playsinline: 'playsinline',
        muted: 'muted',
        preload: 'metadata',
      });
      v.muted = true; // 자동재생 정책 대비(속성+프로퍼티)
      v.setAttribute('aria-label', (title || '대표 영상'));
      // 영상 로드 실패 시 자리표시자로 대체
      v.addEventListener('error', () => {
        v.replaceWith(W.el('div', { class: 'wz-d-gallery__ph', html: SVG.box }));
      });
      box.appendChild(v);
    } else {
      // embed.src 는 classifyVideo 화이트리스트(youtube-nocookie/vimeo)에서만 생성됨
      const frame = W.el('iframe', {
        class: 'wz-d-video__el',
        src: video.src,
        title: '대표 영상',
        frameborder: '0',
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
        allowfullscreen: 'allowfullscreen',
        referrerpolicy: 'strict-origin-when-cross-origin',
        loading: 'lazy',
      });
      box.appendChild(frame);
    }
    return box;
  }

  /* ---------- 갤러리 ---------- */
  function Gallery(imgs, title) {
    const box = W.el('div', { class: 'wz-d-gallery' });
    if (!imgs.length) {
      box.appendChild(W.el('div', { class: 'wz-d-gallery__ph', html: SVG.box }));
      return box;
    }
    let idx = 0;
    const img = W.el('img', { class: 'wz-d-gallery__img', src: imgs[0], alt: title || '대표 이미지' });
    img.addEventListener('error', () => { img.replaceWith(W.el('div', { class: 'wz-d-gallery__ph', html: SVG.box })); });
    box.appendChild(img);
    if (imgs.length > 1) {
      const count = W.el('div', { class: 'wz-d-gallery__count' }, '1/' + imgs.length);
      const show = (n) => { idx = (n + imgs.length) % imgs.length; img.src = imgs[idx]; count.textContent = (idx + 1) + '/' + imgs.length; };
      const prev = W.el('button', { class: 'wz-d-gallery__nav wz-d-gallery__nav--prev', type: 'button', 'aria-label': '이전 이미지', html: SVG.chevL });
      const next = W.el('button', { class: 'wz-d-gallery__nav wz-d-gallery__nav--next', type: 'button', 'aria-label': '다음 이미지', html: SVG.chevR });
      prev.addEventListener('click', () => show(idx - 1));
      next.addEventListener('click', () => show(idx + 1));
      box.append(prev, next, count);
    }
    return box;
  }

  /* ---------- 스토리 블록 빌더 (리치 스키마) ----------
   * 모든 스타일은 클래스/enum 으로만 적용한다(임의 CSS·HTML 문자열 금지).
   * 사용자/외부 텍스트는 W.el 의 문자열 자식(textContent)으로만 넣는다(raw HTML 주입 금지).
   * 알 수 없는 variant/align/width/imageSide 는 기본값으로 강등(서버가 이미 정규화하지만 프론트도 방어). */

  // 이미지 엘리먼트(스토리 본문/분할 공용). onerror 시 onFail()(없으면 자기 제거).
  function storyImg(url, extraClass, onFail) {
    const im = W.el('img', { class: extraClass, src: url, alt: '', loading: 'lazy' });
    im.addEventListener('error', () => { if (typeof onFail === 'function') onFail(im); else im.remove(); });
    return im;
  }

  // text 블록: variant(제목/소제목/본문/인용) + align(좌/중/우). 줄바꿈 보존은 CSS(pre-wrap).
  function buildTextBlock(b) {
    const txt = blockText(b);
    if (!txt || !String(txt).trim()) return null;
    const variant = pickEnum(b.variant, TEXT_VARIANTS, 'body');
    const align = pickEnum(b.align, BLK_ALIGNS, 'left');
    const cls = 'wz-d-blk wz-d-blk--text wz-d-blk--' + variant
      + ' wz-d-blk--a-' + align;
    // 인용/제목/소제목은 동일 .wz-d-blk__text 컨테이너, 클래스로 스타일 분기.
    return W.el('div', { class: cls }, W.el('div', { class: 'wz-d-blk__text' }, String(txt)));
  }

  // image 블록: width(sm/md/lg/full) + align(좌/중/우). 로드 실패 시 블록 통째 제거.
  function buildImageBlock(b) {
    const u = blockImageUrl(b);
    if (!u) return null;
    const width = pickEnum(b.width, IMG_WIDTHS, 'full');
    const align = pickEnum(b.align, BLK_ALIGNS, 'center');
    const cls = 'wz-d-blk wz-d-blk--image wz-d-blk--w-' + width + ' wz-d-blk--a-' + align;
    const fig = W.el('div', { class: cls });
    fig.appendChild(storyImg(u, 'wz-d-blk__img', () => fig.remove()));
    return fig;
  }

  // split 블록: 글+이미지 2열. imageSide=left/right 로 좌우 배치, 모바일 1열 스택(CSS, 이미지 위).
  function buildSplitBlock(b) {
    const txt = (b && typeof b.text === 'string') ? b.text : '';
    const u = splitImageUrl(b);
    // 글·이미지 둘 다 있어야 의미가 있다(서버 정규화와 동일 기준). 하나라도 없으면 제외.
    if (!txt.trim() || !u) return null;
    const side = pickEnum(b.imageSide, IMG_SIDES, 'right');
    const align = pickEnum(b.align, BLK_ALIGNS, 'left');
    const wrapCls = 'wz-d-blk wz-d-blk--split wz-d-blk--side-' + side + ' wz-d-blk--a-' + align;
    const row = W.el('div', { class: wrapCls });
    const textCol = W.el('div', { class: 'wz-d-blk__split-text' }, W.el('div', { class: 'wz-d-blk__text' }, txt));
    const imgCol = W.el('div', { class: 'wz-d-blk__split-img' });
    imgCol.appendChild(storyImg(u, 'wz-d-blk__img', (im) => im.remove()));
    // DOM 순서는 항상 텍스트→이미지. 좌우 배치는 CSS(side 클래스의 order)로, 모바일 스택은 이미지가 위로.
    row.append(textCol, imgCol);
    return row;
  }

  // html 블록(리치 에디터 산출물): {type:'html', html}. 반드시 wzSanitize 거쳐 innerHTML.
  // raw b.html 직접 삽입 금지 — 렌더 시점 DOMPurify 가 1차 방어. 미로드 시 빈값.
  function buildHtmlBlock(b) {
    const raw = (b && typeof b.html === 'string') ? b.html : '';
    const safe = wzSanitize(raw);
    if (!safe || !safe.trim()) return null; // 내용 없으면 블록 생략
    const wrap = W.el('div', { class: 'wz-d-blk wz-d-blk--html' });
    wrap.innerHTML = safe; // 새니타이즈된 HTML 만 삽입(위 wzSanitize 경유 — raw 삽입 경로 없음)
    // 본문 링크는 새 탭 + 안전 rel 보정(없을 때만 추가).
    wrap.querySelectorAll('a').forEach((a) => {
      if (!a.getAttribute('target')) a.setAttribute('target', '_blank');
      const rel = (a.getAttribute('rel') || '').toLowerCase();
      if (!/\bnoopener\b/.test(rel) || !/\bnoreferrer\b/.test(rel)) a.setAttribute('rel', 'noopener noreferrer');
    });
    return wrap;
  }

  function buildStoryBlock(b) {
    if (!b) return null;
    if (b.type === 'text') return buildTextBlock(b);
    if (b.type === 'image') return buildImageBlock(b);
    if (b.type === 'split') return buildSplitBlock(b);
    if (b.type === 'html') return buildHtmlBlock(b);
    return null;
  }

  /* ---------- 프로젝트 스토리 (contentBlocks) ---------- */
  function Story(f) {
    const sec = W.el('section', { class: 'wz-d-story' });
    sec.appendChild(W.el('h2', { class: 'wz-d-story__h2' }, '프로젝트 스토리'));
    const blocks = Array.isArray(f.contentBlocks) ? f.contentBlocks : [];
    const wrap = W.el('div', { class: 'wz-d-story__blocks' });
    let rendered = 0;
    blocks.forEach((b) => {
      const node = buildStoryBlock(b);
      if (node) { wrap.appendChild(node); rendered++; }
    });
    if (!rendered && f.description && f.description.trim()) {
      wrap.appendChild(W.el('p', { class: 'wz-d-story__text' }, f.description));
      rendered++;
    }
    if (!rendered) { wrap.appendChild(W.el('div', { class: 'wz-d-story__empty' }, '아직 등록된 스토리가 없어요.')); sec.appendChild(wrap); return sec; }

    /* 스토리 더보기: 일정 높이(STORY_CLAMP_PX)를 넘으면 접고 그라데이션 + "스토리 더보기" 버튼.
     * 짧으면 버튼 미표시. 클릭 시 전체 펼침(clamp 해제로 페이지가 늘어난다). */
    const STORY_CLAMP_PX = 720;
    const clamp = W.el('div', { class: 'wz-d-story__clamp' });
    clamp.appendChild(wrap);
    const fade = W.el('div', { class: 'wz-d-story__fade', 'aria-hidden': 'true' });
    const moreBtn = W.el('button', { class: 'wz-btn wz-btn--outline wz-d-story__more', type: 'button' },
      W.el('span', {}, '스토리 더보기'),
      W.el('span', { class: 'wz-d-story__more-ic', html: SVG.chevR }));
    moreBtn.addEventListener('click', () => {
      clamp.classList.add('is-open');
      fade.remove();
      moreBtn.remove();
    });
    sec.append(clamp, fade, moreBtn);

    // 렌더(이미지 로드) 후 실제 높이로 더보기 노출 여부 결정. 이미지 로드 지연 대비 재측정.
    function measure() {
      if (clamp.classList.contains('is-open')) return;
      const tall = wrap.scrollHeight > STORY_CLAMP_PX + 80; // 여유 80px: 살짝 넘는 글은 그냥 노출
      clamp.classList.toggle('is-clamped', tall);
      fade.style.display = tall ? '' : 'none';
      moreBtn.style.display = tall ? '' : 'none';
    }
    requestAnimationFrame(measure);
    wrap.querySelectorAll('img').forEach((im) => {
      im.addEventListener('load', () => requestAnimationFrame(measure));
    });
    return sec;
  }

  /* ---------- 끝 섹션: 교환·환불 정책 / 안내사항 ----------
   * 백엔드 계약 키(refundPolicy/legalNotice)를 스토리와 분리해 페이지 끝에 표시.
   * 값(문자열)이 없으면 null 반환 → 호출부에서 섹션 생략. */
  function PolicySection(title, value) {
    const text = (value == null) ? '' : String(value).trim();
    if (!text) return null;
    const sec = W.el('section', { class: 'wz-d-policy' });
    sec.appendChild(W.el('h2', { class: 'wz-d-policy__h2' }, title));
    sec.appendChild(W.el('p', { class: 'wz-d-policy__text' }, text));
    return sec;
  }

  /* ---------- 끝 섹션: 창작자(메이커) 정보 ----------
   * creatorInfo(이름·프로필·소개·지역)를 텀블벅처럼 페이지 끝에 표시. 값 없으면 null. */
  function MakerInfoSection(f) {
    const ci = creatorInfoOf(f);
    const maker = makerOf(f);
    const name = (ci && ci.name) || maker.name;
    const region = creatorRegion(ci);
    const intro = ci && ci.intro;
    const image = (ci && ci.image) || maker.picture;
    if (!name && !region && !intro && !image) return null;

    const sec = W.el('section', { class: 'wz-d-makerinfo' });
    sec.appendChild(W.el('h2', { class: 'wz-d-makerinfo__h2' }, '창작자 정보'));
    const card = W.el('div', { class: 'wz-d-makerinfo__card' });

    const href = makerHref(maker);
    const head = href
      ? W.el('a', { class: 'wz-d-makerinfo__head', href })
      : W.el('div', { class: 'wz-d-makerinfo__head' });
    const av = W.el('span', { class: 'wz-d-makerinfo__av', html: SVG.user });
    if (image) {
      const im = W.el('img', { src: image, alt: '' });
      im.addEventListener('error', () => { im.remove(); av.innerHTML = SVG.user; });
      av.innerHTML = '';
      av.appendChild(im);
    }
    const info = W.el('div', { class: 'wz-d-makerinfo__meta' });
    info.appendChild(W.el('p', { class: 'wz-d-makerinfo__name' }, name || makerName(maker)));
    if (region) info.appendChild(W.el('p', { class: 'wz-d-makerinfo__region' }, region));
    head.append(av, info);
    card.appendChild(head);

    if (intro) card.appendChild(W.el('p', { class: 'wz-d-makerinfo__intro' }, intro));
    sec.appendChild(card);
    return sec;
  }

  /* ---------- 댓글 섹션 (wz-comments.js 가 마운트) ---------- */
  function Comments(f) {
    const sec = W.el('section', { class: 'wz-d-comments' });
    sec.appendChild(W.el('h2', { class: 'wz-d-comments__h2' }, '댓글'));
    const host = W.el('div', { id: 'fund-comments' });
    sec.appendChild(host);
    // wz-comments.js 는 다른 모듈이 로드한다. 로드 전이면 약간 대기 후 마운트.
    function tryMount(retries) {
      if (window.WZComments && typeof window.WZComments.mount === 'function') {
        window.WZComments.mount(host, { targetType: 'fund', targetId: f.id });
        return;
      }
      if (retries > 0) setTimeout(() => tryMount(retries - 1), 120);
      else host.appendChild(W.el('p', { class: 'wz-d-comments__fallback' }, '댓글을 불러올 수 없어요.'));
    }
    tryMount(20);
    return sec;
  }

  /* ---------- 펀딩 / 환불 안내 ---------- */
  function FundingNotice() {
    const sec = W.el('div', { class: 'wz-d-notice' });
    sec.appendChild(W.el('h3', {}, '펀딩 및 환불 안내'));
    const dl = W.el('dl', {});
    [
      ['펀딩 방식', '목표 수량 달성 시에만 제작·발송되는 모두의 펀딩(올오어낫씽)입니다. 마감일까지 목표에 도달하지 못하면 결제가 진행되지 않습니다.'],
      ['후원·결제 시점', '후원하면 먼저 예약만 됩니다. 마감일에 목표를 달성하면 다음날부터 등록한 결제수단으로 순차 결제됩니다. 마감 전에는 마이페이지에서 자유롭게 취소할 수 있어요.'],
      ['환불 안내', '목표 미달로 무산되거나 창작자 사정으로 취소되는 경우 결제가 진행되지 않거나 결제액 전액이 환불됩니다.'],
      ['배송 안내', '펀딩 종료 후 제작 기간을 거쳐 순차 발송되며, 일정은 새소식으로 공지됩니다.'],
    ].forEach(([t, d]) => {
      dl.append(W.el('dt', {}, t), W.el('dd', {}, d));
    });
    sec.appendChild(dl);
    return sec;
  }

  /* ===================================================================
   * 우측 sticky 후원 패널
   * =================================================================== */
  function buildSide(sideCol, f, ctx) {
    const { backers, dleft, tiers } = ctx; // rate 는 아래 detailAmounts(f).rate 로 직접 산출(금액 기준)
    const owner = isOwner(f);
    const scheduled = isScheduled(f);

    /* ===== 1) 메이커명 링크(작은 회색 + › 아이콘) — 메이커 페이지로 ===== */
    const sideMaker = makerOf(f);
    const sideMakerHref = makerHref(sideMaker);
    const makerLink = sideMakerHref
      ? W.el('a', { class: 'wz-d-makerlink', href: sideMakerHref })
      : W.el('div', { class: 'wz-d-makerlink' });
    makerLink.append(
      W.el('span', { class: 'wz-d-makerlink__name' }, makerName(sideMaker)),
      W.el('span', { class: 'wz-d-makerlink__ic', html: SVG.chevR }));
    sideCol.appendChild(makerLink);

    /* 본인 소유 프로젝트면 "내 프로젝트" 배지 노출 */
    if (owner) {
      sideCol.appendChild(W.el('span', { class: 'wz-d-ownerbadge', html: SVG.shield + '<span>내 프로젝트</span>' }));
    }

    /* ===== 2) 제목 (굵게) — 패널 외 다른 곳엔 제목이 없으므로 여기서만 노출 ===== */
    sideCol.appendChild(W.el('h1', { class: 'wz-d-title' }, f.title || '제목 없음'));

    /* 조회수: 서버가 상세 GET 시 자동 집계(view_count++)하므로 프론트 추가 호출 불필요.
     * detail.viewCount 가 오면 소유자/관리자에게만 작게 표시(운영 참고용). */
    if ((owner || isAdmin()) && typeof f.viewCount === 'number') {
      const vc = W.el('p', { class: 'wz-d-viewcount' });
      vc.append(document.createTextNode('조회수 '), W.el('b', {}, f.viewCount.toLocaleString()));
      sideCol.appendChild(vc);
    }

    /* ===== 3) 모인금액 / 후원자 — 2칸 큰 숫자 (금액 기준, 백엔드 계약) =====
     *  - 모인금액: achievedAmount(폴백: 단가×참여수) — 보라 강조 큰 글씨.
     *  - 후원자:   currentQuantity 명 — 큰 글씨.
     *  목표/달성률은 아래 요약 박스·상세 dl 에서 다룬다(중복 제거). */
    const amt = detailAmounts(f);
    const targetQty = Number(f.targetQuantity) || 0;
    const stats = W.el('div', { class: 'wz-d-statgrid' });
    stats.append(
      W.el('div', { class: 'wz-d-stat wz-d-stat--money' },
        W.el('span', { class: 'wz-d-stat__num' }, W.money(amt.achieved)),
        W.el('span', { class: 'wz-d-stat__lbl' }, '모인 금액')),
      W.el('div', { class: 'wz-d-stat' },
        W.el('span', { class: 'wz-d-stat__num' }, backers.toLocaleString() + '명'),
        W.el('span', { class: 'wz-d-stat__lbl' }, '후원자')));
    sideCol.appendChild(stats);

    /* ===== 4) 요약 박스 — 달성률 | 남은 기간 | 유형 (3칸, 세로 구분선) ===== */
    const dtext = dleft == null ? '-' : (dleft > 0 ? dleft + '일' : (dleft === 0 ? '오늘 마감' : '마감'));
    const typeText = scheduled ? '공개예정' : '펀딩';
    const summary = W.el('div', { class: 'wz-d-summary' });
    [
      [amt.rate + '%', '달성률', 'is-accent'],
      [dtext, '남은 기간', ''],
      [typeText, '유형', ''],
    ].forEach(([v, lbl, extra]) => {
      summary.appendChild(W.el('div', { class: 'wz-d-summary__cell' },
        W.el('span', { class: 'wz-d-summary__v' + (extra ? ' ' + extra : '') }, v),
        W.el('span', { class: 'wz-d-summary__l' }, lbl)));
    });
    sideCol.appendChild(summary);

    /* ===== 5) 진행바 — 금액 기준 달성률(amt.rate), 0~100 클램프 ===== */
    const bar = W.el('div', { class: 'wz-d-progress' });
    const fill = W.el('div', { class: 'wz-d-progress__fill' });
    fill.style.width = Math.min(100, Math.max(0, amt.rate)) + '%';
    bar.appendChild(fill);
    sideCol.appendChild(bar);

    /* ===== 6) 상세 정보 목록 (dl, 라벨/값 정렬) ===== */
    const info = W.el('dl', { class: 'wz-d-info' });
    function infoRow(label, valueNode) {
      info.append(W.el('dt', {}, label), W.el('dd', {}, valueNode));
    }
    // 목표금액 — 금액 목표가 있으면 표기, 없고 수량 목표만 있으면 "수량 N개"로 폴백.
    if (amt.isAmount) {
      infoRow('목표 금액', W.money(amt.target));
    } else if (targetQty > 0) {
      infoRow('목표 수량', targetQty.toLocaleString() + '개');
    }
    // 펀딩 기간 — 시작(openAt 우선, 없으면 createdAt) ~ 마감 + D-day 배지.
    const startDate = fmtDate(f.openAt) || fmtDate(f.createdAt);
    const endDate = fmtDate(f.deadline);
    if (startDate || endDate) {
      const periodDd = W.el('dd', { class: 'wz-d-info__period' });
      periodDd.appendChild(W.el('span', {}, (startDate || '') + (startDate && endDate ? ' ~ ' : '') + (endDate || '')));
      const dd = scheduled
        ? W.el('span', { class: 'wz-d-dday is-scheduled' }, openDdayLabel(f))
        : DdayBadge(f.deadline);
      if (dd) periodDd.appendChild(dd);
      info.append(W.el('dt', {}, '펀딩 기간'), periodDd);
    }
    // 결제 — 목표 달성 시 마감 다음날 순차 결제(텀블벅식, 배치18 마감 다음날 결제).
    const payDate = fmtDatePlusDays(f.deadline, 1);
    if (payDate) {
      infoRow('결제', '목표 달성 시 ' + payDate + '부터 순차 결제');
    } else {
      infoRow('결제', '목표 달성 시 마감일 다음 날부터 순차 결제');
    }
    // 예상 발송 — 구조화 필드 없음 → 무리한 가짜 날짜 대신 일반 안내.
    infoRow('예상 발송 시작일', '펀딩 종료 후 약 2~3주 내 순차 발송');
    if (info.childNodes.length) sideCol.appendChild(info);

    /* ===== 7) 찜 · 공유 행 (작게) + 후원하기 큰 버튼 ===== */
    const actions = W.el('div', { class: 'wz-d-actions' });
    const shareBtn = W.el('button', { class: 'wz-d-act', type: 'button' },
      W.el('span', { html: SVG.share }), W.el('span', { class: 'wz-d-act__label' }, '공유'));
    shareBtn.addEventListener('click', () => doShare(f));

    // 좋아요: 서버값(f.isLiked/f.likeCount)을 신뢰. window.isLiked 로 한 번 더 보정(찜 동기화 이후).
    const likedNow = (typeof window.isLiked === 'function') ? window.isLiked(f.id) : !!f.isLiked;
    const likeBtn = W.el('button', { class: 'wz-d-act' + (likedNow ? ' is-on' : ''), type: 'button' });
    const likeLabel = W.el('span', { class: 'wz-d-act__label' });
    function paintLike() {
      const on = (typeof window.isLiked === 'function') ? window.isLiked(f.id) : !!f.isLiked;
      likeBtn.classList.toggle('is-on', on);
      likeLabel.textContent = '찜 ' + Math.max(0, Number(f.likeCount) || 0);
    }
    likeBtn.append(W.el('span', { html: SVG.heart }), likeLabel);
    paintLike();
    likeBtn.addEventListener('click', () => {
      if (typeof window.toggleLike !== 'function') return;
      // 상세는 MOCK_PRODUCTS 에 없을 수 있으므로 f.likeCount 를 낙관적으로 직접 보정.
      const wasOn = (typeof window.isLiked === 'function') ? window.isLiked(f.id) : !!f.isLiked;
      const on = window.toggleLike(f.id);
      f.isLiked = on;
      f.likeCount = Math.max(0, (Number(f.likeCount) || 0) + (on ? 1 : -1));
      paintLike();
      if (on && !wasOn) popHeart(likeBtn);
      syncMobileLike(on);
    });

    actions.append(shareBtn, likeBtn);

    /* 신고하기 — 로그인 사용자 대상, 본인 프로젝트면 숨김 */
    if (_me && _me.userId && !owner) {
      const reportBtn = W.el('button', { class: 'wz-rp-trigger wz-d-report', type: 'button' },
        W.el('span', { html: SVG.alert }), W.el('span', {}, '신고'));
      reportBtn.addEventListener('click', () => {
        if (!window.WZReport || typeof window.WZReport.open !== 'function') return;
        window.WZReport.open({
          targetType: 'project',
          targetId: f.id,
          targetLabel: f.title || '프로젝트',
        });
      });
      actions.appendChild(reportBtn);
    }

    sideCol.appendChild(actions);
    _mobileLikeSync = (on) => likeBtn.classList.toggle('is-on', on);
    _sidePaintLike = paintLike; // 모바일 바 토글 시 측면 찜(상태+숫자) 재렌더

    // 서버 동기화 시 정확한 likeCount/상태 반영(POST/DELETE 응답 또는 /me/likes 보정).
    // 재렌더로 버튼이 DOM 에서 빠지면 리스너 자기 제거.
    function onDetailLikes(ev) {
      if (!likeBtn.isConnected) { window.removeEventListener('likes:updated', onDetailLikes); return; }
      const d = ev.detail || {};
      if (d.id != null && !d.synced && String(d.id) !== String(f.id)) return;
      if (d.id != null && String(d.id) === String(f.id)) {
        if (typeof d.likeCount === 'number') f.likeCount = d.likeCount;
        if (typeof d.liked === 'boolean') f.isLiked = d.liked;
      } else if (d.synced && typeof window.isLiked === 'function') {
        f.isLiked = window.isLiked(f.id);
      }
      paintLike();
      syncMobileLike((typeof window.isLiked === 'function') ? window.isLiked(f.id) : !!f.isLiked);
    }
    window.addEventListener('likes:updated', onDetailLikes);

    if (owner) {
      /* 본인 소유: 펀딩 대신 [기본정보·스토리 수정] 버튼 (자기 후원 불가) */
      const editBtn = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg wz-btn--block wz-d-cta', type: 'button' },
        W.el('span', { class: 'wz-d-cta__ic', html: EDIT_IC.pen }), W.el('span', {}, '기본정보 · 스토리 수정'));
      editBtn.addEventListener('click', () => openEditModal(f));
      sideCol.appendChild(editBtn);
      sideCol.appendChild(W.el('p', { class: 'wz-d-ownernote' },
        '리워드 · 금액 · 일정은 이 화면에서 수정할 수 없어요. 제목 · 소개 · 카테고리 · 대표 이미지/영상 · 스토리 · 창작자 정보만 수정됩니다.'));
    } else if (scheduled) {
      /* 공개예정: 펀딩 대신 "공개 알림신청" 버튼 + "N일 후 공개" 안내. */
      sideCol.appendChild(SubscribeBox(f));
    } else if (_myActiveOrder) {
      /* 이미 참여 중(1인 1펀딩): 펀딩하기 대신 참여중 안내 + 변경(예약 상태만)·취소(마이페이지). */
      sideCol.appendChild(AlreadyBacked(f, _myActiveOrder));
    } else {
      /* 펀딩하기 큰 버튼 */
      const fundBtn = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg wz-btn--block wz-d-cta', type: 'button' }, '펀딩하기');
      fundBtn.addEventListener('click', () => backFlow(f));
      sideCol.appendChild(fundBtn);
    }

    /* ===== 8) 안심후원 안내 (짧게, 한 줄) — CTA 아래 단정하게 ===== */
    sideCol.appendChild(W.el('p', { class: 'wz-d-safenote' },
      W.el('span', { class: 'wz-d-safenote__ic', html: SVG.shield }),
      W.el('span', {}, '후원은 예약만 되고, 목표를 달성한 프로젝트만 결제·제작됩니다. 미달 시 결제되지 않아요.')));

    /* 메이커 카드 (본인 소유면 팔로우/문의 버튼 숨김) — 패널 하단에 정리 */
    sideCol.appendChild(MakerCard(f, owner));

    /* 리워드 선택 */
    sideCol.appendChild(Rewards(f, tiers));

    /* 관리자 전용: 게시글 삭제(위험 영역). 소유자/일반 사용자에겐 미노출.
     * 관리자는 어떤 상태의 글이든 삭제할 수 있다. */
    if (isAdmin()) {
      sideCol.appendChild(AdminDanger(f));
    }
  }

  /* ---------- 공개예정 알림신청 박스 ----------
   * "N일 후 공개" 안내 + "공개 알림신청" 버튼(POST /api/groupbuys/:id/subscribe).
   * 이미 구독 중(isSubscribed)이면 "알림신청됨" + 다시 누르면 해제(DELETE).
   * 구독자 수(subscriberCount)를 함께 표시. 미인증(401)이면 로그인으로 이동. */
  function SubscribeBox(f) {
    const box = W.el('div', { class: 'wz-d-subscribe' });

    /* 공개 일정 안내 */
    const when = W.el('div', { class: 'wz-d-subscribe__when' });
    when.append(
      W.el('span', { class: 'wz-d-subscribe__when-ic', html: SVG.alert }),
      W.el('span', {}, W.el('b', {}, openWhenText(f)),
        document.createTextNode(' 공개 전 미리 알림을 신청해 두세요.')));
    box.appendChild(when);

    let subscribed = !!f.isSubscribed;
    let count = Number(f.subscriberCount) || 0;

    const countEl = W.el('p', { class: 'wz-d-subscribe__count' });
    function paintCount() {
      countEl.replaceChildren(W.el('b', {}, count.toLocaleString()),
        document.createTextNode('명이 알림을 신청했어요'));
    }
    paintCount();

    const btn = W.el('button', { class: 'wz-btn wz-btn--lg wz-btn--block wz-d-cta', type: 'button' });
    function paintBtn() {
      btn.replaceChildren(
        W.el('span', { class: 'wz-d-cta__ic', html: subscribed ? SVG.shield : SVG.alert }),
        W.el('span', {}, subscribed ? '알림신청됨' : '공개 알림신청'));
      btn.classList.toggle('wz-btn--primary', !subscribed);
      btn.classList.toggle('wz-btn--outline', subscribed);
      btn.classList.toggle('is-on', subscribed);
    }
    paintBtn();

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const path = '/groupbuys/' + encodeURIComponent(f.id) + '/subscribe';
      try {
        const res = subscribed
          ? await window.api.del(path)
          : await window.api.post(path, {});
        subscribed = !!(res && res.subscribed);
        if (res && typeof res.count === 'number') count = res.count;
        paintBtn(); paintCount();
        toast(subscribed ? '공개되면 알림을 보내드릴게요' : '알림신청을 해제했어요');
      } catch (e) {
        if (e && e.status === 401) { location.href = '/login.html'; return; }
        if (e && e.status === 404) { toast('이미 종료되었거나 존재하지 않는 프로젝트예요'); return; }
        toast((e && e.message) ? e.message : '처리에 실패했어요. 잠시 후 다시 시도해 주세요.');
      } finally { btn.disabled = false; }
    });

    box.append(btn, countEl);
    return box;
  }

  /* ---------- 관리자 게시글 삭제 영역 ---------- */
  function AdminDanger(f) {
    const wrap = W.el('div', { class: 'wz-d-admindanger' });
    wrap.appendChild(W.el('p', { class: 'wz-d-admindanger__label' },
      W.el('span', { class: 'wz-d-admindanger__ic', html: SVG.shield }),
      W.el('span', {}, '관리자 전용')));
    const btn = W.el('button', { class: 'wz-d-delbtn', type: 'button' },
      W.el('span', { class: 'wz-d-delbtn__ic', html: SVG.trash }), W.el('span', {}, '게시글 삭제'));
    btn.addEventListener('click', () => confirmAdminDelete(f));
    wrap.appendChild(btn);
    return wrap;
  }

  /* 삭제 확인 모달 → POST /api/admin/funds/:id/delete → 성공 시 홈으로 이동. */
  function confirmAdminDelete(f) {
    const overlay = W.el('div', { class: 'wz-d-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '게시글 삭제' });
    const box = W.el('div', { class: 'wz-d-modal__box' });
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (e.key === 'Escape') close(); }

    const head = W.el('div', { class: 'wz-d-modal__head' });
    const closeBtn = W.el('button', { class: 'wz-d-modal__close', type: 'button', 'aria-label': '닫기', html: SVG.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h3', {}, '게시글 삭제'), closeBtn);

    const body = W.el('div', { class: 'wz-d-modal__body' });
    body.appendChild(W.el('div', { class: 'wz-d-delwarn' },
      W.el('span', { class: 'wz-d-delwarn__ic', html: SVG.alert }),
      W.el('span', {}, '“' + (f.title || '제목 없음') + '” 게시글을 삭제합니다. 진행 중인 모든 후원이 취소되며, 이 작업은 되돌릴 수 없습니다.')));
    body.appendChild(W.el('p', { class: 'wz-d-modal__note' },
      '입금 완료(확정) 건은 실제 환불이 필요합니다. 삭제 후 환불 대상 목록이 표시됩니다.'));

    const foot = W.el('div', { class: 'wz-d-delfoot' });
    const cancel = W.el('button', { class: 'wz-btn wz-btn--ghost', type: 'button' }, '취소');
    cancel.addEventListener('click', close);
    const del = W.el('button', { class: 'wz-btn wz-btn--block wz-d-delconfirm', type: 'button' }, '삭제');
    del.addEventListener('click', async () => {
      del.disabled = true; cancel.disabled = true;
      const prev = del.textContent; del.textContent = '삭제 중...';
      let res;
      try {
        res = await window.api.post('/admin/funds/' + encodeURIComponent(f.id) + '/delete', {});
      } catch (e) {
        del.disabled = false; cancel.disabled = false; del.textContent = prev;
        if (e && e.status === 401) { location.href = '/login.html'; return; }
        if (e && e.status === 404) { toast('이미 삭제되었거나 존재하지 않는 게시글이에요'); return; }
        toast((e && e.message) ? e.message : '삭제에 실패했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      close();
      const refundable = (res && Array.isArray(res.refundable)) ? res.refundable : [];
      if (refundable.length) {
        // 환불 안내를 먼저 보여주고, 확인 시 홈으로 이동
        showRefundList(refundable, () => { location.href = '/main.html'; });
        toast('게시글을 삭제했어요');
      } else {
        toast('게시글을 삭제했어요');
        setTimeout(() => { location.href = '/main.html'; }, 700);
      }
    });
    foot.append(cancel, del);

    body.appendChild(foot);
    box.append(head, body);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  /* 환불 대상(입금완료였던 주문) 목록 안내. 확인 시 onDone 콜백 실행. */
  function showRefundList(refundable, onDone) {
    const overlay = W.el('div', { class: 'wz-d-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '환불 대상' });
    const box = W.el('div', { class: 'wz-d-modal__box' });
    const done = () => { overlay.remove(); if (typeof onDone === 'function') onDone(); };

    const head = W.el('div', { class: 'wz-d-modal__head' });
    head.append(W.el('h3', {}, '환불 대상 ' + refundable.length + '건'));

    const body = W.el('div', { class: 'wz-d-modal__body' });
    body.appendChild(W.el('p', { class: 'wz-d-modal__note' }, '아래 입금 완료 건은 실제 환불 처리가 필요합니다.'));
    const list = W.el('div', { class: 'wz-d-refunds' });
    refundable.forEach((r) => {
      const who = (r && (r.depositorName || r.userName || r.userId)) || '후원자';
      const row = W.el('div', { class: 'wz-d-refunds__row' });
      row.append(
        W.el('span', { class: 'wz-d-refunds__who' }, String(who)),
        W.el('span', { class: 'wz-d-refunds__amt' }, W.money((r && r.amount) || 0)));
      list.appendChild(row);
    });
    body.appendChild(list);

    const ok = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--block', type: 'button' }, '확인');
    ok.addEventListener('click', done);
    body.appendChild(ok);

    box.append(head, body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  /* ===================================================================
   * 작성자 본인 — 프로젝트 삭제 요청 (#5)
   *  - isOwner(f) 가 true 일 때만 노출(타인/비로그인엔 미노출). 관리자 위험영역(AdminDanger)과는 별개.
   *  - 클릭 → 사유 입력(옵션) 확인 모달 → POST /api/me/funds/:id/delete-request.
   *  - 성공 시 안내 토스트 + 버튼을 '삭제 요청됨'(비활성)으로 전환.
   *  - 상세 응답엔 delete_requested 플래그가 없어 초기 '요청됨' 상태는 표시 못함 → 클릭 후 상태만 갱신.
   * =================================================================== */
  function OwnerDeleteRequest(f) {
    if (!isOwner(f)) return null; // 본인 소유 펀드일 때만(서버도 owner 전용이지만 UI 가드)

    const sec = W.el('section', { class: 'wz-d-delreq' });
    sec.appendChild(W.el('p', { class: 'wz-d-delreq__label' },
      W.el('span', { class: 'wz-d-delreq__ic', html: SVG.alert }),
      W.el('span', {}, '내 프로젝트 관리')));
    sec.appendChild(W.el('p', { class: 'wz-d-delreq__desc' },
      '더 이상 진행하지 않는다면 삭제를 요청할 수 있어요. 요청하면 관리자가 후원·환불 상태를 확인한 뒤 처리합니다.'));

    const btn = W.el('button', { class: 'wz-d-delreq__btn', type: 'button' },
      W.el('span', { class: 'wz-d-delreq__btn-ic', html: SVG.trash }),
      W.el('span', {}, '이 프로젝트 삭제 요청'));
    btn.addEventListener('click', () => openDeleteRequestModal(f, btn));
    sec.appendChild(btn);
    return sec;
  }

  /* 삭제 요청 버튼을 '삭제 요청됨'(비활성)으로 전환. */
  function markDeleteRequested(btn) {
    if (!btn) return;
    btn.disabled = true;
    btn.classList.add('is-requested');
    btn.replaceChildren(
      W.el('span', { class: 'wz-d-delreq__btn-ic', html: SVG.shield }),
      W.el('span', {}, '삭제 요청됨'));
  }

  /* 삭제 요청 확인 모달(사유 입력 옵션) → POST /api/me/funds/:id/delete-request. */
  function openDeleteRequestModal(f, triggerBtn) {
    const overlay = W.el('div', { class: 'wz-d-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '프로젝트 삭제 요청' });
    const box = W.el('div', { class: 'wz-d-modal__box' });
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (e.key === 'Escape') close(); }

    const head = W.el('div', { class: 'wz-d-modal__head' });
    const closeBtn = W.el('button', { class: 'wz-d-modal__close', type: 'button', 'aria-label': '닫기', html: SVG.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h3', {}, '프로젝트 삭제 요청'), closeBtn);

    const body = W.el('div', { class: 'wz-d-modal__body' });
    body.appendChild(W.el('div', { class: 'wz-d-delwarn' },
      W.el('span', { class: 'wz-d-delwarn__ic', html: SVG.alert }),
      W.el('span', {}, '“' + (f.title || '제목 없음') + '” 삭제를 요청합니다. 관리자 확인 후 처리되며, 후원·환불 정리가 필요한 경우 즉시 삭제되지 않을 수 있어요.')));

    const label = W.el('label', { class: 'wz-d-modal__note', for: 'wz-delreq-reason' }, '삭제 사유 (선택)');
    const reason = W.el('textarea', {
      class: 'wz-d-modal__input wz-d-delreq__reason',
      id: 'wz-delreq-reason',
      rows: '3',
      maxlength: '500',
      placeholder: '예) 더 이상 진행하지 않으려고 해요',
    });
    body.append(label, reason);

    const foot = W.el('div', { class: 'wz-d-delfoot' });
    const cancel = W.el('button', { class: 'wz-btn wz-btn--ghost', type: 'button' }, '취소');
    cancel.addEventListener('click', close);
    const submit = W.el('button', { class: 'wz-btn wz-btn--block wz-d-delconfirm', type: 'button' }, '삭제 요청');
    submit.addEventListener('click', async () => {
      submit.disabled = true; cancel.disabled = true;
      const prev = submit.textContent; submit.textContent = '요청 중...';
      const payload = {};
      const txt = reason.value.trim();
      if (txt) payload.reason = txt; // 사유는 옵션(서버가 trim/500자 컷)
      try {
        await window.api.post('/me/funds/' + encodeURIComponent(f.id) + '/delete-request', payload);
      } catch (e) {
        submit.disabled = false; cancel.disabled = false; submit.textContent = prev;
        if (e && e.status === 401) { location.href = '/login.html'; return; }
        if (e && e.status === 404) { toast('본인이 개설한 프로젝트만 삭제 요청할 수 있어요'); return; }
        toast((e && e.message) ? e.message : '삭제 요청에 실패했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      close();
      markDeleteRequested(triggerBtn);
      toast('삭제 요청이 접수되었어요. 관리자 확인 후 처리됩니다');
    });
    foot.append(cancel, submit);
    body.appendChild(foot);

    box.append(head, body);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    setTimeout(() => { try { reason.focus(); } catch (_) {} }, 30);
  }

  /* 창작자 정보(creatorInfo) 정규화 — 저장된 필드만 추림. 하나도 없으면 null. */
  function creatorInfoOf(f) {
    const c = f.creatorInfo;
    if (!c || typeof c !== 'object') return null;
    const out = {};
    if (typeof c.name === 'string' && c.name.trim()) out.name = c.name.trim();
    if (typeof c.image === 'string' && c.image.trim()) out.image = c.image.trim();
    if (typeof c.intro === 'string' && c.intro.trim()) out.intro = c.intro.trim();
    if (typeof c.sido === 'string' && c.sido.trim()) out.sido = c.sido.trim();
    if (typeof c.sigungu === 'string' && c.sigungu.trim()) out.sigungu = c.sigungu.trim();
    return Object.keys(out).length ? out : null;
  }
  function creatorRegion(ci) {
    if (!ci) return '';
    return [ci.sido, ci.sigungu].filter(Boolean).join(' ');
  }

  /* ---------- 메이커 카드 (팔로우 + 창작자 정보) ----------
   * owner=true(본인 소유)면 팔로우·문의 버튼을 만들지 않는다(자기 자신 팔로우/문의 불가). */
  function MakerCard(f, owner) {
    const maker = makerOf(f);
    const ci = creatorInfoOf(f);
    const href = makerHref(maker);
    const card = W.el('div', { class: 'wz-d-maker' });

    /* 헤더: 아바타 + 이름/팔로워 (클릭 시 메이커 공개 프로필로 이동) */
    const head = href
      ? W.el('a', { class: 'wz-d-maker__head', href })
      : W.el('div', { class: 'wz-d-maker__head' });
    const av = W.el('span', { class: 'wz-d-maker__av', html: SVG.user });
    // 아바타: 메이커 프로필 사진 우선, 없으면 창작자 정보 이미지로 폴백
    const avatarSrc = maker.picture || (ci && ci.image) || '';
    if (avatarSrc) {
      const im = W.el('img', { src: avatarSrc, alt: '' });
      im.addEventListener('error', () => { im.remove(); av.innerHTML = SVG.user; });
      av.innerHTML = '';
      av.appendChild(im);
    }
    const info = W.el('div', {});
    const followersEl = W.el('p', { class: 'wz-d-maker__followers' });
    followersEl.append(W.el('b', {}, String(maker.followerCount)), document.createTextNode('명의 팔로워'));
    // 이름: 메이커 이름 우선, 없으면 창작자 정보 이름으로 폴백
    const displayName = maker.name || (ci && ci.name) || makerName(maker);
    info.append(W.el('p', { class: 'wz-d-maker__name' }, displayName), followersEl);
    head.append(av, info);
    card.appendChild(head);

    /* 창작자 정보 보강: 활동 지역 · 소개 (값 있는 줄만) */
    const region = creatorRegion(ci);
    if (region) {
      card.appendChild(W.el('p', { class: 'wz-d-maker__region' }, region));
    }
    if (ci && ci.intro) {
      card.appendChild(W.el('p', { class: 'wz-d-maker__intro' }, ci.intro));
    }

    /* 본인 소유면 팔로우/문의 버튼을 만들지 않는다(자기 자신 후원/문의 불가). */
    if (owner) return card;

    const btns = W.el('div', { class: 'wz-d-maker__btns' });
    let following = maker.isFollowing;
    const followBtn = W.el('button', { class: 'wz-btn ' + (following ? 'wz-btn--ghost' : 'wz-btn--outline'), type: 'button' },
      following ? '팔로잉' : '팔로우');
    const askBtn = W.el('button', { class: 'wz-btn wz-btn--ghost', type: 'button' }, '문의하기');
    askBtn.addEventListener('click', () => { location.href = '/support.html'; });
    btns.append(followBtn, askBtn);
    card.appendChild(btns);

    function paint() {
      followBtn.textContent = following ? '팔로잉' : '팔로우';
      followBtn.classList.toggle('wz-btn--ghost', following);
      followBtn.classList.toggle('wz-btn--outline', !following);
    }

    if (maker.userId) {
      followBtn.addEventListener('click', async () => {
        followBtn.disabled = true;
        try {
          const st = following
            ? await window.api.del('/users/' + encodeURIComponent(maker.userId) + '/follow')
            : await window.api.post('/users/' + encodeURIComponent(maker.userId) + '/follow', {});
          following = !!(st && st.following);
          if (st && typeof st.followerCount === 'number') {
            const b = followersEl.querySelector('b'); if (b) b.textContent = String(st.followerCount);
          }
          paint();
        } catch (e) {
          if (e && e.status === 401) { location.href = '/login.html'; return; }
          alert('처리에 실패했어요. 잠시 후 다시 시도해 주세요.');
        } finally { followBtn.disabled = false; }
      });
    } else {
      followBtn.disabled = true;
    }
    return card;
  }

  /* ---------- 리워드 선택 ----------
   * 선택 여부는 _tierSelected(boolean)로 판단한다. _selectedTierId 값이 0/''(falsy)
   * 일 수 있어 값만으로 "선택 안 됨"을 판단하면 첫 리워드가 막히는 버그가 생기므로 분리. */
  let _selectedTierId = null;
  let _tierSelected = false;
  function Rewards(f, tiers) {
    // 리워드 영역을 새로 그릴 때 이전 선택 상태 초기화(다른 프로젝트 잔존 방지)
    _selectedTierId = null;
    _tierSelected = false;
    const sec = W.el('div', { class: 'wz-d-rewards' });
    sec.appendChild(W.el('h3', { class: 'wz-d-rewards__title' }, '리워드 선택'));
    const period = fmtPeriod(f.deadline);
    if (period) sec.appendChild(W.el('p', { class: 'wz-d-rewards__period' }, '진행 기간 · ' + period));

    if (!tiers.length) {
      sec.appendChild(W.el('div', { class: 'wz-d-rewards__empty' }, '등록된 리워드가 없어요.'));
      return sec;
    }
    const list = W.el('div', { class: 'wz-d-rewards__list' });
    tiers.forEach((t, ti) => {
      const rawStock = (t.stock != null) ? t.stock : t.stockLimit;
      const stockLimit = (rawStock == null) ? null : Number(rawStock);
      const sold = Number(t.soldCount) || 0;
      const remain = stockLimit == null ? null : Math.max(0, stockLimit - sold);
      const soldOut = remain === 0;

      const item = W.el('div', { class: 'wz-d-reward' + (soldOut ? ' is-soldout' : '') });
      const top = W.el('div', { class: 'wz-d-reward__top' });
      if (stockLimit != null) {
        top.appendChild(W.el('span', { class: 'wz-d-reward__stock' + (soldOut ? ' wz-d-reward__stock--out' : '') },
          soldOut ? '마감' : ('남은 수량 ' + remain + '개')));
      }
      top.appendChild(W.el('span', { class: 'wz-d-reward__price' }, W.money(t.price)));
      item.appendChild(top);
      item.appendChild(W.el('p', { class: 'wz-d-reward__t' }, t.title || '리워드'));
      const tdesc = t.desc != null ? t.desc : t.description;
      if (tdesc) item.appendChild(W.el('p', { class: 'wz-d-reward__d' }, tdesc));

      const pick = W.el('button', { class: 'wz-btn wz-btn--outline wz-btn--block wz-d-reward__pick', type: 'button' },
        soldOut ? '마감되었습니다' : '이 리워드 선택');
      if (soldOut) { pick.disabled = true; }
      else {
        const select = () => {
          _selectedTierId = (t.id != null) ? t.id : ti;
          _tierSelected = true;
          list.querySelectorAll('.wz-d-reward').forEach((n) => n.classList.remove('is-sel'));
          item.classList.add('is-sel');
          list.querySelectorAll('.wz-d-reward__pick').forEach((b) => { if (!b.disabled) { b.textContent = '이 리워드 선택'; b.classList.remove('wz-btn--primary'); b.classList.add('wz-btn--outline'); } });
          pick.textContent = '선택됨';
          pick.classList.remove('wz-btn--outline'); pick.classList.add('wz-btn--primary');
        };
        item.addEventListener('click', select);
        pick.addEventListener('click', (e) => { e.stopPropagation(); select(); });
      }
      item.appendChild(pick);
      list.appendChild(item);
    });
    sec.appendChild(list);
    return sec;
  }

  /* ---------- 이미 참여 중 안내(1인 1펀딩) ----------
   * _myActiveOrder 가 있을 때 '펀딩하기' 대신 노출. 상태에 따라:
   *  - pledged(예약/결제 전): [펀딩 변경](리워드 다시 선택) + [후원 내역 보기](취소는 마이페이지).
   *  - 그 외(결제완료/진행 중): 변경 불가 안내 + [후원 내역 보기].
   * 변경/취소 모두 마이페이지(후원 내역)로 연결되며, 변경은 여기서 바로 가능. */
  function isPledged(order) {
    return String(order && order.status || '').toLowerCase() === 'pledged';
  }
  function AlreadyBacked(f, order) {
    const box = W.el('div', { class: 'wz-d-backed' });

    const head = W.el('div', { class: 'wz-d-backed__head' });
    head.append(
      W.el('span', { class: 'wz-d-backed__ic', html: SVG.shield }),
      W.el('span', {}, W.el('b', {}, '이미 이 프로젝트에 참여하고 있어요'),
        document.createTextNode(' 한 프로젝트에는 한 번만 참여할 수 있어요.')));
    box.appendChild(head);

    // 현재 선택한 리워드 표기(있으면)
    const rwTitle = (order && order.rewardTitle) ? String(order.rewardTitle) : '';
    const meta = W.el('p', { class: 'wz-d-backed__meta' });
    meta.append(document.createTextNode('선택한 리워드 · '), W.el('b', {}, rwTitle || '리워드'));
    box.appendChild(meta);

    const pledged = isPledged(order);
    if (pledged) {
      // 변경 가능(예약 상태)
      const changeBtn = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg wz-btn--block wz-d-cta', type: 'button' },
        W.el('span', { class: 'wz-d-cta__ic', html: EDIT_IC.pen }), W.el('span', {}, '펀딩 변경'));
      changeBtn.addEventListener('click', () => openChangeRewardModal(f, order));
      box.appendChild(changeBtn);
      box.appendChild(W.el('p', { class: 'wz-d-backed__note' },
        '아직 결제 전(예약)이라 리워드를 변경할 수 있어요. 참여를 그만두려면 후원 내역에서 취소해 주세요.'));
    } else {
      // 변경 불가(결제완료/진행 중)
      box.appendChild(W.el('p', { class: 'wz-d-backed__note' },
        '결제가 진행된 후원이라 리워드는 변경할 수 없어요. 변경하려면 후원 내역에서 취소한 뒤 다시 참여해 주세요.'));
    }

    const myBtn = W.el('button', { class: 'wz-btn wz-btn--outline wz-btn--lg wz-btn--block', type: 'button' },
      pledged ? '펀딩 취소 · 내 후원 내역' : '내 후원 내역 보기');
    myBtn.addEventListener('click', () => { location.href = '/profile.html'; });
    box.appendChild(myBtn);
    return box;
  }

  /* 펀딩 변경 모달 — 예약(pledged) 주문의 리워드 티어를 다시 선택.
   * 기존 리워드 목록(마감 제외)을 재사용해 라디오식 선택 → POST /api/me/orders/:id/change {rewardTierId}.
   * 성공 시 토스트 + _myActiveOrder 갱신 후 화면 재렌더. */
  function openChangeRewardModal(f, order) {
    const tiers = Array.isArray(f.rewardTiers) ? f.rewardTiers : [];
    const overlay = W.el('div', { class: 'wz-d-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '펀딩 변경' });
    const boxEl = W.el('div', { class: 'wz-d-modal__box' });
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (e.key === 'Escape') close(); }

    const head = W.el('div', { class: 'wz-d-modal__head' });
    const closeBtn = W.el('button', { class: 'wz-d-modal__close', type: 'button', 'aria-label': '닫기', html: SVG.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h3', {}, '펀딩 변경'), closeBtn);

    const body = W.el('div', { class: 'wz-d-modal__body' });
    body.appendChild(W.el('p', { class: 'wz-d-modal__note' },
      '변경할 리워드를 선택해 주세요. 예약(결제 전) 상태에서만 변경할 수 있어요.'));

    // 변경용 리워드 선택 — 현재 리워드를 기본 선택. 마감 리워드는 선택 불가.
    let chosenTierId = (order && order.rewardTierId != null) ? order.rewardTierId : null;
    const list = W.el('div', { class: 'wz-d-changelist' });
    if (!tiers.length) {
      list.appendChild(W.el('p', { class: 'wz-d-rewards__empty' }, '선택할 리워드가 없어요.'));
    }
    tiers.forEach((t, ti) => {
      const tid = (t.id != null) ? t.id : ti;
      const rawStock = (t.stock != null) ? t.stock : t.stockLimit;
      const stockLimit = (rawStock == null) ? null : Number(rawStock);
      const sold = Number(t.soldCount) || 0;
      const remain = stockLimit == null ? null : Math.max(0, stockLimit - sold);
      const isCurrent = chosenTierId != null && String(tid) === String(chosenTierId);
      // 같은 티어로의 변경은 재고와 무관히 허용(현재 내가 점유 중). 다른 티어는 마감이면 선택 불가.
      const soldOut = !isCurrent && remain === 0;

      const item = W.el('div', { class: 'wz-d-changeitem' + (isCurrent ? ' is-sel' : '') + (soldOut ? ' is-soldout' : '') });
      const top = W.el('div', { class: 'wz-d-reward__top' });
      if (stockLimit != null) {
        top.appendChild(W.el('span', { class: 'wz-d-reward__stock' + (soldOut ? ' wz-d-reward__stock--out' : '') },
          soldOut ? '마감' : ('남은 수량 ' + remain + '개')));
      }
      top.appendChild(W.el('span', { class: 'wz-d-reward__price' }, W.money(t.price)));
      item.appendChild(top);
      item.appendChild(W.el('p', { class: 'wz-d-reward__t' }, t.title || '리워드'));
      const tdesc = t.desc != null ? t.desc : t.description;
      if (tdesc) item.appendChild(W.el('p', { class: 'wz-d-reward__d' }, tdesc));
      if (isCurrent) item.appendChild(W.el('span', { class: 'wz-d-changeitem__cur' }, '현재 선택'));

      if (!soldOut) {
        item.addEventListener('click', () => {
          chosenTierId = tid;
          list.querySelectorAll('.wz-d-changeitem').forEach((n) => n.classList.remove('is-sel'));
          item.classList.add('is-sel');
        });
      }
      list.appendChild(item);
    });
    body.appendChild(list);

    const submit = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg wz-btn--block', type: 'button' }, '변경하기');
    submit.addEventListener('click', async () => {
      if (chosenTierId == null) { toast('변경할 리워드를 선택해 주세요'); return; }
      submit.disabled = true;
      const prev = submit.textContent; submit.textContent = '변경 중...';
      let res;
      try {
        res = await window.api.post('/me/orders/' + encodeURIComponent(order.id) + '/change', { rewardTierId: chosenTierId });
      } catch (e) {
        submit.disabled = false; submit.textContent = prev;
        if (e && e.status === 401) { location.href = '/login.html'; return; }
        if (e && (e.code === 'SOLD_OUT' || (e.data && e.data.error === 'SOLD_OUT'))) { toast('선택한 리워드가 방금 마감되었어요'); return; }
        if (e && (e.code === 'INVALID_STATE' || (e.data && e.data.error === 'INVALID_STATE'))) {
          toast((e && e.message) || '예약(결제 전) 상태의 펀딩만 변경할 수 있어요'); return;
        }
        toast((e && e.message) ? e.message : '변경에 실패했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      close();
      toast('펀딩을 변경했어요');
      // 활성 주문 갱신(응답값 우선) 후 화면 재렌더 → 참여중 안내가 새 리워드로 갱신.
      _myActiveOrder = Object.assign({}, order, {
        rewardTierId: (res && res.rewardTierId != null) ? res.rewardTierId : chosenTierId,
        rewardTitle: (res && res.rewardTitle != null) ? res.rewardTitle : order.rewardTitle,
        status: (res && res.status) ? res.status : order.status,
      });
      _selectedTierId = null; _tierSelected = false;
      render(f);
      window.scrollTo({ top: 0 });
    });
    body.appendChild(submit);
    const cancelBtn = W.el('button', { class: 'wz-btn wz-btn--outline wz-btn--block', type: 'button' }, '닫기');
    cancelBtn.addEventListener('click', close);
    body.appendChild(cancelBtn);

    boxEl.append(head, body);
    overlay.appendChild(boxEl);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  /* 하트 팝 애니메이션 — 클래스 재부여로 keyframe 재생(연타 시 재시작). */
  function popHeart(btn) {
    btn.classList.remove('is-pop');
    // reflow 강제 후 클래스 재부여(같은 클래스 연속 토글 시에도 애니메이션 재시작)
    void btn.offsetWidth;
    btn.classList.add('is-pop');
    btn.addEventListener('animationend', function onEnd() {
      btn.classList.remove('is-pop');
      btn.removeEventListener('animationend', onEnd);
    });
  }

  /* ---------- 모바일 하단 고정 바 ---------- */
  let _mobileLikeSync = null;
  /* 측면 패널 찜 버튼(상태+숫자)을 다시 그리도록 위임. 없으면 클래스만 토글. */
  let _sidePaintLike = null;
  function syncMobileLike(on) { const b = document.querySelector('.wz-d-mbar__like'); if (b) b.classList.toggle('is-on', on); }
  function MobileBar(f, tiers) {
    const bar = W.el('div', { class: 'wz-d-mbar' });
    const owner = isOwner(f);
    const likedNow = (typeof window.isLiked === 'function') && window.isLiked(f.id);
    const like = W.el('button', { class: 'wz-d-mbar__like' + (likedNow ? ' is-on' : ''), type: 'button', 'aria-label': '찜', html: SVG.heart });
    like.addEventListener('click', () => {
      if (typeof window.toggleLike !== 'function') return;
      const wasOn = (typeof window.isLiked === 'function') ? window.isLiked(f.id) : !!f.isLiked;
      const on = window.toggleLike(f.id);
      // 상세 f.likeCount 낙관적 보정(측면 패널과 동일 기준) — 서버 응답으로 likes:updated 가 재동기화.
      f.isLiked = on;
      f.likeCount = Math.max(0, (Number(f.likeCount) || 0) + (on ? 1 : -1));
      like.classList.toggle('is-on', on);
      if (on && !wasOn) popHeart(like);
      if (_sidePaintLike) _sidePaintLike(); else if (_mobileLikeSync) _mobileLikeSync(on);
    });
    if (owner) {
      /* 본인 소유: 펀딩 대신 수정 버튼 */
      const edit = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg', type: 'button' }, '기본정보 · 스토리 수정');
      edit.addEventListener('click', () => openEditModal(f));
      bar.append(like, edit);
    } else if (isScheduled(f)) {
      /* 공개예정: 펀딩 대신 알림신청. 클릭 시 우측 패널의 알림신청 버튼으로 위임(상태 동기화). */
      const alarm = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg', type: 'button' },
        f.isSubscribed ? '알림신청됨' : '공개 알림신청');
      alarm.addEventListener('click', () => {
        const sideBtn = document.querySelector('.wz-d-subscribe .wz-d-cta');
        if (sideBtn) { sideBtn.click(); sideBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      });
      bar.append(like, alarm);
    } else if (_myActiveOrder) {
      /* 이미 참여 중: 모바일도 펀딩하기 대신 우측 패널의 참여중 영역으로 안내(변경/취소). */
      const go = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg', type: 'button' },
        isPledged(_myActiveOrder) ? '펀딩 변경 · 취소' : '내 후원 내역');
      go.addEventListener('click', () => {
        const sideBacked = document.querySelector('.wz-d-backed');
        if (sideBacked) sideBacked.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else location.href = '/profile.html';
      });
      bar.append(like, go);
    } else {
      const fund = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg', type: 'button' }, '펀딩하기');
      fund.addEventListener('click', () => backFlow(f));
      bar.append(like, fund);
    }
    return bar;
  }

  /* ---------- 공유 ---------- */
  function copyLink(url, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => alert(okMsg || '링크가 복사되었어요.')).catch(() => prompt('아래 링크를 복사해 주세요.', url));
    } else {
      prompt('아래 링크를 복사해 주세요.', url);
    }
  }
  function openShareWindow(shareUrl) {
    // 클릭(사용자 제스처) 첫 줄에서 동기 호출되어야 팝업 차단을 피한다.
    window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=540');
  }

  /* 카카오톡 공유: 카카오 SDK/도메인 등록(4019) 없이 — 링크 복사 + 카카오톡 앱 실행 시도.
   * 커스텀 스킴(kakaotalk://)을 숨김 iframe 으로 호출(설치 시 앱 열림, 미설치/미지원이면 조용히 무시). */
  function openKakaoTalk() {
    try {
      const ifr = document.createElement('iframe');
      ifr.style.display = 'none';
      ifr.src = 'kakaotalk://';
      document.body.appendChild(ifr);
      setTimeout(() => { try { ifr.remove(); } catch (_) {} }, 1500);
    } catch (_) { /* 무시 */ }
  }

  function doShare(f) {
    const url = location.href;
    const enc = encodeURIComponent(url);
    const title = f.title || '두띵 프로젝트';
    const encTitle = encodeURIComponent(title);

    /* 각 항목은 클릭 즉시(동기) 처리. window.open 은 핸들러 첫 줄에서 호출(팝업 차단 방지).
     * 카카오톡: 링크 복사 + 카카오톡 앱 실행(SDK/도메인 등록 불필요). 나머지는 웹 공유 인텐트.
     * 모든 항목은 <button type="button"> (a href="#" 미사용). */
    const items = [
      ['kakao', '카카오톡', SVG.kakao, () => { try { if (navigator.clipboard) navigator.clipboard.writeText(url); } catch (_) { /* 무시 */ } openKakaoTalk(); }],
      ['twitterX', 'X', SVG.twitterX, () => {
        openShareWindow('https://twitter.com/intent/tweet?url=' + enc + '&text=' + encTitle);
      }],
      ['facebook', '페이스북', SVG.facebook, () => {
        openShareWindow('https://www.facebook.com/sharer/sharer.php?u=' + enc);
      }],
      ['link', '링크 복사', SVG.link, () => copyLink(url)],
    ];

    const overlay = W.el('div', { class: 'wz-d-sharesheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': '공유하기' });
    const box = W.el('div', { class: 'wz-d-sharesheet__box' });
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (e.key === 'Escape') close(); }

    const head = W.el('div', { class: 'wz-d-sharesheet__head' });
    const closeBtn = W.el('button', { class: 'wz-d-sharesheet__close', type: 'button', 'aria-label': '닫기', html: SVG.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h3', {}, '공유하기'), closeBtn);

    const grid = W.el('div', { class: 'wz-d-sharesheet__grid' });
    items.forEach(([key, label, icon, action]) => {
      const btn = W.el('button', { class: 'wz-d-shareitem wz-d-shareitem--' + key, type: 'button' },
        W.el('span', { class: 'wz-d-shareitem__ic', html: icon }),
        W.el('span', { class: 'wz-d-shareitem__label' }, label));
      // 핸들러 첫 줄에서 action()을 동기 실행(window.open 이 제스처 안에서 호출되도록). 그 다음 시트를 닫는다.
      btn.addEventListener('click', () => { action(); close(); });
      grid.appendChild(btn);
    });

    box.append(head, grid);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  /* ===================================================================
   * 후원 플로우 (POST /api/funds/:id/back) — 예약 + 결제수단 게이트
   *  - 후원=예약(status:'pledged'). 마감일에 목표 달성 시 다음날부터 등록한
   *    결제수단으로 순차 결제(무통장 입금 안내 없음).
   *  - 결제수단 미등록(400 PAYMENT_METHOD_REQUIRED)이면 등록 안내 후 /settings.html#payment 로 이동.
   * =================================================================== */
  // 결제수단 미등록 안내 모달. [결제수단 등록] → /settings.html#payment.
  function showPaymentMethodGate(msg) {
    const overlay = W.el('div', { class: 'wz-d-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '결제수단 등록 안내' });
    const box = W.el('div', { class: 'wz-d-modal__box' });
    const close = () => overlay.remove();

    const head = W.el('div', { class: 'wz-d-modal__head' });
    const closeBtn = W.el('button', { class: 'wz-d-modal__close', type: 'button', 'aria-label': '닫기', html: SVG.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h3', {}, '결제수단 등록이 필요해요'), closeBtn);

    const body = W.el('div', { class: 'wz-d-modal__body' });
    body.appendChild(W.el('p', { class: 'wz-d-modal__note' },
      (msg && String(msg).trim()) || '결제수단(카드/계좌)을 먼저 등록해 주세요. 목표 달성 시 등록한 결제수단으로 자동 결제돼요.'));
    const goBtn = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg wz-btn--block', type: 'button' }, '결제수단 등록');
    goBtn.addEventListener('click', () => { location.href = '/settings.html#payment'; });
    body.appendChild(goBtn);
    const laterBtn = W.el('button', { class: 'wz-btn wz-btn--outline wz-btn--block', type: 'button' }, '나중에 하기');
    laterBtn.addEventListener('click', close);
    body.appendChild(laterBtn);

    box.append(head, body);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
  }

  /* 이미 참여 중 안내 모달(서버 409 ALREADY_BACKED 대비 이중 안전).
   * 안내 메시지 + [후원 내역 보기]. 닫으면 활성 주문을 다시 조회해 참여중 UI 로 재렌더(중복 시도 차단). */
  function showAlreadyBackedGate(f, msg) {
    const overlay = W.el('div', { class: 'wz-d-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '이미 참여 중' });
    const box = W.el('div', { class: 'wz-d-modal__box' });
    let resynced = false;
    async function resyncAndRender() {
      if (resynced) return; resynced = true;
      _myActiveOrder = await fetchMyActiveOrder(f.id);
      if (_myActiveOrder) { _selectedTierId = null; _tierSelected = false; render(f); }
    }
    const close = () => { overlay.remove(); resyncAndRender(); };

    const head = W.el('div', { class: 'wz-d-modal__head' });
    const closeBtn = W.el('button', { class: 'wz-d-modal__close', type: 'button', 'aria-label': '닫기', html: SVG.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h3', {}, '이미 참여 중이에요'), closeBtn);

    const body = W.el('div', { class: 'wz-d-modal__body' });
    body.appendChild(W.el('p', { class: 'wz-d-modal__note' },
      (msg && String(msg).trim()) || '이미 이 프로젝트에 참여 중이에요. 펀딩을 변경하거나 취소한 뒤 다시 참여할 수 있어요.'));
    const goBtn = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg wz-btn--block', type: 'button' }, '내 후원 내역 보기');
    goBtn.addEventListener('click', () => { location.href = '/profile.html'; });
    body.appendChild(goBtn);
    const laterBtn = W.el('button', { class: 'wz-btn wz-btn--outline wz-btn--block', type: 'button' }, '닫기');
    laterBtn.addEventListener('click', close);
    body.appendChild(laterBtn);

    box.append(head, body);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
  }

  async function backFlow(f) {
    if (!_tierSelected) {
      alert('후원할 리워드를 먼저 선택해 주세요.');
      const sec = document.querySelector('.wz-d-rewards');
      if (sec) sec.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    // 배송지 필요(예약에도 배송지 필요). 미등록 시 등록 페이지로 안내.
    let addrs;
    try {
      const r = await window.api.get('/addresses');
      addrs = Array.isArray(r) ? r : (r && r.items) || [];
    } catch (e) {
      if (e && e.status === 401) { location.href = '/login.html'; return; }
      alert('배송지 조회에 실패했어요.'); return;
    }
    if (!addrs.length) {
      if (confirm('후원하려면 배송지가 필요해요. 배송지를 등록할까요?')) location.href = '/addresses.html';
      return;
    }
    const def = addrs.find((a) => a.isDefault) || addrs[0];

    // 결제수단 사전 확인(미등록이면 서버 호출 전에 안내). 조회 실패는 막지 않고 서버 게이트에 위임.
    try {
      const pm = await window.api.get('/payment-methods');
      const list = Array.isArray(pm) ? pm : (pm && pm.items) || [];
      if (!list.length) { showPaymentMethodGate(); return; }
    } catch (e) {
      if (e && e.status === 401) { location.href = '/login.html'; return; }
      /* 조회 실패는 무시하고 진행 — 최종 판정은 서버 게이트가 한다. */
    }

    let res;
    try {
      res = await window.api.post('/funds/' + encodeURIComponent(f.id) + '/back', {
        rewardTierId: _selectedTierId,
        addressId: def.id,
      });
    } catch (e) {
      if (e && e.status === 401) { location.href = '/login.html'; return; }
      // 결제수단 게이트(서버 최종 판정): 400 PAYMENT_METHOD_REQUIRED.
      if (e && (e.code === 'PAYMENT_METHOD_REQUIRED' || (e.data && e.data.error === 'PAYMENT_METHOD_REQUIRED'))) {
        showPaymentMethodGate(e && e.message);
        return;
      }
      // 1인 1펀딩 이중 안전: 서버가 409 ALREADY_BACKED 면 안내 + 참여중 UI 로 갱신.
      if (e && (e.code === 'ALREADY_BACKED' || (e.data && e.data.error === 'ALREADY_BACKED'))) {
        showAlreadyBackedGate(f, e && e.message);
        return;
      }
      alert('후원 신청에 실패했어요: ' + ((e && e.message) || '알 수 없는 오류'));
      return;
    }
    // 선택한 리워드 객체(제목·금액 표시용). _selectedTierId 는 t.id(없으면 인덱스)로 저장됨.
    const tiers = Array.isArray(f.rewardTiers) ? f.rewardTiers : [];
    const selectedTier = tiers.find((t, ti) => ((t && t.id != null) ? t.id : ti) === _selectedTierId) || null;
    showPledgeModal(res, def, f, selectedTier);
  }

  // 후원(펀딩 참여) 완료 모달 — 무통장 입금/계좌번호 표기 없음.
  // 프로젝트 정보 요약(제목·썸네일·선택 리워드·금액) + 예약 안내.
  // 마감 목표 달성 시 다음날부터 등록 결제수단으로 순차 결제. 마감 전 자유 취소 안내.
  function showPledgeModal(res, addr, f, selectedTier) {
    const overlay = W.el('div', { class: 'wz-d-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '펀딩 참여 완료' });
    const box = W.el('div', { class: 'wz-d-modal__box' });
    const close = () => overlay.remove();

    const head = W.el('div', { class: 'wz-d-modal__head' });
    const closeBtn = W.el('button', { class: 'wz-d-modal__close', type: 'button', 'aria-label': '닫기', html: SVG.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h3', {}, '펀딩 참여 완료'), closeBtn);

    const body = W.el('div', { class: 'wz-d-modal__body' });

    body.appendChild(W.el('div', { class: 'wz-d-pledge-done', html: SVG.shield }));
    // 명확한 완료 메시지(제목 줄).
    body.appendChild(W.el('p', { class: 'wz-d-pledge-title' }, '펀딩 참여가 완료되었어요'));

    // 프로젝트 정보 요약 카드 — 대표 썸네일 + 프로젝트 제목 + 선택 리워드명.
    // XSS: 제목/리워드명은 textContent(W.el 인자) 로만 주입.
    if (f) {
      const card = W.el('div', { class: 'wz-d-pledge-proj' });
      const thumb = W.el('div', { class: 'wz-d-pledge-proj__thumb' });
      W.fillThumb(thumb, { imageUrl: f.coverImageUrl || f.designImageUrl || '', title: f.title || '', category: f.category });
      const meta = W.el('div', { class: 'wz-d-pledge-proj__meta' });
      meta.appendChild(W.el('p', { class: 'wz-d-pledge-proj__t' }, f.title || '프로젝트'));
      if (selectedTier) {
        meta.appendChild(W.el('p', { class: 'wz-d-pledge-proj__reward' }, selectedTier.title || '리워드'));
      }
      card.append(thumb, meta);
      body.appendChild(card);
    }

    // 예약 요약(리워드·금액·배송지). 계좌번호 등 무통장 정보는 표기하지 않는다.
    const dl = W.el('div', { class: 'wz-d-deposit' });
    const rows = [];
    if (selectedTier) rows.push(['선택한 리워드', selectedTier.title || '리워드', false]);
    rows.push(['후원 금액', W.money(res.amount), true]);
    if (addr) rows.push(['배송지', ((addr.label || '') + ' · ' + (addr.recipientName || '')).replace(/^ · | · $/g, '') || '-', false]);
    rows.forEach(([k, v, isAmount]) => {
      dl.appendChild(W.el('div', { class: 'wz-d-deposit__row' },
        W.el('span', { class: 'k' }, k),
        W.el('span', { class: 'v' + (isAmount ? ' amount' : '') }, v)));
    });
    body.appendChild(dl);

    // 안내문: 서버 chargeNote 가 있으면 우선 사용, 없으면 기본 예약 안내.
    const note = (res && typeof res.chargeNote === 'string' && res.chargeNote.trim())
      ? res.chargeNote.trim()
      : '마감일에 목표를 달성하면 다음날부터 등록한 결제수단으로 순차 결제돼요.';
    body.appendChild(W.el('p', { class: 'wz-d-modal__note' },
      '후원이 예약되었어요. ' + note + ' 마감 전에는 마이페이지에서 자유롭게 취소할 수 있어요.'));

    const okBtn = W.el('button', { class: 'wz-btn wz-btn--primary wz-btn--lg wz-btn--block', type: 'button' }, '확인');
    okBtn.addEventListener('click', close);
    body.appendChild(okBtn);
    const myBtn = W.el('button', { class: 'wz-btn wz-btn--outline wz-btn--block', type: 'button' }, '내 후원 내역 보기');
    myBtn.addEventListener('click', () => { location.href = '/profile.html'; });
    body.appendChild(myBtn);

    box.append(head, body);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
  }

  /* ===================================================================
   * 소유자 수정 모달 — 본인 펀드의 기본정보·스토리·창작자정보만 수정.
   * 화이트리스트: title, description, category, coverImageUrl, videoUrl,
   *   contentBlocks, creatorInfo. (리워드·금액·일정은 노출/전송하지 않음.)
   * 저장: PATCH /api/me/funds/:id → 응답(detail)로 화면 재렌더.
   * =================================================================== */

  /* 토스트(공유/수정 등 안내). 페이지 전용 경량 구현. */
  let _toastTimer;
  function toast(msg) {
    const ex = document.querySelector('.wz-d-toast');
    if (ex) ex.remove();
    const t = W.el('div', { class: 'wz-d-toast' }, msg);
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('is-on'));
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { t.classList.remove('is-on'); setTimeout(() => { if (t.parentNode) t.remove(); }, 250); }, 2600);
  }

  /* 이미지 파일 → data URL (PNG/JPG/WEBP, 최대 8MB). 서버 검증과 동일 범위. */
  function readEditImage(file, cb) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast('PNG·JPG·WEBP 이미지만 업로드할 수 있어요'); return; }
    if (file.size > 8 * 1024 * 1024) { toast('이미지는 최대 8MB까지 가능합니다'); return; }
    const r = new FileReader();
    r.onload = () => cb(String(r.result));
    r.onerror = () => toast('이미지를 읽지 못했습니다');
    r.readAsDataURL(file);
  }
  /* 영상 파일 → data URL (MP4/WEBM/MOV, 최대 30MB). */
  function readEditVideo(file, cb) {
    if (!file) return;
    if (!/^video\/(mp4|webm|quicktime)$/.test(file.type)) { toast('MP4·WEBM·MOV 영상만 업로드할 수 있어요'); return; }
    if (file.size > 30 * 1024 * 1024) { toast('영상은 최대 30MB까지 가능합니다'); return; }
    const r = new FileReader();
    r.onload = () => cb(String(r.result));
    r.onerror = () => toast('영상을 읽지 못했습니다');
    r.readAsDataURL(file);
  }
  /* 서버 검증과 동일하게 허용 형태만 통과(아니면 ''). */
  function normalizeEditVideo(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^data:video\/(mp4|webm|quicktime);base64,/.test(s)) return s.length <= 48000000 ? s : '';
    if (/^https?:\/\//.test(s)) return s.length <= 48000000 ? s : '';
    return '';
  }

  function efield(label, control, help) {
    const f = W.el('div', { class: 'wz-d-ef' });
    f.append(W.el('label', { class: 'wz-d-ef__label' }, label), control);
    if (help) f.appendChild(W.el('p', { class: 'wz-d-ef__help' }, help));
    return f;
  }

  function openEditModal(f) {
    // 현재 값 → 편집용 상태(스토리는 내부 {type,value} 양식으로 통일)
    const st = {
      title: String(f.title || ''),
      description: String(f.description || ''),
      category: String(f.category || ''),
      coverImage: (f.coverImageUrl && String(f.coverImageUrl)) || '',
      videoUrl: (f.videoUrl && String(f.videoUrl)) || '',
      blocks: (Array.isArray(f.contentBlocks) ? f.contentBlocks : []).map((b) => (
        b && b.type === 'image' ? { type: 'image', value: blockImageUrl(b) } : { type: 'text', value: blockText(b) }
      )).filter((b) => b.type === 'image' ? b.value : true),
      ciName: '', ciImage: '', ciIntro: '', ciSido: '', ciSigungu: '',
    };
    const ci = creatorInfoOf(f);
    if (ci) { st.ciName = ci.name || ''; st.ciImage = ci.image || ''; st.ciIntro = ci.intro || ''; st.ciSido = ci.sido || ''; st.ciSigungu = ci.sigungu || ''; }

    const overlay = W.el('div', { class: 'wz-d-edit', role: 'dialog', 'aria-modal': 'true', 'aria-label': '프로젝트 수정' });
    const box = W.el('div', { class: 'wz-d-edit__box' });
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) { if (e.key === 'Escape') close(); }

    const head = W.el('div', { class: 'wz-d-edit__head' });
    const closeBtn = W.el('button', { class: 'wz-d-edit__close', type: 'button', 'aria-label': '닫기', html: SVG.close });
    closeBtn.addEventListener('click', close);
    head.append(W.el('h3', {}, '기본정보 · 스토리 수정'), closeBtn);

    const body = W.el('div', { class: 'wz-d-edit__body' });

    /* ----- 제목 ----- */
    const titleIn = W.el('input', { class: 'wz-d-ef__input', type: 'text', maxlength: '80', placeholder: '프로젝트 제목' });
    titleIn.value = st.title;
    body.appendChild(efield('제목', titleIn, '후원자에게 보이는 이름입니다. 최대 80자.'));

    /* ----- 한 줄 소개 / 설명 ----- */
    const descIn = W.el('textarea', { class: 'wz-d-ef__textarea', maxlength: '2000', placeholder: '프로젝트 소개' });
    descIn.value = st.description;
    body.appendChild(efield('소개', descIn, '프로젝트를 소개하는 글입니다. 최대 2000자.'));

    /* ----- 카테고리 ----- */
    const catSel = W.el('select', { class: 'wz-d-ef__select' });
    catSel.appendChild(W.el('option', { value: '' }, '카테고리 선택'));
    (window.DT_CATEGORIES || []).forEach((c) => {
      const opt = W.el('option', { value: c.slug }, c.label);
      if (st.category === c.slug) opt.setAttribute('selected', 'selected');
      catSel.appendChild(opt);
    });
    body.appendChild(efield('카테고리', catSel));

    /* ----- 대표 이미지 ----- */
    const coverWrap = W.el('div', {});
    function renderCover() {
      coverWrap.replaceChildren();
      if (st.coverImage) {
        const pv = W.el('div', { class: 'wz-d-epreview' });
        pv.appendChild(W.el('img', { src: st.coverImage, alt: '대표 이미지 미리보기' }));
        const del = W.el('button', { class: 'wz-d-epreview__del', type: 'button', 'aria-label': '이미지 삭제', html: SVG.close });
        del.addEventListener('click', () => { st.coverImage = ''; renderCover(); });
        pv.appendChild(del);
        coverWrap.appendChild(pv);
      } else {
        const up = W.el('label', { class: 'wz-d-eupload' });
        up.append(W.el('span', { class: 'wz-d-eupload__ic', html: EDIT_IC.upload }), W.el('span', {}, '대표 이미지 업로드'), W.el('span', { class: 'wz-d-eupload__hint' }, 'PNG · JPG · WEBP (최대 8MB)'));
        const fileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
        fileIn.addEventListener('change', () => { readEditImage(fileIn.files && fileIn.files[0], (d) => { st.coverImage = d; renderCover(); }); fileIn.value = ''; });
        up.appendChild(fileIn);
        coverWrap.appendChild(up);
      }
    }
    renderCover();
    body.appendChild(efield('대표 이미지', coverWrap, '목록·상세 썸네일로 사용됩니다.'));

    /* ----- 대표 영상(파일 또는 링크) ----- */
    let videoLinkIn;
    const videoWrap = W.el('div', {});
    function renderVideo() {
      videoWrap.replaceChildren();
      if (st.videoUrl) {
        const vbox = W.el('div', { class: 'wz-d-epreview' });
        if (/^data:video\//.test(st.videoUrl)) {
          vbox.appendChild(W.el('video', { src: st.videoUrl, controls: 'controls', playsinline: 'playsinline' }));
        } else {
          const lk = W.el('div', { class: 'wz-d-evlink' });
          lk.append(W.el('span', { class: 'wz-d-evlink__ic', html: EDIT_IC.play }), W.el('span', { class: 'wz-d-evlink__url' }, st.videoUrl));
          vbox.appendChild(lk);
        }
        const del = W.el('button', { class: 'wz-d-epreview__del', type: 'button', 'aria-label': '영상 삭제', html: SVG.close });
        del.addEventListener('click', () => { st.videoUrl = ''; if (videoLinkIn) videoLinkIn.value = ''; renderVideo(); });
        vbox.appendChild(del);
        videoWrap.appendChild(vbox);
      } else {
        const up = W.el('label', { class: 'wz-d-eupload' });
        up.append(W.el('span', { class: 'wz-d-eupload__ic', html: EDIT_IC.upload }), W.el('span', {}, '대표 영상 업로드'), W.el('span', { class: 'wz-d-eupload__hint' }, 'MP4 · WEBM · MOV (최대 30MB)'));
        const fileIn = W.el('input', { type: 'file', accept: 'video/mp4,video/webm,video/quicktime', style: 'display:none' });
        fileIn.addEventListener('change', () => { readEditVideo(fileIn.files && fileIn.files[0], (d) => { st.videoUrl = d; if (videoLinkIn) videoLinkIn.value = ''; renderVideo(); }); fileIn.value = ''; });
        up.appendChild(fileIn);
        videoWrap.appendChild(up);
      }
    }
    renderVideo();
    body.appendChild(efield('대표 영상 (선택)', videoWrap, '영상을 올리거나 아래에 영상 링크를 넣어 주세요. 둘 중 하나만 사용됩니다.'));

    videoLinkIn = W.el('input', { class: 'wz-d-ef__input', type: 'url', maxlength: '2000', placeholder: 'YouTube·Vimeo 등 영상 링크(선택)' });
    videoLinkIn.value = /^https?:\/\//.test(st.videoUrl) ? st.videoUrl : '';
    videoLinkIn.addEventListener('input', () => {
      const u = videoLinkIn.value.trim();
      if (u && /^https?:\/\//.test(u)) { st.videoUrl = u; renderVideo(); }
      else if (!u && /^https?:\/\//.test(st.videoUrl)) { st.videoUrl = ''; renderVideo(); }
    });
    body.appendChild(efield('영상 링크 (선택)', videoLinkIn));

    /* ----- 스토리 블록(글/이미지) ----- */
    const blocksWrap = W.el('div', { class: 'wz-d-eblocks' });
    function renderBlocks() {
      blocksWrap.replaceChildren();
      st.blocks.forEach((b, i) => {
        const blk = W.el('div', { class: 'wz-d-eblock' });
        const bhead = W.el('div', { class: 'wz-d-eblock__head' });
        const del = W.el('button', { class: 'wz-d-eblock__del', type: 'button' }, '삭제');
        del.addEventListener('click', () => { st.blocks.splice(i, 1); renderBlocks(); });
        bhead.append(W.el('span', { class: 'wz-d-eblock__type' }, b.type === 'image' ? '이미지' : '글'), del);
        blk.appendChild(bhead);
        if (b.type === 'text') {
          const ta = W.el('textarea', { class: 'wz-d-ef__textarea', maxlength: '5000', placeholder: '본문을 입력하세요' });
          ta.value = b.value || '';
          ta.addEventListener('input', () => { b.value = ta.value; });
          blk.appendChild(ta);
        } else {
          blk.appendChild(W.el('img', { class: 'wz-d-eblock__img', src: b.value, alt: '스토리 이미지' }));
        }
        blocksWrap.appendChild(blk);
      });
      if (!st.blocks.length) blocksWrap.appendChild(W.el('p', { class: 'wz-d-ef__help' }, '아직 추가된 블록이 없습니다.'));
    }
    renderBlocks();

    const blockAdd = W.el('div', { class: 'wz-d-eblockadd' });
    const addText = W.el('button', { class: 'wz-btn wz-btn--outline', type: 'button', html: EDIT_IC.plus + '<span>글 추가</span>' });
    addText.addEventListener('click', () => { st.blocks.push({ type: 'text', value: '' }); renderBlocks(); });
    const addImg = W.el('label', { class: 'wz-btn wz-btn--outline', html: EDIT_IC.upload + '<span>이미지 추가</span>' });
    const blockFileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
    blockFileIn.addEventListener('change', () => { readEditImage(blockFileIn.files && blockFileIn.files[0], (d) => { st.blocks.push({ type: 'image', value: d }); renderBlocks(); }); blockFileIn.value = ''; });
    addImg.appendChild(blockFileIn);
    blockAdd.append(addText, addImg);

    const storyField = efield('스토리', blocksWrap, '프로젝트 이야기를 글과 이미지 블록으로 구성하세요.');
    storyField.appendChild(blockAdd);
    body.appendChild(storyField);

    /* ----- 창작자 정보 ----- */
    body.appendChild(W.el('p', { class: 'wz-d-edit__sec' }, '창작자 정보'));

    const ciNameIn = W.el('input', { class: 'wz-d-ef__input', type: 'text', maxlength: '20', placeholder: '창작자 또는 팀 이름' });
    ciNameIn.value = st.ciName;
    body.appendChild(efield('창작자 이름', ciNameIn, '최대 20자.'));

    const ciImageWrap = W.el('div', {});
    function renderCiImage() {
      ciImageWrap.replaceChildren();
      if (st.ciImage) {
        const pv = W.el('div', { class: 'wz-d-epreview wz-d-epreview--avatar' });
        pv.appendChild(W.el('img', { src: st.ciImage, alt: '프로필 이미지 미리보기' }));
        const del = W.el('button', { class: 'wz-d-epreview__del', type: 'button', 'aria-label': '이미지 삭제', html: SVG.close });
        del.addEventListener('click', () => { st.ciImage = ''; renderCiImage(); });
        pv.appendChild(del);
        ciImageWrap.appendChild(pv);
      } else {
        const up = W.el('label', { class: 'wz-d-eupload' });
        up.append(W.el('span', { class: 'wz-d-eupload__ic', html: EDIT_IC.upload }), W.el('span', {}, '프로필 이미지 업로드'), W.el('span', { class: 'wz-d-eupload__hint' }, 'PNG · JPG · WEBP (최대 8MB)'));
        const fileIn = W.el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
        fileIn.addEventListener('change', () => { readEditImage(fileIn.files && fileIn.files[0], (d) => { st.ciImage = d; renderCiImage(); }); fileIn.value = ''; });
        up.appendChild(fileIn);
        ciImageWrap.appendChild(up);
      }
    }
    renderCiImage();
    body.appendChild(efield('프로필 이미지 (선택)', ciImageWrap));

    const ciIntroIn = W.el('textarea', { class: 'wz-d-ef__textarea', maxlength: '300', placeholder: '어떤 창작자(팀)인지 소개해 주세요.' });
    ciIntroIn.value = st.ciIntro;
    body.appendChild(efield('창작자 소개 (선택)', ciIntroIn, '최대 300자.'));

    const region = W.el('div', { class: 'wz-d-eregion' });
    const sidoIn = W.el('input', { class: 'wz-d-ef__input', type: 'text', maxlength: '30', placeholder: '시·도 (예: 서울특별시)' });
    sidoIn.value = st.ciSido;
    const sigunguIn = W.el('input', { class: 'wz-d-ef__input', type: 'text', maxlength: '30', placeholder: '시·군·구 (예: 성북구)' });
    sigunguIn.value = st.ciSigungu;
    region.append(sidoIn, sigunguIn);
    body.appendChild(efield('주 활동 지역 (선택)', region));

    /* ----- 안내 + 저장 ----- */
    body.appendChild(W.el('p', { class: 'wz-d-edit__note' },
      '리워드 · 금액 · 일정은 이 화면에서 수정할 수 없습니다.'));

    const foot = W.el('div', { class: 'wz-d-edit__foot' });
    const cancel = W.el('button', { class: 'wz-btn wz-btn--ghost', type: 'button' }, '취소');
    cancel.addEventListener('click', close);
    const save = W.el('button', { class: 'wz-btn wz-btn--primary', type: 'button' }, '저장');
    save.addEventListener('click', () => {
      const title = titleIn.value.trim();
      if (!title) { toast('제목을 입력해 주세요'); return; }
      if (!catSel.value) { toast('카테고리를 선택해 주세요'); return; }

      // contentBlocks: API 계약 {type,text}|{type,url}로 직렬화(빈 블록 제거)
      const blocks = [];
      st.blocks.forEach((b) => {
        if (b.type === 'text') { const t = String(b.value || '').trim(); if (t) blocks.push({ type: 'text', text: t.slice(0, 5000) }); }
        else if (b.type === 'image' && b.value) blocks.push({ type: 'image', url: b.value });
      });

      // creatorInfo: 유효 값만. 하나도 없으면 null.
      const info = {};
      const cn = ciNameIn.value.trim(); if (cn) info.name = cn.slice(0, 20);
      const cIntro = ciIntroIn.value.trim(); if (cIntro) info.intro = cIntro.slice(0, 300);
      const cSido = sidoIn.value.trim(); if (cSido) info.sido = cSido.slice(0, 30);
      const cSigungu = sigunguIn.value.trim(); if (cSigungu) info.sigungu = cSigungu.slice(0, 30);
      if (st.ciImage) info.image = st.ciImage;

      const video = normalizeEditVideo(st.videoUrl);

      // 화이트리스트 필드만 전송(리워드·금액·일정 등은 절대 포함하지 않음)
      const payload = {
        title: title,
        description: descIn.value.trim(),
        category: catSel.value,
        coverImageUrl: st.coverImage || null,
        videoUrl: video || null,
        contentBlocks: blocks,
        creatorInfo: Object.keys(info).length ? info : null,
      };

      save.disabled = true; cancel.disabled = true;
      const prevText = save.textContent; save.textContent = '저장 중...';
      window.api.patch('/me/funds/' + encodeURIComponent(f.id), payload)
        .then((detail) => {
          close();
          toast('저장되었습니다');
          // 응답이 공개 상세 형태면 그대로 재렌더, 아니면 안전하게 새로고침
          if (detail && detail.id) { _selectedTierId = null; _tierSelected = false; render(detail); window.scrollTo({ top: 0 }); }
          else location.reload();
        })
        .catch((err) => {
          save.disabled = false; cancel.disabled = false; save.textContent = prevText;
          if (err && err.status === 401) { location.href = '/login.html'; return; }
          if (err && err.status === 404) { toast('본인이 개설한 펀드만 수정할 수 있어요'); return; }
          toast((err && err.message) ? err.message : '저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
        });
    });
    foot.append(cancel, save);

    box.append(head, body, foot);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  /* ===================================================================
   * 진입
   * =================================================================== */
  async function run() {
    if (!root || !W) return;
    const id = getId();
    if (!id) { showState('프로젝트를 찾을 수 없어요', '잘못된 접근이에요. 목록에서 다시 선택해 주세요.'); return; }

    root.replaceChildren(W.el('div', { class: 'wz-d-state' }, W.el('p', {}, '불러오는 중...')));
    let f;
    try {
      f = await window.api.get('/groupbuys/' + encodeURIComponent(id), { silentAuthFail: true });
    } catch (e) {
      // 관리자 삭제/없음(404 또는 GROUPBUY_NOT_FOUND) → 삭제 안내. 그 외 로드 실패도 안내로 처리(빈/깨진 페이지 방지).
      if (e && (e.status === 404 || e.code === 'GROUPBUY_NOT_FOUND')) { showDeleted(); return; }
      showDeleted(); return;
    }
    // 응답이 비었거나 id 가 없으면(삭제/이상 응답) 펀드 렌더 없이 안내만.
    if (!f || !f.id) { showDeleted(); return; }
    // 로그인 사용자 조회(실패/비로그인 시 null) → 작성자 본인 여부 판단
    _me = await W.fetchMe();
    // 로그인 상태면 이 펀드에 이미 활성 참여(예약/결제 등)가 있는지 미리 조회(1인 1펀딩). 실패/비로그인은 무시.
    _myActiveOrder = await fetchMyActiveOrder(f.id);
    render(f);
  }

  /* ---------- 1인 1펀딩: 이 펀드에 대한 내 활성 주문 조회 ----------
   * GET /api/me/orders 에서 fundId 일치 && status 가 종료(cancelled/refunded)가 아닌 주문을 찾는다.
   * 비로그인/오류는 조용히 무시(null) — 후원 흐름은 막지 않고 서버 게이트(409)가 최종 판정.
   * 반환: { id, rewardTitle, status, rewardTierId? } 또는 null. */
  const ENDED_ORDER_STATUSES = ['cancelled', 'canceled', 'refunded'];
  async function fetchMyActiveOrder(fundId) {
    if (!_me || !_me.userId) return null;
    let items;
    try {
      const r = await window.api.get('/me/orders', { silentAuthFail: true });
      items = Array.isArray(r) ? r : (r && r.items) || [];
    } catch (_) { return null; } // 비로그인/오류는 무시
    if (!Array.isArray(items)) return null;
    const fid = String(fundId);
    const active = items.find((o) => o && String(o.fundId) === fid
      && ENDED_ORDER_STATUSES.indexOf(String(o.status || '').toLowerCase()) === -1);
    return active || null;
  }

  /* 현재 로그인 사용자(없으면 null). 본인 소유(작성자) 여부 판단에 사용. */
  let _me = null;
  /* 이 펀드에 대한 내 활성 주문(있으면 중복 펀딩 차단 + 변경/취소 안내). 없으면 null. */
  let _myActiveOrder = null;
  function isOwner(f) {
    return !!(_me && _me.userId && f && f.creatorId && _me.userId === f.creatorId);
  }
  /* 현재 로그인 사용자가 관리자(ADMIN)인지. 게시글 삭제 등 운영 기능 노출 판단. */
  function isAdmin() {
    return !!(_me && String(_me.role || '').toUpperCase() === 'ADMIN');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
