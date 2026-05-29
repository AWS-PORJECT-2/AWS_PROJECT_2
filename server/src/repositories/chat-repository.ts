import type pg from 'pg';
import type { ChatRoom, ChatMessage, ChatSenderRole } from '../types/chat.js';

export interface ChatRepository {
  findOrCreateRoom(userId: string): Promise<ChatRoom>;
  findRoomByUserId(userId: string): Promise<ChatRoom | null>;
  findRoomById(roomId: string): Promise<ChatRoom | null>;
  listRooms(limit: number, offset: number): Promise<{ items: ChatRoom[]; total: number }>;
  getMessages(roomId: string, limit: number, offset: number): Promise<ChatMessage[]>;
  createMessage(roomId: string, senderId: string, senderRole: ChatSenderRole, message: string): Promise<ChatMessage>;
  markAsRead(roomId: string, readerRole: ChatSenderRole): Promise<void>;
}

export class PgChatRepository implements ChatRepository {
  constructor(private readonly pool: pg.Pool) {}

  async findOrCreateRoom(userId: string): Promise<ChatRoom> {
    // INSERT ... ON CONFLICT 로 유저당 1개 방 보장
    const result = await this.pool.query(
      `INSERT INTO chat_rooms (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = chat_rooms.updated_at
       RETURNING id`,
      [userId],
    );
    const room = await this.findRoomById(result.rows[0].id as string);
    if (!room) throw new Error('채팅방 생성/조회 실패');
    return room;
  }

  async findRoomByUserId(userId: string): Promise<ChatRoom | null> {
    const result = await this.pool.query(
      `SELECT cr.*, u.name AS user_name
         FROM chat_rooms cr
         LEFT JOIN "user" u ON u.id = cr.user_id
        WHERE cr.user_id = $1`,
      [userId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRoomRow(result.rows[0]);
  }

  async findRoomById(roomId: string): Promise<ChatRoom | null> {
    const result = await this.pool.query(
      `SELECT cr.*, u.name AS user_name
         FROM chat_rooms cr
         LEFT JOIN "user" u ON u.id = cr.user_id
        WHERE cr.id = $1`,
      [roomId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRoomRow(result.rows[0]);
  }

  async listRooms(limit: number, offset: number): Promise<{ items: ChatRoom[]; total: number }> {
    const [listRes, countRes] = await Promise.all([
      this.pool.query(
        `SELECT cr.*, u.name AS user_name
           FROM chat_rooms cr
           LEFT JOIN "user" u ON u.id = cr.user_id
          ORDER BY cr.last_message_at DESC NULLS LAST, cr.created_at DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      this.pool.query(`SELECT COUNT(*)::int AS cnt FROM chat_rooms`),
    ]);
    const items = listRes.rows.map((r) => this.mapRoomRow(r));
    const total = Number(countRes.rows[0].cnt);
    return { items, total };
  }

  async getMessages(roomId: string, limit: number, offset: number): Promise<ChatMessage[]> {
    const result = await this.pool.query(
      `SELECT * FROM chat_messages
        WHERE room_id = $1
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3`,
      [roomId, limit, offset],
    );
    return result.rows.map((r) => this.mapMessageRow(r));
  }

  async createMessage(
    roomId: string,
    senderId: string,
    senderRole: ChatSenderRole,
    message: string,
  ): Promise<ChatMessage> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const msgResult = await client.query(
        `INSERT INTO chat_messages (room_id, sender_id, sender_role, message)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [roomId, senderId, senderRole, message],
      );

      // 상대방의 unread 카운트 증가 + last_message 업데이트
      const unreadCol = senderRole === 'USER' ? 'unread_admin_count' : 'unread_user_count';
      await client.query(
        `UPDATE chat_rooms
            SET last_message = $1,
                last_message_at = NOW(),
                ${unreadCol} = ${unreadCol} + 1,
                updated_at = NOW()
          WHERE id = $2`,
        [message.substring(0, 100), roomId],
      );

      await client.query('COMMIT');
      return this.mapMessageRow(msgResult.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async markAsRead(roomId: string, readerRole: ChatSenderRole): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 상대방이 보낸 메시지를 읽음 처리
      const senderRole = readerRole === 'USER' ? 'ADMIN' : 'USER';
      await client.query(
        `UPDATE chat_messages
            SET is_read = TRUE
          WHERE room_id = $1 AND sender_role = $2 AND is_read = FALSE`,
        [roomId, senderRole],
      );

      // 내 unread 카운트 리셋
      const unreadCol = readerRole === 'USER' ? 'unread_user_count' : 'unread_admin_count';
      await client.query(
        `UPDATE chat_rooms SET ${unreadCol} = 0, updated_at = NOW() WHERE id = $1`,
        [roomId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private mapRoomRow(row: Record<string, unknown>): ChatRoom {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      userName: (row.user_name as string | null) ?? null,
      lastMessage: (row.last_message as string | null) ?? null,
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at as string) : null,
      unreadAdminCount: Number(row.unread_admin_count),
      unreadUserCount: Number(row.unread_user_count),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapMessageRow(row: Record<string, unknown>): ChatMessage {
    return {
      id: row.id as string,
      roomId: row.room_id as string,
      senderId: row.sender_id as string,
      senderRole: row.sender_role as ChatSenderRole,
      message: row.message as string,
      isRead: row.is_read as boolean,
      createdAt: new Date(row.created_at as string),
    };
  }
}
