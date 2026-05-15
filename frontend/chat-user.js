/**
 * 유저용 1:1 문의 페이지
 *  1) GET /api/chat/me/room        — 방 + 과거 메시지 로드
 *  2) socket connect (/chat)        — 실시간 메시지 구독
 *
 * UI:
 *  - 본인 메시지: 우측, 노란 말풍선
 *  - 관리자 메시지: 좌측, 흰 말풍선 + 아바타
 */

let _socket = null;
let _roomId = null;
let _currentUser = null;

function formatTime(iso) {
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? '오후' : '오전';
  h = h % 12 || 12;
  return ampm + ' ' + h + ':' + m;
}

function formatDay(iso) {
  const d = new Date(iso);
  return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.';
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear()
      && da.getMonth() === db.getMonth()
      && da.getDate() === db.getDate();
}

let _lastDay = null;

function appendDayDividerIfNeeded(container, msgIso) {
  if (!isSameDay(_lastDay, msgIso)) {
    const div = document.createElement('div');
    div.className = 'day-divider';
    div.textContent = formatDay(msgIso);
    container.appendChild(div);
    _lastDay = msgIso;
  }
}

function appendMessage(msg) {
  const container = document.getElementById('chatMessages');

  appendDayDividerIfNeeded(container, msg.createdAt);

  const row = document.createElement('div');
  const isMe = _currentUser && msg.senderId === _currentUser.userId;
  row.className = 'msg-row ' + (isMe ? 'me' : 'admin');

  if (!isMe) {
    const av = document.createElement('div');
    av.className = 'admin-avatar';
    av.textContent = '관리';
    row.appendChild(av);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = msg.message;
  row.appendChild(bubble);

  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = formatTime(msg.createdAt);
  row.appendChild(time);

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function setStatus(text, online) {
  const el = document.getElementById('connStatus');
  el.textContent = text;
  el.classList.toggle('online', !!online);
}

function setInputEnabled(enabled) {
  document.getElementById('chatInput').disabled = !enabled;
  document.getElementById('btnSend').disabled = !enabled;
}

async function loadHistory() {
  const container = document.getElementById('chatMessages');
  container.textContent = '';
  _lastDay = null;

  try {
    const res = await fetch('/api/chat/me/room', { credentials: 'include' });
    if (res.status === 401) {
      location.href = '/';
      return;
    }
    if (!res.ok) throw new Error('대화 내역 로드 실패');
    const data = await res.json();

    _roomId = data.room.id;
    if (!data.messages || data.messages.length === 0) {
      const sys = document.createElement('div');
      sys.className = 'system-msg';
      sys.textContent = '안녕하세요! 두띵 고객센터입니다. 무엇을 도와드릴까요?';
      container.appendChild(sys);
    } else {
      data.messages.forEach((m) => appendMessage(m));
    }
  } catch (err) {
    container.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.style.color = '#ef4444';
    div.textContent = '대화 내역을 불러오지 못했습니다: ' + err.message;
    container.appendChild(div);
  }
}

function connectSocket() {
  // socket.io는 자동으로 cookie를 첨부함
  _socket = io('/chat', {
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });

  _socket.on('connect', () => {
    setStatus('연결됨', true);
    setInputEnabled(true);
    _socket.emit('join_user_room');
  });

  _socket.on('disconnect', () => {
    setStatus('연결 끊김');
    setInputEnabled(false);
  });

  _socket.on('connect_error', (err) => {
    console.error('socket connect_error:', err.message);
    setStatus('연결 실패');
    setInputEnabled(false);
  });

  _socket.on('joined', (data) => {
    _roomId = data.roomId;
  });

  _socket.on('message', (data) => {
    if (!data || !data.message) return;
    // 같은 방의 메시지만 처리
    if (data.message.roomId !== _roomId) return;
    appendMessage(data.message);
    // 관리자 메시지를 받았다면 읽음 처리
    if (_currentUser && data.message.senderId !== _currentUser.userId) {
      _socket.emit('mark_read', { roomId: _roomId });
    }
  });

  _socket.on('error', (data) => {
    alert(data.message || '오류가 발생했습니다');
  });
}

function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !_socket || !_roomId) return;

  _socket.emit('send_message', { roomId: _roomId, message: text });
  input.value = '';
  input.focus();
}

async function init() {
  _currentUser = await getCurrentUserOptional();
  if (!_currentUser) {
    location.href = '/';
    return;
  }

  await loadHistory();
  connectSocket();

  document.getElementById('btnSend').addEventListener('click', sendMessage);
  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
