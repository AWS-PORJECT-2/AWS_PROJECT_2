import type pg from 'pg';
import { logger } from '../logger.js';

export type ModerationAction =
  | 'suspend' | 'ban' | 'unban' | 'withdraw' | 'restore'
  | 'rename' | 'role' | 'warn' | 'note' | 'notify' | 'force_logout';

export interface ModerationActionRow {
  id: string;
  action: ModerationAction;
  reason: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  adminName: string | null;
}

export interface UserActivity {
  funds: number;        // 개설한(미삭제) 프로젝트
  backings: number;     // 후원(reward_orders)
  posts: number;        // 게시판 글
  comments: number;     // 작성 댓글
  reportsAgainst: number; // 이 사용자(프로필) 대상 신고
}

/** 제재/관리 행위 1건 기록(best-effort — 실패해도 메인 흐름 막지 않음). */
export async function recordModeration(
  pool: pg.Pool,
  input: { targetUserId: string; adminId: string | null; action: ModerationAction; reason?: string | null; meta?: Record<string, unknown> },
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO user_moderation_actions (target_user_id, admin_id, action, reason, meta)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [input.targetUserId, input.adminId ?? null, input.action, input.reason ?? null, JSON.stringify(input.meta ?? {})],
    );
  } catch (err) {
    logger.warn({ err, targetUserId: input.targetUserId, action: input.action }, '제재 이력 기록 실패(흡수)');
  }
}

/** 사용자 제재 이력(최신순). admin 이름 조인. */
export async function listModeration(pool: pg.Pool, targetUserId: string, limit = 50): Promise<ModerationActionRow[]> {
  const r = await pool.query(
    `SELECT m.id, m.action, m.reason, m.meta, m.created_at, a.name AS admin_name
       FROM user_moderation_actions m
       LEFT JOIN "user" a ON a.id = m.admin_id
      WHERE m.target_user_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2`,
    [targetUserId, Math.min(Math.max(limit, 1), 200)],
  );
  return r.rows.map((row) => ({
    id: row.id as string,
    action: row.action as ModerationAction,
    reason: (row.reason as string | null) ?? null,
    meta: (row.meta as Record<string, unknown>) ?? {},
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    adminName: (row.admin_name as string | null) ?? null,
  }));
}

/** 사용자 활동 집계(상세 화면용). target_id 는 컬럼 타입 불문 ::text 비교로 안전 처리. */
export async function getUserActivity(pool: pg.Pool, userId: string): Promise<UserActivity> {
  try {
    const r = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM groupbuys WHERE creator_id = $1 AND deleted_at IS NULL) AS funds,
         (SELECT COUNT(*)::int FROM reward_orders WHERE user_id = $1) AS backings,
         (SELECT COUNT(*)::int FROM board_posts WHERE author_id = $1) AS posts,
         (SELECT COUNT(*)::int FROM comments WHERE user_id = $1) AS comments,
         (SELECT COUNT(*)::int FROM reports WHERE target_type = 'maker' AND target_id::text = $1::text) AS reports_against`,
      [userId],
    );
    const row = r.rows[0] ?? {};
    return {
      funds: Number(row.funds) || 0,
      backings: Number(row.backings) || 0,
      posts: Number(row.posts) || 0,
      comments: Number(row.comments) || 0,
      reportsAgainst: Number(row.reports_against) || 0,
    };
  } catch (err) {
    logger.warn({ err, userId }, '사용자 활동 집계 실패(0 처리)');
    return { funds: 0, backings: 0, posts: 0, comments: 0, reportsAgainst: 0 };
  }
}
