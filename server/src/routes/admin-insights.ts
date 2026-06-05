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
      const [usersRow, fundsRow, ordersRow, topCats, dailySignups, dailyFunds, likesRow, refundsRow, reportsRow] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE created_at >= date_trunc('day', NOW()))::int AS new_today,
            COUNT(*) FILTER (WHERE created_at >= date_trunc('week', NOW()))::int AS new_this_week,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new7d,
            COUNT(*) FILTER (WHERE role = 'ADMIN')::int AS admins
          FROM "user"
        `),
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'open')::int      AS open,
            COUNT(*) FILTER (WHERE status = 'pending')::int   AS pending_review,
            COUNT(*) FILTER (WHERE status = 'pending_review')::int AS proxy_review,
            COUNT(*) FILTER (WHERE status = 'rejected')::int  AS rejected,
            COUNT(*) FILTER (WHERE status = 'achieved')::int  AS achieved,
            COUNT(*) FILTER (WHERE status = 'failed')::int    AS failed,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
            COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
            COUNT(*) FILTER (WHERE delete_requested = TRUE)::int AS delete_requested
          FROM groupbuys
        `),
        // GMV/주문: reward_orders 실결제(paid[모의결제] + 구 무통장 confirmed) 기준.
        //   awaiting = 결제 대기(예약 pledged/재시도 payment_failed + 구 awaiting_deposit) 건수 — "확정/대기" 분해용.
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status IN ('paid','confirmed'))::int AS paid,
            COUNT(*) FILTER (WHERE status IN ('pledged','payment_failed','awaiting_deposit'))::int AS awaiting,
            COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','confirmed')), 0)::bigint AS gmv
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
        // 총 좋아요(찜) 수 — project_likes(026). 미적용 DB 방어: to_regclass 로 존재 시에만 집계.
        pool.query(`
          SELECT CASE WHEN to_regclass('public.project_likes') IS NULL THEN 0
                      ELSE (SELECT COUNT(*)::int FROM project_likes) END AS total
        `),
        // 환불 대기 — reward_orders 취소 신청(status='cancel_requested') 중 아직 환불표시 안 된 건.
        //   (구 refunds 테이블은 미사용 결제계열 — 운영 환불 흐름은 reward_orders.refunded_at 기준.)
        pool.query(`
          SELECT COUNT(*)::int AS pending
            FROM reward_orders
           WHERE status = 'cancel_requested' AND refunded_at IS NULL
        `),
        // 신고 대기 — reports.status='open'(027). 미적용 DB 방어.
        pool.query(`
          SELECT CASE WHEN to_regclass('public.reports') IS NULL THEN 0
                      ELSE (SELECT COUNT(*)::int FROM reports WHERE status = 'open') END AS open
        `),
      ]);

      const u = usersRow.rows[0] ?? {};
      const f = fundsRow.rows[0] ?? {};
      const o = ordersRow.rows[0] ?? {};
      const likes = likesRow.rows[0] ?? {};
      const refunds = refundsRow.rows[0] ?? {};
      const reportsAgg = reportsRow.rows[0] ?? {};

      res.json({
        users: {
          total: Number(u.total) || 0,
          newToday: Number(u.new_today) || 0,
          newThisWeek: Number(u.new_this_week) || 0,
          new7d: Number(u.new7d) || 0,
          admins: Number(u.admins) || 0,
        },
        funds: {
          total: Number(f.total) || 0,
          open: Number(f.open) || 0,
          // pending_review: status='pending'(일반 심사대기) — 기존 계약 유지(프론트 호환).
          pending_review: Number(f.pending_review) || 0,
          // proxyReview: status='pending_review'(대리개설 의뢰 심사대기) — 신규 분리 지표.
          proxyReview: Number(f.proxy_review) || 0,
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
          awaiting: Number(o.awaiting) || 0,
          gmv: Number(o.gmv) || 0,
        },
        likes: {
          total: Number(likes.total) || 0,
        },
        refunds: {
          pending: Number(refunds.pending) || 0,
        },
        reports: {
          open: Number(reportsAgg.open) || 0,
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

/**
 * GET /api/admin/pending-counts — 관리자 사이드바 배지용 단일 집계.
 * 가벼운 COUNT 쿼리들만. 신규 테이블(reports 등)은 to_regclass 로 미적용 DB 에서도 0 안전.
 *   { fundsReview, proxy, deposits, deletes, reports, chatUnread, logsNew }
 */
export function createAdminPendingCountsHandler(pool: pg.Pool) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const [fundsRow, ordersRow, chatRow, reportsRow, logsRow] = await Promise.all([
        // 심사대기(status='pending')와 대리개설 의뢰(status='pending_review')를 한 번에.
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'pending')::int        AS funds_review,
            COUNT(*) FILTER (WHERE status = 'pending_review')::int AS proxy,
            COUNT(*) FILTER (WHERE delete_requested = TRUE)::int   AS deletes
          FROM groupbuys
        `),
        // 입금 대기(미확정) 주문 수 + 취소 신청 대기 주문 수(#4).
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'awaiting_deposit')::int AS deposits,
            COUNT(*) FILTER (WHERE status = 'cancel_requested')::int AS order_cancels
          FROM reward_orders
        `),
        // 관리자가 안 읽은 문의 메시지 합계(방별 unread_admin_count 합).
        pool.query(`SELECT COALESCE(SUM(unread_admin_count), 0)::int AS chat_unread FROM chat_rooms`),
        // 미처리 신고 수(reports 미적용 DB 방어).
        pool.query(`
          SELECT CASE WHEN to_regclass('public.reports') IS NULL THEN 0
                      ELSE (SELECT COUNT(*)::int FROM reports WHERE status = 'open') END AS reports
        `),
        // 최근 24시간 내 신규 에러 로그 수(운영 모니터링용 배지).
        pool.query(`
          SELECT CASE WHEN to_regclass('public.audit_logs') IS NULL THEN 0
                      ELSE (SELECT COUNT(*)::int FROM audit_logs
                             WHERE level = 'error' AND created_at >= NOW() - INTERVAL '24 hours'
                               AND acknowledged_at IS NULL) END AS logs_new
        `),
      ]);

      const f = fundsRow.rows[0] ?? {};
      res.json({
        fundsReview: Number(f.funds_review) || 0,
        proxy: Number(f.proxy) || 0,
        deposits: Number(ordersRow.rows[0]?.deposits) || 0,
        orderCancels: Number(ordersRow.rows[0]?.order_cancels) || 0,
        deletes: Number(f.deletes) || 0,
        reports: Number(reportsRow.rows[0]?.reports) || 0,
        chatUnread: Number(chatRow.rows[0]?.chat_unread) || 0,
        logsNew: Number(logsRow.rows[0]?.logs_new) || 0,
      });
    } catch (err) {
      logger.error({ err }, '관리자 대기 카운트 조회 실패');
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
        `SELECT id, level, source, message, meta, user_id, created_at, acknowledged_at
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
          acknowledgedAt: (r.acknowledged_at as string | null) ?? null,
        })),
      });
    } catch (err) {
      logger.error({ err }, '관리자 로그 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/admin/logs/:id/ack — 오류 로그 확인 처리(배지 logsNew 에서 제외 + 목록 '확인됨' 표시). 멱등. */
export function createAdminLogAckHandler(pool: pg.Pool) {
  return async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    try {
      const result = await pool.query(
        `UPDATE audit_logs SET acknowledged_at = COALESCE(acknowledged_at, NOW()), acknowledged_by = COALESCE(acknowledged_by, $2)
           WHERE id = $1
         RETURNING acknowledged_at`,
        [id, req.userId ?? null],
      );
      res.json({ ok: true, id, acknowledgedAt: result.rows[0]?.acknowledged_at ?? null });
    } catch (err) {
      logger.error({ err, id }, '관리자 로그 확인 처리 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/admin/logs/ack-all — 미확인 에러 로그 일괄 확인(로그 탭 진입 시 자동 호출, 알림식). 멱등. */
export function createAdminLogAckAllHandler(pool: pg.Pool) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await pool.query(
        `UPDATE audit_logs SET acknowledged_at = NOW(), acknowledged_by = $1
           WHERE level = 'error' AND acknowledged_at IS NULL`,
        [req.userId ?? null],
      );
      res.json({ ok: true, acknowledged: result.rowCount ?? 0 });
    } catch (err) {
      logger.error({ err }, '관리자 로그 일괄 확인 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
