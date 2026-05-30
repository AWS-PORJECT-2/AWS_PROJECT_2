import type { Request, Response } from 'express';
import type pg from 'pg';
import type { UserRepository } from '../repositories/user-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

/**
 * 관리자 통계/로그 핸들러.
 * 모두 authRequired + requireAdmin 뒤에 마운트한다(비관리자는 requireAdmin 이 403).
 *
 *   GET /api/admin/me     콘솔 진입 가드 — { isAdmin, email, name }
 *   GET /api/admin/stats  대시보드 집계
 *   GET /api/admin/logs   audit_logs 최신순
 */

/** GET /api/admin/me — requireAdmin 통과 시 본인 정보. */
export function createAdminMeHandler(userRepo: UserRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.userId ? await userRepo.findById(req.userId) : null;
      res.json({
        isAdmin: true,
        email: user?.email ?? req.userEmail ?? null,
        name: user?.name ?? null,
      });
    } catch (err) {
      logger.error({ err }, '관리자 me 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/admin/stats — 사용자/펀드/주문 집계 + 카테고리/일별 추이. */
export function createAdminStatsHandler(pool: pg.Pool) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const [usersRow, fundsRow, ordersRow, topCats, dailySignups, dailyFunds] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new7d,
            COUNT(*) FILTER (WHERE role = 'ADMIN')::int AS admins
          FROM "user"
        `),
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'open')::int      AS open,
            COUNT(*) FILTER (WHERE status = 'pending')::int   AS pending_review,
            COUNT(*) FILTER (WHERE status = 'rejected')::int  AS rejected,
            COUNT(*) FILTER (WHERE status = 'achieved')::int  AS achieved,
            COUNT(*) FILTER (WHERE status = 'failed')::int    AS failed,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
            COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
            COUNT(*) FILTER (WHERE delete_requested = TRUE)::int AS delete_requested
          FROM groupbuys
        `),
        // GMV/주문: reward_orders(무통장) confirmed 기준. (카드 participations 와 별개 전용 테이블)
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'confirmed')::int AS paid,
            COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0)::bigint AS gmv
          FROM reward_orders
        `),
        pool.query(`
          SELECT category, COUNT(*)::int AS count
            FROM groupbuys
           WHERE category IS NOT NULL AND status <> 'rejected'
           GROUP BY category
           ORDER BY count DESC
           LIMIT 8
        `),
        pool.query(`
          SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
                 COALESCE(c.cnt, 0)::int       AS count
            FROM generate_series(
                   (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '13 days',
                   (NOW() AT TIME ZONE 'UTC')::date,
                   INTERVAL '1 day'
                 ) AS d(day)
            LEFT JOIN (
              SELECT (created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*) AS cnt
                FROM "user"
               WHERE created_at >= NOW() - INTERVAL '14 days'
               GROUP BY 1
            ) c ON c.day = d.day::date
           ORDER BY d.day ASC
        `),
        pool.query(`
          SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
                 COALESCE(c.cnt, 0)::int       AS count
            FROM generate_series(
                   (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '13 days',
                   (NOW() AT TIME ZONE 'UTC')::date,
                   INTERVAL '1 day'
                 ) AS d(day)
            LEFT JOIN (
              SELECT (created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*) AS cnt
                FROM groupbuys
               WHERE created_at >= NOW() - INTERVAL '14 days'
               GROUP BY 1
            ) c ON c.day = d.day::date
           ORDER BY d.day ASC
        `),
      ]);

      const u = usersRow.rows[0] ?? {};
      const f = fundsRow.rows[0] ?? {};
      const o = ordersRow.rows[0] ?? {};

      res.json({
        users: {
          total: Number(u.total) || 0,
          new7d: Number(u.new7d) || 0,
          admins: Number(u.admins) || 0,
        },
        funds: {
          total: Number(f.total) || 0,
          open: Number(f.open) || 0,
          pending_review: Number(f.pending_review) || 0,
          rejected: Number(f.rejected) || 0,
          achieved: Number(f.achieved) || 0,
          failed: Number(f.failed) || 0,
          completed: Number(f.completed) || 0,
          cancelled: Number(f.cancelled) || 0,
          deleteRequested: Number(f.delete_requested) || 0,
        },
        orders: {
          total: Number(o.total) || 0,
          paid: Number(o.paid) || 0,
          gmv: Number(o.gmv) || 0,
        },
        topCategories: topCats.rows.map((r) => ({
          category: r.category as string,
          count: Number(r.count) || 0,
        })),
        dailySignups: dailySignups.rows.map((r) => ({
          date: r.date as string,
          count: Number(r.count) || 0,
        })),
        dailyFunds: dailyFunds.rows.map((r) => ({
          date: r.date as string,
          count: Number(r.count) || 0,
        })),
      });
    } catch (err) {
      logger.error({ err }, '관리자 통계 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/admin/logs?level=all|error|warn|info&limit=100 — audit_logs 최신순. */
export function createAdminLogsHandler(pool: pg.Pool) {
  return async (req: Request, res: Response): Promise<void> => {
    const levelRaw = (req.query.level as string | undefined)?.trim().toLowerCase() || 'all';
    const level = ['error', 'warn', 'info'].includes(levelRaw) ? levelRaw : 'all';

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 500) : 100;

    try {
      const params: unknown[] = [];
      let where = '';
      if (level !== 'all') {
        params.push(level);
        where = `WHERE level = $${params.length}`;
      }
      params.push(limit);
      const result = await pool.query(
        `SELECT id, level, source, message, meta, user_id, created_at
           FROM audit_logs
           ${where}
          ORDER BY created_at DESC
          LIMIT $${params.length}`,
        params,
      );
      res.json({
        items: result.rows.map((r) => ({
          id: r.id as string,
          level: r.level as string,
          source: (r.source as string | null) ?? null,
          message: r.message as string,
          meta: r.meta ?? {},
          userId: (r.user_id as string | null) ?? null,
          createdAt: r.created_at,
        })),
      });
    } catch (err) {
      logger.error({ err }, '관리자 로그 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
