import type pg from 'pg';
import type { Notification, NotificationType } from '../types/index.js';
import type { NotificationCreate, NotificationRepository } from './notification-repository.js';

function mapRow(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as NotificationType,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    fundId: (row.fund_id as string | null) ?? null,
    isRead: Boolean(row.is_read),
    createdAt: new Date(row.created_at as string),
  };
}

/** 알림 저장소 PostgreSQL 구현. (024_notifications) */
export class PgNotificationRepository implements NotificationRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: NotificationCreate): Promise<Notification> {
    const res = await this.pool.query(
      `INSERT INTO notifications (user_id, type, title, body, fund_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, type, title, body, fund_id, is_read, created_at`,
      [input.userId, input.type, input.title, input.body ?? null, input.fundId ?? null],
    );
    return mapRow(res.rows[0]);
  }

  async listByUser(userId: string, limit: number): Promise<Notification[]> {
    const res = await this.pool.query(
      `SELECT id, user_id, type, title, body, fund_id, is_read, created_at
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    return res.rows.map(mapRow);
  }

  async unreadCount(userId: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [userId],
    );
    return res.rows[0]?.c ?? 0;
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 AND is_read = FALSE`,
      [id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
      [userId],
    );
  }

  async existsForFund(type: NotificationType, fundId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM notifications WHERE type = $1 AND fund_id = $2 LIMIT 1`,
      [type, fundId],
    );
    return res.rows.length > 0;
  }
}
