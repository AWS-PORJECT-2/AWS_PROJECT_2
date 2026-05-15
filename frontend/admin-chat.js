/**
 * 관리자 1:1 상담 페이지
 *
 * 동작:
 *  1) GET /api/chat/admin/rooms — 모든 방 로드
 *  2) socket connect (/chat) — 실시간 room_updated/message 수신
 *  3) 방 클릭 시 GET /api/chat/admin/rooms/:id/messages → 우측 패널 렌더
 *  4) 메시지 송신 시 socket.emit('send_message')
 *
 * 실시간 정렬: 새 메시지 도착 시 해당 방을 맨 위로 이동.
 */

let _socket = null;
let _currentUser = null;
let _rooms = [];
let _activeRoomId = null;
let _messagesByRoom = {}; // { roomId: [msg, ...] }

function escapeHTML(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setStatus(text, online) {
  const el = document.getElementById('connStatus');
  el.textContent = text;
  el.classList.toggle('online', !!online);
}

function formatTime(iso) {
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? '오후' : '오전';
  h = h % 12 || 12;
  return ampm + ' ' + h + ':' + m;
}

function formatRoomTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return formatTime(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return m + '/' + day;
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear()
      && da.getMonth() === db.getMonth()
      && da.getDate() === db.getDate();
}

function formatDay(iso) {
  const d = new Date(iso);
  return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.';
}

/* ===== 방 목록 렌더링 ===== */
function renderRoomList() {
  const items = document.getElementById('roomItems');
  items.textContent = '';
  document.getElementById('roomCount').textContent = String(_rooms.length);

  if (_rooms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'room-empty';
    empty.textContent = '아직 문의한 사용자가 없습니다.';
    items.appendChild(empty);
    return;
  }

  _rooms.forEach((room) => {
    const div = document.createElement('div');
    div.className = 'room-item' + (_activeRoomId === room.id ? ' active' : '');
    div.addEventListener('click', () => selectRoom(room.id));

    // 아바타 (이름 첫 글자)
    const avatar = document.createElement('div');
    avatar.className = 'room-avatar';
    const initial = (room.userName || 'U').charAt(0);
    avatar.textContent = initial;

    const info = document.createElement('div');
    info.className = 'room-info';

    const nameRow = document.createElement('div');
    nameRow.className = 'room-name-row';
    const name = document.createElement('span');
    name.className = 'room-name';
    name.textContent = room.userName || '(이름 없음)';
    const time = document.createElement('span');
    time.className = 'room-time';
    time.textContent = formatRoomTime(room.lastMessageAt || room.updatedAt);
    nameRow.appendChild(name);
    nameRow.appendChild(time);

    const lastRow = document.createElement('div');
    lastRow.className = 'room-last-row';
    const last = document.createElement('span');
    last.className = 'room-last';
    last.textContent = room.lastMessage || '(아직 메시지 없음)';
    lastRow.appendChild(last);

    if (room.unreadAdminCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'unread-badge';
      badge.textContent = String(room.unreadAdminCount);
      lastRow.appendChild(badge);
    }

    info.appendChild(nameRow);
    info.appendChild(lastRow);

    div.appendChild(avatar);
    div.appendChild(info);
    items.appendChild(div);
  });
}

/* ===== 채팅창 렌더링 ===== */
function renderChatBody(room, messages) {
  const head = document.getElementById('chatHead');
  head.textContent = (room.userName || '(이름 없음)') + ' 님과의 대화';

  // body 영역 갱신
  const oldBody = document.getElementById('chatBody');
  const newBody = document.createElement('div');
  newBody.id = 'chatBody';
  newBody.className = 'chat-pane-messages';

  let lastDay = null;
  messages.forEach((m) => {
    if (!isSameDay(lastDay, m.createdAt)) {
      const div = document.createElement('div');
      div.className = 'day-divider';
      div.textContent = formatDay(m.createdAt);
      newBody.appendChild(div);
      lastDay = m.createdAt;
    }
    appendMessageElement(newBody, m);
  });

  oldBody.replaceWith(newBody);

  // 입력창 추가
  let input = document.querySelector('.chat-pane-input');
  if (!input) {
    input = document.createElement('div');
    input.className = 'chat-pane-input';
    const txt = document.createElement('input');
    txt.type = 'text';
    txt.id = 'msgInput';
    txt.placeholder = '메시지를 입력하세요...';
    txt.maxLength = 2000;
    txt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    const btn = document.createElement('button');
    btn.id = 'btnSend';
    btn.textContent = '전송';
    btn.addEventListener('click', sendMessage);
    input.appendChild(txt);
    input.appendChild(btn);
    document.querySelector('.chat-pane').appendChild(input);
  } else {
    document.getElementById('msgInput').value = '';
  }

  // 스크롤 맨 아래로
  newBody.scrollTop = newBody.scrollHeight;
  setTimeout(() => document.getElementById('msgInput')?.focus(), 0);
}

function appendMessageElement(container, msg) {
  const isMe = _currentUser && msg.senderId === _currentUser.userId;
  const row = document.createElement('div');
  row.className = 'msg-row ' + (isMe ? 'me' : 'user');

  if (!isMe) {
    const av = document.createElement('div');
    av.className = 'user-avatar';
    av.textContent = 'U';
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
}

/* ===== 방 선택 ===== */
async function selectRoom(roomId) {
  _activeRoomId = roomId;
  document.getElementById('layout').classList.add('has-active');
  renderRoomList();

  try {
    const res = await fetch('/api/chat/admin/rooms/' + roomId + '/messages', { credentials: 'include' });
    if (!res.ok) throw new Error('메시지 로드 실패');
    const data = await res.json();
    _messagesByRoom[roomId] = data.messages;
    renderChatBody(data.room, data.messages);

    // 소켓에서 방 join + 읽음 처리
    if (_socket) {
      _socket.emit('join_admin_room', { roomId });
    }

    // 방 목록의 unread 카운트 클리어
    _rooms = _rooms.map((r) => r.id === roomId ? { ...r, unreadAdminCount: 0 } : r);
    renderRoomList();
  } catch (err) {
    alert('대화를 불러오지 못했습니다: ' + err.message);
  }
}

/* ===== 메시지 전송 ===== */
function sendMessage() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text || !_socket || !_activeRoomId) return;

  _socket.emit('send_message', { roomId: _activeRoomId, message: text });
  input.value = '';
  input.focus();
}

/* ===== 초기 데이터 로드 ===== */
async function loadRooms() {
  try {
    const res = await fetch('/api/chat/admin/rooms', { credentials: 'include' });
    if (res.status === 403) {
      document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;font-size:16px;">관리자 권한이 필요합니다.</div>';
      return;
    }
    if (!res.ok) throw new Error('방 목록 로드 실패');
    const data = await res.json();
    _rooms = data.rooms;
    renderRoomList();
  } catch (err) {
    const items = document.getElementById('roomItems');
    items.innerHTML = '<div class="room-empty" style="color:#ef4444;">' + escapeHTML(err.message) + '</div>';
  }
}

/* ===== 소켓 연결 ===== */
function connectSocket() {
  _socket = io('/chat', { withCredentials: true, transports: ['websocket', 'polling'] });

  _socket.on('connect', () => setStatus('연결됨', true));
  _socket.on('disconnect', () => setStatus('연결 끊김'));
  _socket.on('connect_error', () => setStatus('연결 실패'));

  _socket.on('message', (data) => {
    if (!data || !data.message) return;
    const msg = data.message;
    // 활성 방의 메시지면 즉시 추가
    if (_activeRoomId === msg.roomId) {
      const body = document.getElementById('chatBody');
      if (body && body.classList.contains('chat-pane-messages')) {
        appendMessageElement(body, msg);
        body.scrollTop = body.scrollHeight;
      }
    }
    // 캐시 업데이트
    if (_messagesByRoom[msg.roomId]) {
      _messagesByRoom[msg.roomId].push(msg);
    }
  });

  _socket.on('room_updated', (data) => {
    if (!data || !data.room) return;
    const updated = data.room;
    // 기존 방 갱신 또는 신규 추가
    const idx = _rooms.findIndex((r) => r.id === updated.id);
    if (idx >= 0) {
      _rooms[idx] = updated;
    } else {
      _rooms.push(updated);
    }
    // 최근 메시지 시간 기준으로 정렬 (NULL은 뒤로)
    _rooms.sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tb - ta;
    });
    renderRoomList();
  });

  _socket.on('error', (data) => {
    console.error('socket error:', data);
  });
}

async function init() {
  _currentUser = await getCurrentUserOptional();
  if (!_currentUser) {
    location.href = '/';
    return;
  }
  if (_currentUser.role !== 'ADMIN') {
    document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;font-size:16px;">관리자만 접근할 수 있습니다.</div>';
    return;
  }

  await loadRooms();
  connectSocket();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
