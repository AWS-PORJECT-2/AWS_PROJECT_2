import type { UserStatus } from '../types/user.js';

export type AccessBlockCode = 'USER_BANNED' | 'USER_SUSPENDED' | 'ACCOUNT_WITHDRAWN';

export interface AccessBlock {
  code: AccessBlockCode;
  until?: Date | null; // SUSPENDED 일 때 해제 예정 시각(영구/무기한이면 null)
}

/**
 * 계정 상태로 접근(요청·로그인) 차단 여부 판정. 차단이면 {code}, 정상이면 null.
 *  - BANNED → 영구 차단
 *  - WITHDRAWN → 탈퇴 계정 차단
 *  - SUSPENDED → suspended_until 까지 차단. 경과(만료)했으면 차단 아님(상위에서 lazy 복구).
 * 인증 미들웨어(요청 시점)와 로그인 콜백(로그인 시점) 양쪽이 동일 규칙을 쓰도록 단일 소스로 둔다.
 */
export function accessBlock(user: { status?: UserStatus | string | null; suspendedUntil?: Date | null }): AccessBlock | null {
  const s = (user.status ?? 'ACTIVE') as UserStatus;
  if (s === 'BANNED') return { code: 'USER_BANNED' };
  if (s === 'WITHDRAWN') return { code: 'ACCOUNT_WITHDRAWN' };
  if (s === 'SUSPENDED') {
    const until = user.suspendedUntil ?? null;
    if (!until || until.getTime() > Date.now()) return { code: 'USER_SUSPENDED', until };
  }
  return null;
}

/** 기간정지(SUSPENDED)인데 만료 시각이 지났는지 — true 면 자동 복구(ACTIVE) 대상. */
export function isSuspensionExpired(user: { status?: UserStatus | string | null; suspendedUntil?: Date | null }): boolean {
  return (user.status ?? 'ACTIVE') === 'SUSPENDED' && !!user.suspendedUntil && user.suspendedUntil.getTime() <= Date.now();
}
