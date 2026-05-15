import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import * as cookie from 'cookie';
import type { ChatRepository } from './repositories/chat-repository.js';
import type { MySQLUserRepository, AppUser } from './repositories/mysql-user-repository.js';
import { logger } from './logger.js';

/**
 * Socket.io 서버 통합.
 *
 * 인증:
 *  - HTTP 핸드셰이크의 Cookie 헤더에서 devUserId 를 파싱
 *  - DB에서 user 조회 → 권한(USER/ADMIN) 확인 → socket.data 에 저장
 *
 * 네임스페이스:
 *  - "/chat" : 1대1 상담
 *
 * 룸 규칙:
 *  - "user:<userId>"      : 해당 유저의 개인 알림 채널
 *  - "room:<roomId>"      : 채팅방 (유저 본인 + 모든 관리자)
 *  - "admin"              : 모든 관리자가 join — 신규 메시지 알림용
 *
 * 이벤트:
 *  - client → server:
 *      "join_user_room"      : 유저가 자기 방에 입장
 *      "join_admin_room"     : 관리자가 특정 roomId 채팅방 입장
 *      "leave_admin_room"    : 관리자가 채팅방 떠남
 *      "send_message"        { roomId, message }
 *      "mark_read"           { roomId }   — 자신의 안 읽은 카운트 0으로
 *  - server → client:
 *      "message"             { message }
 *      "room_updated"        { room }    — 관리자 목록 갱신용
 *      "error"               { message }
 */

type AuthedSocket = Socket & {
  data: {
    user: AppUser;
  };
};

export function attachSocketServer(
  httpServer: HttpServer,
  chatRepo: ChatRepository,
  userRepo: MySQLUserRepository,
  corsOrigin: string
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
  });

  const chatNs = io.of('/chat');

  // --- 인증 미들웨어 ---
  chatNs.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      if (!cookieHeader) {
        return next(new Error('NOT_AUTHENTICATED'));
      }
      const parsed = cookie.parse(cookieHeader);
      const userIdStr = parsed.devUserId;
      if (!userIdStr) return next(new Error('NOT_AUTHENTICATED'));

      const userId = parseInt(userIdStr, 10);
      if (!Number.isInteger(userId)) return next(new Error('INVALID_SESSION'));

      const user = await userRepo.findById(userId);
      if (!user) return next(new Error('USER_NOT_FOUND'));

      (socket.data as { user: AppUser }).user = user;
      next();
    } catch (err) {
      logger.error({ err }, 'socket auth 에러');
      next(new Error('AUTH_FAILED'));
    }
  });

  chatNs.on('connection', (rawSocket: Socket) => {
    const socket = rawSocket as AuthedSocket;
    const user = socket.data.user;

    logger.info({ userId: user.id, role: user.role }, 'socket 연결');

    // 관리자는 자동으로 admin 채널 join
    if (user.role === 'ADMIN') {
      socket.join('admin');
    }

    // === 유저: 본인 방 입장 ===
    socket.on('join_user_room', async () => {
      try {
        if (user.role !== 'USER') {
          socket.emit('error', { message: 'USER 권한이 필요합니다' });
          return;
        }
        const room = await chatRepo.findOrCreateRoomByUser(user.id);
        socket.join('room:' + room.id);
        socket.join('user:' + user.id);

        // 입장 시 관리자가 보낸 메시지 읽음 처리
        await chatRepo.markRoomReadForUser(room.id);

        socket.emit('joined', { roomId: room.id });
      } catch (err) {
        logger.error({ err }, 'join_user_room 실패');
        socket.emit('error', { message: '방 입장에 실패했습니다' });
      }
    });

    // === 관리자: 특정 방 입장 ===
    socket.on('join_admin_room', async (data: { roomId: number }) => {
      try {
        if (user.role !== 'ADMIN') {
          socket.emit('error', { message: 'ADMIN 권한이 필요합니다' });
          return;
        }
        const roomId = Number(data?.roomId);
        if (!Number.isInteger(roomId)) {
          socket.emit('error', { message: 'roomId 가 올바르지 않습니다' });
          return;
        }
        const room = await chatRepo.findRoomById(roomId);
        if (!room) {
          socket.emit('error', { message: '채팅방을 찾을 수 없습니다' });
          return;
        }
        socket.join('room:' + roomId);
        await chatRepo.markRoomReadForAdmin(roomId);

        // 관리자에게 방 갱신 알림 (안 읽음 0)
        const updated = await chatRepo.findRoomById(roomId);
        chatNs.to('admin').emit('room_updated', { room: updated });

        socket.emit('joined', { roomId });
      } catch (err) {
        logger.error({ err }, 'join_admin_room 실패');
        socket.emit('error', { message: '방 입장에 실패했습니다' });
      }
    });

    // === 관리자: 방 떠나기 ===
    socket.on('leave_admin_room', (data: { roomId: number }) => {
      const roomId = Number(data?.roomId);
      if (Number.isInteger(roomId)) {
        socket.leave('room:' + roomId);
      }
    });

    // === 메시지 전송 ===
    socket.on('send_message', async (data: { roomId: number; message: string }) => {
      try {
        const roomId = Number(data?.roomId);
        const text = String(data?.message || '').trim();
        if (!Number.isInteger(roomId) || !text) {
          socket.emit('error', { message: '메시지가 올바르지 않습니다' });
          return;
        }
        if (text.length > 2000) {
          socket.emit('error', { message: '메시지는 2000자 이하로 작성해주세요' });
          return;
        }

        // 방 소유권 검사
        const room = await chatRepo.findRoomById(roomId);
        if (!room) {
          socket.emit('error', { message: '채팅방을 찾을 수 없습니다' });
          return;
        }
        if (user.role === 'USER' && room.userId !== user.id) {
          socket.emit('error', { message: '자신의 채팅방에서만 메시지를 보낼 수 있습니다' });
          return;
        }

        // DB 저장 (트랜잭션 처리됨)
        const saved = await chatRepo.saveMessage(
          roomId,
          user.id,
          user.role,
          text
        );

        // 채팅방에 broadcast (본인 포함)
        chatNs.to('room:' + roomId).emit('message', { message: saved });

        // 관리자 목록 갱신용 - 모든 관리자에게 room_updated
        const updatedRoom = await chatRepo.findRoomById(roomId);
        chatNs.to('admin').emit('room_updated', { room: updatedRoom });

        // 유저가 안 읽음 카운트 증가했을 때 — 해당 유저에게 알림
        if (user.role === 'ADMIN') {
          chatNs.to('user:' + room.userId).emit('room_updated', { room: updatedRoom });
        }
      } catch (err) {
        logger.error({ err }, 'send_message 실패');
        socket.emit('error', { message: '메시지 전송에 실패했습니다' });
      }
    });

    // === 읽음 처리 ===
    socket.on('mark_read', async (data: { roomId: number }) => {
      try {
        const roomId = Number(data?.roomId);
        if (!Number.isInteger(roomId)) return;

        if (user.role === 'ADMIN') {
          await chatRepo.markRoomReadForAdmin(roomId);
        } else {
          const room = await chatRepo.findRoomById(roomId);
          if (room && room.userId === user.id) {
            await chatRepo.markRoomReadForUser(roomId);
          }
        }
        const updated = await chatRepo.findRoomById(roomId);
        chatNs.to('admin').emit('room_updated', { room: updated });
      } catch (err) {
        logger.error({ err }, 'mark_read 실패');
      }
    });

    socket.on('disconnect', () => {
      logger.info({ userId: user.id }, 'socket 연결 해제');
    });
  });

  return io;
}
