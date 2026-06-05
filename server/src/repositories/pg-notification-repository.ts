import type pg from 'pg';
import type { Notification, NotificationType } from '../types/index.js';
import type { NotificationCreate, NotificationRepository } from './notification-repository.js';

// 알림 종류 → 설정 토글 키(notification_prefs). 여기 매핑된 종류만 사용자가 끌 수 있다.
//  매핑에 없는 종류(가입/심사/입금·결제/계정제재/주문 등)는 필수 알림이라 토글과 무관하게 항상 발송.
//  메시지=1:1 문의/관리자 메시지, 프로젝트 업데이트=내 프로젝트 활동·팔로우 창작자 새 펀드.
const NOTIFICATION_PREF_KEY: Partial<Record<NotificationType, string>> = {
  inquiry_reply: 'message',
  admin_message: 'message',
  new_follower: 'follow',
  scheduled_open: 'subscribedOpen',
  deadline_soon: 'likedDeadline',
  new_backer: 'projectUpdate',
  project_comment: 'projectUpdate',
  comment_reply: 'projectUpdate',
  creator_new_fund: 'projectUpdate',
};

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

  async create(input: NotificationCreate): Promise<Notification | null> {
    // 알림 설정 게이트 — 이 종류에 대응하는 토글을 사용자가 명시적으로 false 로 끄면 생성을 생략한다.
    //  조건부 INSERT(추가 왕복 없음): prefKey 가 없으면($6 NULL) 항상 INSERT, 있으면 그 토글이 'false' 가 아닐 때만.
    const prefKey = NOTIFICATION_PREF_KEY[input.type] ?? null;
    const res = await this.pool.query(
      `INSERT INTO notifications (user_id, type, title, body, fund_id)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (
         SELECT 1 FROM "user" u
          WHERE u.id = $1 AND $6::text IS NOT NULL AND (u.notification_prefs ->> $6) = 'false'
       )
       RETURNING id, user_id, type, title, body, fund_id, is_read, created_at`,
      [input.userId, input.type, input.title, input.body ?? null, input.fundId ?? null, prefKey],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;  // 토글 OFF 면 0행 → null(notify 는 무시)
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

  async deleteAllForUser(userId: string): Promise<number> {
    const r = await this.pool.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    return r.rowCount ?? 0;
  }

  async existsForFund(type: NotificationType, fundId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM notifications WHERE type = $1 AND fund_id = $2 LIMIT 1`,
      [type, fundId],
    );
    return res.rows.length > 0;
  }
}
