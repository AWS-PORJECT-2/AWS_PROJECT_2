/**
 * 채팅 시스템 통합 테스트.
 * - REST API: 방 생성/조회 + 메시지 조회
 * - Socket.io: 메시지 송수신 + 실시간 broadcast
 */

import { io as ioClient } from 'socket.io-client';

const BASE = 'http://localhost:3000';
let userCookie = '';
let adminCookie = '';

async function call(path: string, options: RequestInit = {}, cookie = '') {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (cookie) headers['Cookie'] = cookie;
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(BASE + path, { ...options, headers });
  const setCookie = res.headers.get('set-cookie');
  const newCookie = setCookie ? setCookie.split(';')[0] : cookie;
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch (_) { /* keep */ }
  return { status: res.status, body, cookie: newCookie };
}

async function main() {
  // 로그인
  console.log('1) 로그인');
  const userLogin = await call('/api/dev-auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'test_user' }),
  });
  userCookie = userLogin.cookie;
  console.log('  USER:', userLogin.status);

  const adminLogin = await call('/api/dev-auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin' }),
  });
  adminCookie = adminLogin.cookie;
  console.log('  ADMIN:', adminLogin.status);

  // 유저 방 조회
  console.log('\n2) 유저 방 조회 (자동 생성)');
  const room = await call('/api/chat/me/room', { method: 'GET' }, userCookie);
  console.log('  →', room.status, 'room:', (room.body as { room: { id: number } }).room.id);
  const roomId = (room.body as { room: { id: number } }).room.id;

  // 관리자 방 목록
  console.log('\n3) 관리자 방 목록');
  const rooms = await call('/api/chat/admin/rooms', { method: 'GET' }, adminCookie);
  console.log('  →', rooms.status, 'count:', (rooms.body as { rooms: unknown[] }).rooms.length);

  // Socket.io 테스트
  console.log('\n4) Socket.io 테스트 — 유저↔관리자 메시지 송수신');

  const userSocket = ioClient(BASE + '/chat', {
    extraHeaders: { Cookie: userCookie },
    transports: ['websocket'],
  });
  const adminSocket = ioClient(BASE + '/chat', {
    extraHeaders: { Cookie: adminCookie },
    transports: ['websocket'],
  });

  await new Promise<void>((resolve, reject) => {
    let userReady = false, adminReady = false;
    userSocket.on('connect', () => { userReady = true; if (adminReady) resolve(); });
    adminSocket.on('connect', () => { adminReady = true; if (userReady) resolve(); });
    setTimeout(() => reject(new Error('socket timeout')), 5000);
  });
  console.log('  ✓ 두 소켓 연결됨');

  userSocket.emit('join_user_room');
  adminSocket.emit('join_admin_room', { roomId });

  await new Promise((r) => setTimeout(r, 500));

  // 유저 → 관리자
  const adminReceived = new Promise<{ message: { message: string } }>((resolve) => {
    adminSocket.once('message', (data) => resolve(data as { message: { message: string } }));
  });
  userSocket.emit('send_message', { roomId, message: '안녕하세요, 문의드립니다.' });
  const got1 = await adminReceived;
  console.log('  ✓ USER→ADMIN:', got1.message.message);

  // 관리자 → 유저
  const userReceived = new Promise<{ message: { message: string } }>((resolve) => {
    userSocket.once('message', (data) => resolve(data as { message: { message: string } }));
  });
  adminSocket.emit('send_message', { roomId, message: '안녕하세요, 두띵입니다. 어떤 도움이 필요하신가요?' });
  const got2 = await userReceived;
  console.log('  ✓ ADMIN→USER:', got2.message.message);

  // 메시지 조회
  console.log('\n5) 메시지 조회 (관리자)');
  const msgs = await call('/api/chat/admin/rooms/' + roomId + '/messages', { method: 'GET' }, adminCookie);
  const messages = (msgs.body as { messages: unknown[] }).messages;
  console.log('  →', msgs.status, 'count:', messages.length);

  userSocket.disconnect();
  adminSocket.disconnect();

  console.log('\n✅ 채팅 시스템 정상 작동');
  process.exit(0);
}

main().catch((err) => { console.error('❌', err); process.exit(1); });
