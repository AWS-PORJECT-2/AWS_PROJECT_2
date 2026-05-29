import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ChatRepository } from '../repositories/chat-repository.js';
import { logger } from '../logger.js';

/**
 * 채팅 REST API 라우트.
 * Socket.io 로 실시간 메시징을 처리하지만, 히스토리 조회·방 목록 등은 REST 로 제공.
 *
 * 유저 라우트:
 * - GET  /me/room         : 내 채팅방 조회/생성
 * - GET  /me/messages     : 내 채팅방 메시지 목록
 * - POST /me/messages     : 메시지 전송 (REST fallback)
 * - POST /me/read         : 읽음 처리
 *
 * 관리자 라우트:
 * - GET  /admin/rooms     : 전체 채팅방 목록
 * - GET  /admin/rooms/:roomId/messages : 특정 방 메시지
 * - POST /admin/rooms/:roomId/messages : 관리자 메시지 전송
 * - POST /admin/rooms/:roomId/read     : 읽음 처리
 */
export function createChatRouter(
  chatRepo: ChatRepository,
  authRequired: (req: Request, res: Response, next: () => void) => void,
  requireAdmin: (req: Request, res: Response, next: () => void) => void,
) {
  const router = Router();

  // ─── 유저 라우트 ───

  // 내 채팅방 조회/생성
  router.get('/me/room', authRequired, async (req: Request, res: Response) => {
    try {
      const room = await chatRepo.findOrCreateRoom(req.userId!);
      res.json(room);
    } catch (err) {
      logger.error({ err }, '채팅방 조회/생성 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 내 채팅방 메시지 목록
  router.get('/me/messages', authRequired, async (req: Request, res: Response) => {
    try {
      const room = await chatRepo.findRoomByUserId(req.userId!);
      if (!room) {
        res.json([]);
        return;
      }
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const messages = await chatRepo.getMessages(room.id, limit, offset);
      res.json(messages);
    } catch (err) {
      logger.error({ err }, '채팅 메시지 조회 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 유저 메시지 전송 (REST fallback — Socket.io 불가 시)
  router.post('/me/messages', authRequired, async (req: Request, res: Response) => {
    try {
      const { message } = req.body as { message?: string };
      if (!message?.trim() || message.trim().length > 2000) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: '메시지는 1~2000자여야 합니다' });
        return;
      }
      const room = await chatRepo.findOrCreateRoom(req.userId!);
      const msg = await chatRepo.createMessage(room.id, req.userId!, 'USER', message.trim());
      res.status(201).json(msg);
    } catch (err) {
      logger.error({ err }, '채팅 메시지 전송 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 유저 읽음 처리
  router.post('/me/read', authRequired, async (req: Request, res: Response) => {
    try {
      const room = await chatRepo.findRoomByUserId(req.userId!);
      if (!room) {
        res.status(404).json({ error: 'NOT_FOUND', message: '채팅방이 없습니다' });
        return;
      }
      await chatRepo.markAsRead(room.id, 'USER');
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, '읽음 처리 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // ─── 관리자 라우트 ───

  // 전체 채팅방 목록
  router.get('/admin/rooms', authRequired, requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const offset = (page - 1) * limit;
      const { items, total } = await chatRepo.listRooms(limit, offset);
      res.json({ items, total, page, limit });
    } catch (err) {
      logger.error({ err }, '채팅방 목록 조회 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 특정 방 메시지 조회
  router.get('/admin/rooms/:roomId/messages', authRequired, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const messages = await chatRepo.getMessages(roomId, limit, offset);
      res.json(messages);
    } catch (err) {
      logger.error({ err }, '관리자 채팅 메시지 조회 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 관리자 메시지 전송
  router.post('/admin/rooms/:roomId/messages', authRequired, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const { message } = req.body as { message?: string };
      if (!message?.trim() || message.trim().length > 2000) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: '메시지는 1~2000자여야 합니다' });
        return;
      }
      const room = await chatRepo.findRoomById(roomId);
      if (!room) {
        res.status(404).json({ error: 'NOT_FOUND', message: '채팅방을 찾을 수 없습니다' });
        return;
      }
      const msg = await chatRepo.createMessage(roomId, req.userId!, 'ADMIN', message.trim());
      res.status(201).json(msg);
    } catch (err) {
      logger.error({ err }, '관리자 메시지 전송 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 관리자 읽음 처리
  router.post('/admin/rooms/:roomId/read', authRequired, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      await chatRepo.markAsRead(roomId, 'ADMIN');
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, '관리자 읽음 처리 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  return router;
}
