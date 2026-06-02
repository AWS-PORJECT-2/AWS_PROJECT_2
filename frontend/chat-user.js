/**
 * 유저용 1:1 문의 (wz). 소켓 핸드셰이크에는 access token 이 필요한데 httpOnly 쿠키라
 * JS 가 토큰을 못 읽는 환경이 많다 → 소켓에만 의존하면 영원히 "연결 중"에 머문다.
 * 그래서 REST 를 1차 경로로 쓴다(admin.js 문의 채팅 탭과 동일한 전략).
 *
 *   1) GET  /api/chat/me/room          — 방 조회/생성(room 객체) → roomId
 *   2) GET  /api/chat/me/messages      — 과거 메시지(배열)
 *   3) POST /api/chat/me/messages      — 메시지 전송(REST). 소켓 연결돼 있으면 소켓 우선.
 *   4) 5초 폴링으로 관리자 답장 수신.
 *   5) window.__ACCESS_TOKEN 이 있을 때만 소켓 opportunistic — 실패해도 표시 안 함.
 *
 * 상태 배지는 REST 로드가 끝나면 즉시 "연결됨"(초록). 어떤 경우에도 영구 "연결 중" 없음.
 *
 * 본인 메시지 판별은 senderRole==='USER'(서버 enum). XSS: textContent 만 사용.
 */
(function () {
  var WZ = window.WZ || {};

  var POLL_MS = 5000;

  var state = {
    roomId: null,
    socket: null,
    pollTimer: null,
    lastCount: 0,   // 렌더된 메시지 수(폴링 시 변화 감지)
    lastDay: null,  // 날짜 구분선용
  };

  function $(id) { return document.getElementById(id); }

  function formatTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours();
    var m = String(d.getMinutes()).padStart(2, '0');
    var ampm = h >= 12 ? '오후' : '오전';
    h = h % 12 || 12;
    return ampm + ' ' + h + ':' + m;
  }

  function formatDay(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.';
  }

  function isSameDay(a, b) {
    if (!a || !b) return false;
    var da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear()
        && da.getMonth() === db.getMonth()
        && da.getDate() === db.getDate();
  }

  function isMine(msg) {
    return String(msg && msg.senderRole || '').toUpperCase() === 'USER';
  }

  function setStatus(text, online) {
    var badge = $('supStatus');
    var label = $('supStatusText');
    if (label) label.textContent = text;
    if (badge) badge.classList.toggle('is-online', !!online);
  }

  function setInputEnabled(enabled) {
    var input = $('supInput');
    var send = $('supSend');
    if (input) input.disabled = !enabled;
    if (send) send.disabled = !enabled;
  }

  /* 메시지 1건 DOM (textContent 만 — XSS 안전) */
  function messageRow(msg) {
    var mine = isMine(msg);
    var row = document.createElement('div');
    row.className = 'sup-row ' + (mine ? 'me' : 'them');

    if (!mine) {
      var av = document.createElement('div');
      av.className = 'sup-av';
      av.textContent = '두띵';
      row.appendChild(av);
    }

    var bubble = document.createElement('div');
    bubble.className = 'sup-bubble';
    bubble.textContent = msg.message || '';
    row.appendChild(bubble);

    var time = document.createElement('span');
    time.className = 'sup-time';
    time.textContent = formatTime(msg.createdAt);
    row.appendChild(time);

    return row;
  }

  /* 전체 메시지 렌더(날짜 구분선 포함). 비어 있으면 안내 시스템 메시지. */
  function renderMessages(messages) {
    var container = $('supMsgs');
    if (!container) return;

    // 스크롤이 거의 바닥일 때만 자동 하단 이동(읽는 중 방해 방지)
    var nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;

    container.textContent = '';
    state.lastDay = null;

    if (!messages.length) {
      var sys = document.createElement('div');
      sys.className = 'sup-sys';
      sys.textContent = '안녕하세요! 두띵 고객센터입니다. 무엇을 도와드릴까요? 문의를 남겨주시면 순차적으로 답변드립니다.';
      container.appendChild(sys);
      state.lastCount = 0;
      return;
    }

    messages.forEach(function (msg) {
      if (!isSameDay(state.lastDay, msg.createdAt)) {
        var day = document.createElement('div');
        day.className = 'sup-day';
        day.textContent = formatDay(msg.createdAt);
        container.appendChild(day);
        state.lastDay = msg.createdAt;
      }
      container.appendChild(messageRow(msg));
    });

    state.lastCount = messages.length;
    if (nearBottom) container.scrollTop = container.scrollHeight;
  }

  function showError(text) {
    var container = $('supMsgs');
    if (!container) return;
    container.textContent = '';
    var div = document.createElement('div');
    div.className = 'sup-sys sup-sys--error';
    div.textContent = text;
    container.appendChild(div);
  }

  /* 메시지 목록을 가져와 렌더. silent=true 면 폴링(에러 무시·로딩표시 없음). */
  async function loadMessages(silent) {
    try {
      var body = await window.api.get('/chat/me/messages?limit=200', { silentAuthFail: !!silent });
      var messages = Array.isArray(body) ? body : ((body && (body.messages || body.items)) || []);
      // 폴링 시 변화 없으면 다시 그리지 않음(스크롤·입력 보존)
      if (silent && messages.length === state.lastCount) return;
      renderMessages(messages);
    } catch (err) {
      if (!silent) showError('대화 내역을 불러오지 못했습니다: ' + ((err && err.message) || '알 수 없는 오류'));
      // 폴링 실패는 조용히 무시(다음 주기에 재시도)
    }
  }

  /* 초기 로드: 방 조회/생성 → 메시지 로드 → 즉시 "연결됨". */
  async function loadInitial() {
    try {
      var room = await window.api.get('/chat/me/room');
      state.roomId = (room && (room.id || room.roomId)) || null;
    } catch (err) {
      // 방 조회 실패해도 메시지 엔드포인트는 빈 배열을 주므로 진행 가능
      if (err && err.status === 401) { location.href = '/login.html'; return false; }
    }
    await loadMessages(false);
    return true;
  }

  /* 전송: 소켓 가능하면 소켓, 아니면 REST. 전송 후 즉시 목록 갱신. */
  async function sendMessage() {
    var input = $('supInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    input.value = '';

    // 전송은 항상 REST(동기 저장 + 서버가 message:new 브로드캐스트). 소켓 emit 은 비동기라 저장 전에
    //  아래 loadMessages 가 먼저 돌아 방금 보낸 메시지가 안 보이는 경쟁이 있어 사용하지 않는다.
    //  소켓은 수신(관리자 답변·실시간) 전용. → POST 가 확정 저장 후 loadMessages 가 즉시 표시.
    setInputEnabled(false);
    var ok = false;
    try {
      await window.api.post('/chat/me/messages', { message: text });
      ok = true;
    } catch (err) {
      input.value = text; // 실패 시 입력 복원
      showErrorToast((err && err.message) || '메시지를 보내지 못했습니다.');
    } finally {
      setInputEnabled(true);
    }

    if (ok) await loadMessages(true);
    input.focus();
  }

  /* 가벼운 인라인 알림(이모지 없음) — 전송 실패 안내 */
  function showErrorToast(text) {
    var container = $('supMsgs');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'sup-sys sup-sys--error';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  /* opportunistic 소켓: 실시간 수신용. 실패해도 폴링이 받쳐주므로 에러 표시 안 함.
     인증은 httpOnly accessToken 쿠키로(withCredentials) — JS 로 토큰을 못 읽으므로. 서버가 연결 시 본인 방에 자동 join. */
  function tryConnectSocket() {
    if (typeof window.io !== 'function') return;
    try {
      var socket = window.io({ withCredentials: true, transports: ['websocket', 'polling'] });

      // 같은 방(=내 방)에 새 메시지가 오면 즉시 목록 갱신 + 읽음 처리(상대 메시지일 때).
      socket.on('message:new', function (data) {
        var rid = data && data.roomId;
        if (state.roomId && rid && rid !== state.roomId) return;
        var msg = data && data.message;
        loadMessages(true);
        if (msg && !isMine(msg)) { try { socket.emit('message:read', {}); } catch (_) {} }
      });
      socket.on('connect_error', function () { /* 폴링으로 충분 — 표시 안 함 */ });

      state.socket = socket;
    } catch (_) { state.socket = null; }
  }

  function bindInput() {
    var send = $('supSend');
    var input = $('supInput');
    if (send) send.addEventListener('click', sendMessage);
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.isComposing || e.keyCode === 229) return; // 한글 IME 조합 중 Enter 무시(끝글자 중복 전송 방지)
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      });
    }
  }

  async function init() {
    // 로그인 필요 — 비로그인 시 로그인 페이지로
    var me = (typeof WZ.fetchMe === 'function') ? await WZ.fetchMe() : null;
    if (!me) { location.href = '/login.html'; return; }

    var ok = await loadInitial();
    if (ok === false) return;

    // REST 로드 완료 → 즉시 사용 가능 상태
    setStatus('연결됨', true);
    setInputEnabled(true);
    bindInput();

    // opportunistic 소켓(있으면 실시간), 폴링은 항상 백업
    tryConnectSocket();
    state.pollTimer = setInterval(function () { loadMessages(true); }, POLL_MS);
    window.addEventListener('beforeunload', function () {
      if (state.pollTimer) clearInterval(state.pollTimer);
      if (state.socket) { try { state.socket.disconnect(); } catch (_) {} }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
