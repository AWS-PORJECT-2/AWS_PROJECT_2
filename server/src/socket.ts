import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import type { TokenService } from './interfaces/token-service.js';
import type { UserRepository } from './repositories/user-repository.js';
import type { ChatRepository } from './repositories/chat-repository.js';
import type { NotificationRepository } from './repositories/notification-repository.js';
import { notify } from './services/notify.js';
import { accessBlock, isSuspensionExpired } from './utils/account-status.js';
import { logger } from './logger.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

/** handshake 쿠키 헤더에서 특정 쿠키 값을 파싱(httpOnly accessToken 은 JS 로 못 읽으므로 소켓 인증은 쿠키로 받는다). */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try { return decodeURIComponent(part.slice(idx + 1).trim()); } catch { return part.slice(idx + 1).trim(); }
    }
  }
  return undefined;
}

/**
 * Socket.io 서버 초기화.
 * 1:1 상담 실시간 메시징 전용.
 *
 * 인증: 클라이언트가 handshake 시 auth.token (accessToken) 을 전달.
 * 방 구조: 유저는 자기 room 에만 join, 관리자는 모든 room 에 join 가능.
 */
export function initSocketIO(
  httpServer: HttpServer,
  tokenService: TokenService,
  userRepo: UserRepository,
  chatRepo: ChatRepository,
  notificationRepo?: NotificationRepository,
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: FRONTEND_URL,
      credentials: true,
    },
    path: '/socket.io',
  });

  // 인증 미들웨어
  io.use(async (socket, next) => {
    try {
      // 토큰 우선순위: handshake.auth.token(있으면) → accessToken 쿠키(httpOnly, withCredentials 로 전달).
      const token = (socket.handshake.auth?.token as string | undefined)
        || readCookie(socket.handshake.headers.cookie, 'accessToken');
      if (!token) {
        next(new Error('인증 토큰이 필요합니다'));
        return;
      }
      const payload = tokenService.verifyAccessToken(token);
      if (!payload) {
        next(new Error('유효하지 않은 토큰입니다'));
        return;
      }
      const user = await userRepo.findById(payload.userId);
      if (!user) {
        next(new Error('사용자를 찾을 수 없습니다'));
        return;
      }
      // 제재 게이트 — HTTP authRequired/로그인과 동일 규칙. 정지·차단·탈퇴 계정은 소켓 연결 거부.
      const block = accessBlock(user);
      if (block) { next(new Error('계정이 제재되었습니다')); return; }
      if (isSuspensionExpired(user)) { void userRepo.clearExpiredSuspension(user.id); }
      // socket.data 에 사용자 정보 저장
      socket.data.userId = user.id;
      socket.data.userRole = user.role;
      socket.data.userName = user.name;
      next();
    } catch (err) {
      logger.error({ err }, 'Socket.io 인증 실패');
      next(new Error('인증 처리 중 오류가 발생했습니다'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, userRole, userName } = socket.data;
    logger.info({ userId, userRole }, 'Socket.io 연결');

    // 유저: 자기 방에 자동 join
    if (userRole === 'USER') {
      chatRepo.findOrCreateRoom(userId).then((room) => {
        socket.join(`room:${room.id}`);
        socket.data.roomId = room.id;
      }).catch((err) => {
        logger.error({ err, userId }, '채팅방 자동 join 실패');
      });
    }

    // 관리자: 특정 방에 join
    socket.on('admin:join', async (roomId: string) => {
      if (userRole !== 'ADMIN') {
        socket.emit('error', { message: '관리자 권한이 필요합니다' });
        return;
      }
      const room = await chatRepo.findRoomById(roomId);
      if (!room) {
        socket.emit('error', { message: '채팅방을 찾을 수 없습니다' });
        return;
      }
      socket.join(`room:${roomId}`);
      socket.data.roomId = roomId;
      logger.info({ userId, roomId }, '관리자 채팅방 입장');
    });

    // 메시지 전송
    socket.on('message:send', async (data: { message?: string; roomId?: string }) => {
      try {
        const message = data.message?.trim();
        if (!message || message.length > 2000) {
          socket.emit('error', { message: '메시지는 1~2000자여야 합니다' });
          return;
        }

        let targetRoomId: string;

        if (userRole === 'ADMIN') {
          // 관리자는 roomId 를 명시해야 함
          if (!data.roomId) {
            socket.emit('error', { message: 'roomId가 필요합니다' });
            return;
          }
          // 방 존재 확인 — admin:join 과 동일 규칙. 없는 방에 메시지 생성 방지.
          const room = await chatRepo.findRoomById(data.roomId);
          if (!room) {
            socket.emit('error', { message: '채팅방을 찾을 수 없습니다' });
            return;
          }
          targetRoomId = data.roomId;
        } else {
          // 유저는 자기 방
          const room = await chatRepo.findOrCreateRoom(userId);
          targetRoomId = room.id;
        }

        const senderRole = userRole === 'ADMIN' ? 'ADMIN' : 'USER';
        const chatMessage = await chatRepo.createMessage(targetRoomId, userId, senderRole, message);

        // 방에 있는 모든 소켓에 브로드캐스트 — HTTP 전송 경로(chat.ts)와 동일한 { roomId, message } 형태로 통일.
        io.to(`room:${targetRoomId}`).emit('message:new', {
          roomId: targetRoomId,
          message: chatMessage,
          senderName: userName,
        });

        // 문의 답변 알림(best-effort) — 관리자가 보낸 메시지면 방 주인(사용자)에게.
        //   notify()는 throw 하지 않지만, room 조회 실패가 메시지 흐름을 막지 않도록 try/catch 로 감싼다.
        if (notificationRepo && senderRole === 'ADMIN') {
          try {
            const room = await chatRepo.findRoomById(targetRoomId);
            if (room?.userId && room.userId !== userId) {
              const preview = message.length > 60 ? `${message.slice(0, 60)}…` : message;
              await notify(notificationRepo, {
                userId: room.userId,
                type: 'inquiry_reply',
                title: '문의에 답변이 도착했어요',
                body: preview,
                fundId: null,
              });
            }
          } catch (err) {
            logger.warn({ err, roomId: targetRoomId }, '문의 답변 알림 생성 실패(무시)');
          }
        }
      } catch (err) {
        logger.error({ err, userId }, 'Socket.io 메시지 전송 실패');
        socket.emit('error', { message: '메시지 전송에 실패했습니다' });
      }
    });

    // 읽음 처리
    socket.on('message:read', async (data: { roomId?: string }) => {
      try {
        // IDOR 방지 — 유저는 클라가 보낸 roomId 를 신뢰하지 않고 본인 방(서버가 join 시 설정)만. 관리자만 임의 방 지정 가능.
        const roomId = userRole === 'ADMIN' ? (data.roomId ?? socket.data.roomId) : socket.data.roomId;
        if (!roomId) return;

        const readerRole = userRole === 'ADMIN' ? 'ADMIN' : 'USER';
        await chatRepo.markAsRead(roomId, readerRole);

        // 상대방에게 읽음 알림
        io.to(`room:${roomId}`).emit('message:read', { roomId, readerRole });
      } catch (err) {
        logger.error({ err, userId }, 'Socket.io 읽음 처리 실패');
      }
    });

    // 타이핑 표시 — read 와 동일 원칙(유저는 본인 방만, 관리자만 임의 방).
    socket.on('typing:start', (data: { roomId?: string }) => {
      const roomId = userRole === 'ADMIN' ? (data.roomId ?? socket.data.roomId) : socket.data.roomId;
      if (!roomId) return;
      socket.to(`room:${roomId}`).emit('typing:start', { userId, userName, userRole });
    });

    socket.on('typing:stop', (data: { roomId?: string }) => {
      const roomId = userRole === 'ADMIN' ? (data.roomId ?? socket.data.roomId) : socket.data.roomId;
      if (!roomId) return;
      socket.to(`room:${roomId}`).emit('typing:stop', { userId });
    });

    socket.on('disconnect', () => {
      logger.info({ userId, userRole }, 'Socket.io 연결 해제');
    });
  });

  return io;
}
