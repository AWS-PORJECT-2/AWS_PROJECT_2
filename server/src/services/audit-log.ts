import type pg from 'pg';
import { logger } from '../logger.js';

export type AuditLevel = 'info' | 'warn' | 'error';

export interface AuditLogInput {
  level?: AuditLevel;
  source?: string | null;
  message: string;
  meta?: Record<string, unknown>;
  userId?: string | null;
}

/**
 * 감사로그 best-effort 기록.
 *
 * 절대 throw 하지 않는다 — 로그 기록 실패가 본 요청(에러 응답, 펀드 승인 등)을 막아선 안 되므로
 * 모든 예외를 내부에서 흡수하고 logger.warn 으로만 남긴다.
 */
export async function logAudit(pool: pg.Pool, input: AuditLogInput): Promise<void> {
  try {
    const level: AuditLevel =
      input.level === 'error' || input.level === 'warn' ? input.level : 'info';
    const source = input.source ? String(input.source).slice(0, 60) : null;
    const message = String(input.message ?? '').slice(0, 4000);
    const meta = input.meta && typeof input.meta === 'object' ? input.meta : {};
    const userId = input.userId ?? null;

    await pool.query(
      `INSERT INTO audit_logs (level, source, message, meta, user_id)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [level, source, message, JSON.stringify(meta), userId],
    );
  } catch (err) {
    // 흡수: 기록 실패는 요청 흐름에 영향을 주지 않는다.
    logger.warn({ err }, 'audit_logs 기록 실패(흡수)');
  }
}
