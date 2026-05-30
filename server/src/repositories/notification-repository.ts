import type { Notification, NotificationType } from '../types/index.js';

/** 알림 생성 입력 — body/fundId 는 선택. */
export interface NotificationCreate {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  fundId?: string | null;
}

/**
 * 알림 저장소 — 이벤트에서 생성, 사용자가 조회/읽음 처리. (024_notifications)
 * 본인(user_id) 알림만 다룬다. 읽음 처리는 항상 userId 를 함께 검사해 타 사용자 알림 접근을 차단.
 */
export interface NotificationRepository {
  create(input: NotificationCreate): Promise<Notification>;
  /** 최신순 목록(limit 개). */
  listByUser(userId: string, limit: number): Promise<Notification[]>;
  /** 안 읽은 알림 수. */
  unreadCount(userId: string): Promise<number>;
  /** 본인 알림 1건 읽음 처리. 대상이 없거나 타인 것이면 false. */
  markRead(userId: string, id: string): Promise<boolean>;
  /** 본인 안 읽은 알림 전부 읽음 처리. */
  markAllRead(userId: string): Promise<void>;
  /**
   * 동일 type + fund_id 알림이 (대상 사용자 무관) 이미 존재하는지.
   * 마감임박(deadline_soon) 등 펀드 단위 1회 발송 보장에 사용.
   */
  existsForFund(type: NotificationType, fundId: string): Promise<boolean>;
}
