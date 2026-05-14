import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ChatRepository } from '../repositories/chat-repository.js';

/**
 * 채팅 REST API.
 * - GET /api/chat/me/room        : 내 방 정보 + 최근 메시지 (USER)
 * - GET /api/chat/admin/rooms    : 모든 방 목록 (ADMIN)
 * - GET /api/chat/admin/rooms/:roomId/messages : 특정 방 메시지 (ADMIN)
 * - POST /api/chat/admin/rooms/:roomId/read : 읽음 처리 (ADMIN)
 *
 * 메시지 송신은 소켓으로만 처리.
 */

const HISTORY_LIMIT = 200;

export function createChatRouter(repo: ChatRepository): Router {
  const router = Router();

  // GET /api/chat/me/room - 내 방 정보 + 메시지
  router.get('/me/room', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.userId!, 10);
      const room = await repo.findOrCreateRoomByUser(userId);
      const messages = await repo.listMessages(room.id, HISTORY_LIMIT);
      // 유저가 방을 열면 관리자 메시지 읽음 처리
      await repo.markRoomReadForUser(room.id);
      const updatedRoom = await repo.findRoomById(room.id);
      res.json({
        room: updatedRoom,
        messages,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createAdminChatRouter(repo: ChatRepository): Router {
  const router = Router();

  // GET /api/chat/admin/rooms - 전체 방 목록
  router.get('/rooms', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rooms = await repo.listRoomsForAdmin();
      res.json({ rooms });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/chat/admin/rooms/:roomId/messages
  router.get('/rooms/:roomId/messages', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = parseInt(req.params.roomId, 10);
      if (!Number.isInteger(roomId)) {
        res.status(400).json({ error: 'INVALID_ID', message: 'roomId 가 올바르지 않습니다' });
        return;
      }
      const room = await repo.findRoomById(roomId);
      if (!room) {
        res.status(404).json({ error: 'NOT_FOUND', message: '채팅방을 찾을 수 없습니다' });
        return;
      }
      const messages = await repo.listMessages(roomId, HISTORY_LIMIT);
      res.json({ room, messages });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/chat/admin/rooms/:roomId/read - 읽음 처리
  router.post('/rooms/:roomId/read', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = parseInt(req.params.roomId, 10);
      if (!Number.isInteger(roomId)) {
        res.status(400).json({ error: 'INVALID_ID', message: 'roomId 가 올바르지 않습니다' });
        return;
      }
      await repo.markRoomReadForAdmin(roomId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
