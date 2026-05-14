import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export interface ChatRoomRow {
  id: number;
  userId: number;
  userName: string | null;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  unreadAdminCount: number;
  unreadUserCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageRow {
  id: number;
  roomId: number;
  senderId: number;
  senderRole: 'USER' | 'ADMIN';
  message: string;
  isRead: boolean;
  createdAt: Date;
}

export interface ChatRepository {
  findOrCreateRoomByUser(userId: number): Promise<ChatRoomRow>;
  findRoomById(roomId: number): Promise<ChatRoomRow | null>;
  listRoomsForAdmin(): Promise<ChatRoomRow[]>;
  listMessages(roomId: number, limit: number): Promise<ChatMessageRow[]>;
  saveMessage(
    roomId: number,
    senderId: number,
    senderRole: 'USER' | 'ADMIN',
    message: string
  ): Promise<ChatMessageRow>;
  markRoomReadForAdmin(roomId: number): Promise<void>;
  markRoomReadForUser(roomId: number): Promise<void>;
}

export class MySQLChatRepository implements ChatRepository {
  constructor(private pool: Pool) {}

  async findOrCreateRoomByUser(userId: number): Promise<ChatRoomRow> {
    // SELECT 후 없으면 INSERT — UNIQUE 제약으로 race condition은 INSERT가 막음
    const existing = await this.findByUserId(userId);
    if (existing) return existing;

    try {
      await this.pool.query<ResultSetHeader>(
        'INSERT INTO chat_rooms (user_id) VALUES (?)',
        [userId]
      );
    } catch (err: unknown) {
      // ER_DUP_ENTRY (1062) — 동시 생성된 경우 무시
      const e = err as { code?: string; errno?: number };
      if (e.code !== 'ER_DUP_ENTRY' && e.errno !== 1062) {
        throw err;
      }
    }
    const created = await this.findByUserId(userId);
    if (!created) throw new Error('chat_room 생성 실패');
    return created;
  }

  private async findByUserId(userId: number): Promise<ChatRoomRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT r.*, u.name AS user_name
       FROM chat_rooms r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.user_id = ?`,
      [userId]
    );
    if (rows.length === 0) return null;
    return this.mapRoom(rows[0]);
  }

  async findRoomById(roomId: number): Promise<ChatRoomRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT r.*, u.name AS user_name
       FROM chat_rooms r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.id = ?`,
      [roomId]
    );
    if (rows.length === 0) return null;
    return this.mapRoom(rows[0]);
  }

  async listRoomsForAdmin(): Promise<ChatRoomRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT r.*, u.name AS user_name
       FROM chat_rooms r
       LEFT JOIN users u ON u.id = r.user_id
       ORDER BY (r.last_message_at IS NULL), r.last_message_at DESC, r.created_at DESC`
    );
    return rows.map((r) => this.mapRoom(r));
  }

  async listMessages(roomId: number, limit: number): Promise<ChatMessageRow[]> {
    // 최근 N건을 가져온 뒤 시간순 오름차순 반환
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM (
         SELECT * FROM chat_messages
         WHERE room_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?
       ) AS t
       ORDER BY t.created_at ASC, t.id ASC`,
      [roomId, limit]
    );
    return rows.map((r) => this.mapMessage(r));
  }

  /**
   * 메시지 저장 + chat_rooms 갱신을 트랜잭션으로 처리.
   *  - chat_messages INSERT
   *  - chat_rooms.last_message / last_message_at / unread_*_count 업데이트
   */
  async saveMessage(
    roomId: number,
    senderId: number,
    senderRole: 'USER' | 'ADMIN',
    message: string
  ): Promise<ChatMessageRow> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [insertResult] = await conn.query<ResultSetHeader>(
        'INSERT INTO chat_messages (room_id, sender_id, sender_role, message, is_read) VALUES (?, ?, ?, ?, FALSE)',
        [roomId, senderId, senderRole, message]
      );

      // 방 상태 갱신: last_message + 카운터
      const preview = message.length > 200 ? message.slice(0, 200) : message;
      if (senderRole === 'USER') {
        // 유저가 보냈다면 → 관리자 안 읽음 +1
        await conn.query(
          `UPDATE chat_rooms
           SET last_message = ?, last_message_at = NOW(),
               unread_admin_count = unread_admin_count + 1
           WHERE id = ?`,
          [preview, roomId]
        );
      } else {
        // 관리자가 보냈다면 → 유저 안 읽음 +1
        await conn.query(
          `UPDATE chat_rooms
           SET last_message = ?, last_message_at = NOW(),
               unread_user_count = unread_user_count + 1
           WHERE id = ?`,
          [preview, roomId]
        );
      }

      await conn.commit();

      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM chat_messages WHERE id = ?',
        [insertResult.insertId]
      );
      return this.mapMessage(rows[0]);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 관리자가 방을 열었을 때: 유저가 보낸 메시지를 읽음 처리 + 안 읽음 카운트 0
   */
  async markRoomReadForAdmin(roomId: number): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `UPDATE chat_messages
         SET is_read = TRUE
         WHERE room_id = ? AND sender_role = 'USER' AND is_read = FALSE`,
        [roomId]
      );
      await conn.query(
        'UPDATE chat_rooms SET unread_admin_count = 0 WHERE id = ?',
        [roomId]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 유저가 자기 방을 열었을 때: 관리자가 보낸 메시지 읽음 처리.
   */
  async markRoomReadForUser(roomId: number): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `UPDATE chat_messages
         SET is_read = TRUE
         WHERE room_id = ? AND sender_role = 'ADMIN' AND is_read = FALSE`,
        [roomId]
      );
      await conn.query(
        'UPDATE chat_rooms SET unread_user_count = 0 WHERE id = ?',
        [roomId]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  private mapRoom(row: RowDataPacket): ChatRoomRow {
    return {
      id: row.id,
      userId: row.user_id,
      userName: row.user_name ?? null,
      lastMessage: row.last_message,
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : null,
      unreadAdminCount: row.unread_admin_count,
      unreadUserCount: row.unread_user_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapMessage(row: RowDataPacket): ChatMessageRow {
    return {
      id: row.id,
      roomId: row.room_id,
      senderId: row.sender_id,
      senderRole: row.sender_role,
      message: row.message,
      isRead: Boolean(row.is_read),
      createdAt: new Date(row.created_at),
    };
  }
}
