import type { NotificationCreate, NotificationRepository } from '../repositories/notification-repository.js';
import type { NotificationType } from '../types/index.js';
import { logger } from '../logger.js';

/**
 * best-effort 알림 생성 헬퍼. 절대 throw 하지 않는다 — 알림 실패가 메인 흐름(가입/개설/후원/스케줄러)을
 * 막지 않도록 try/catch 로 흡수하고 로그만 남긴다. 생성된 알림(또는 실패 시 null)을 반환.
 */
export async function notify(
  repo: NotificationRepository,
  input: NotificationCreate,
): Promise<void> {
  try {
    await repo.create(input);
  } catch (err) {
    logger.warn({ err, userId: input.userId, type: input.type, fundId: input.fundId ?? null }, '알림 생성 실패(무시)');
  }
}

/**
 * 여러 사용자에게 동일 알림을 best-effort 로 발송. 중복 userId 는 제거.
 * 개별 실패는 notify() 가 흡수하므로 일부 실패해도 나머지는 계속 진행.
 */
export async function notifyMany(
  repo: NotificationRepository,
  userIds: string[],
  payload: { type: NotificationType; title: string; body?: string | null; fundId?: string | null },
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const userId of unique) {
    await notify(repo, { userId, ...payload });
  }
}
