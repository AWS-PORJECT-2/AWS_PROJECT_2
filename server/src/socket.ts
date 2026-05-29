import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import type { TokenService } from './interfaces/token-service.js';
import type { UserRepository } from './repositories/user-repository.js';
import type { ChatRepository } from './repositories/chat-repository.js';
import { logger } from './logger.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

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
      const token = socket.handshake.auth?.token as string | undefined;
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
          targetRoomId = data.roomId;
        } else {
          // 유저는 자기 방
          const room = await chatRepo.findOrCreateRoom(userId);
          targetRoomId = room.id;
        }

        const senderRole = userRole === 'ADMIN' ? 'ADMIN' : 'USER';
        const chatMessage = await chatRepo.createMessage(targetRoomId, userId, senderRole, message);

        // 방에 있는 모든 소켓에 브로드캐스트
        io.to(`room:${targetRoomId}`).emit('message:new', {
          ...chatMessage,
          senderName: userName,
        });
      } catch (err) {
        logger.error({ err, userId }, 'Socket.io 메시지 전송 실패');
        socket.emit('error', { message: '메시지 전송에 실패했습니다' });
      }
    });

    // 읽음 처리
    socket.on('message:read', async (data: { roomId?: string }) => {
      try {
        const roomId = data.roomId ?? socket.data.roomId;
        if (!roomId) return;

        const readerRole = userRole === 'ADMIN' ? 'ADMIN' : 'USER';
        await chatRepo.markAsRead(roomId, readerRole);

        // 상대방에게 읽음 알림
        io.to(`room:${roomId}`).emit('message:read', { roomId, readerRole });
      } catch (err) {
        logger.error({ err, userId }, 'Socket.io 읽음 처리 실패');
      }
    });

    // 타이핑 표시
    socket.on('typing:start', (data: { roomId?: string }) => {
      const roomId = data.roomId ?? socket.data.roomId;
      if (!roomId) return;
      socket.to(`room:${roomId}`).emit('typing:start', { userId, userName, userRole });
    });

    socket.on('typing:stop', (data: { roomId?: string }) => {
      const roomId = data.roomId ?? socket.data.roomId;
      if (!roomId) return;
      socket.to(`room:${roomId}`).emit('typing:stop', { userId });
    });

    socket.on('disconnect', () => {
      logger.info({ userId, userRole }, 'Socket.io 연결 해제');
    });
  });

  return io;
}
