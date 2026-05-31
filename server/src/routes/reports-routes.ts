import type { Request, Response } from 'express';
import type { ReportRepository } from '../repositories/report-repository.js';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { UserRepository } from '../repositories/user-repository.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import type { ReportStatus } from '../types/index.js';
import { isReportTargetType, isReportReasonCategory } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { notify } from '../services/notify.js';
import { logger } from '../logger.js';

const DETAIL_MAX = 1000;

/**
 * POST /api/reports — 메이커/게시글 신고(인증 필수).
 * body { targetType:'maker'|'project', targetId, reasonCategory, detail? }
 *  - reasonCategory 가 'etc'(기타) 면 detail 필수.
 *  - 본인이 본인(maker)을 신고하는 것은 막는다.
 *  - 대상 존재 여부는 best-effort 확인(없으면 404, 조회 실패는 통과시켜 접수).
 *  - 중복 신고는 허용(반복 신고 자체는 관리자 판단에 맡김).
 */
export function createReportCreateHandler(
  reportRepo: ReportRepository,
  groupBuyRepo: GroupBuyRepository,
  userRepo: UserRepository,
  notificationRepo?: NotificationRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const targetType = body.targetType;
    const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : '';
    const reasonCategory = body.reasonCategory;
    const detail = typeof body.detail === 'string' ? body.detail.trim().slice(0, DETAIL_MAX) : '';

    if (!isReportTargetType(targetType) || !targetId) {
      res.status(400).json({ error: 'INVALID', message: 'targetType/targetId 가 필요합니다' });
      return;
    }
    if (!isReportReasonCategory(reasonCategory)) {
      res.status(400).json({ error: 'INVALID', message: '신고 사유를 선택해 주세요' });
      return;
    }
    if (reasonCategory === 'etc' && !detail) {
      res.status(400).json({ error: 'DETAIL_REQUIRED', message: '기타 사유는 상세 내용을 입력해 주세요' });
      return;
    }

    try {
      // 대상 존재/소유자 확인(best-effort) + 본인 자기신고 차단.
      if (targetType === 'maker') {
        if (targetId === userId) {
          res.status(400).json({ error: 'SELF_REPORT', message: '본인은 신고할 수 없습니다' });
          return;
        }
        let maker = null;
        try { maker = await userRepo.findById(targetId); } catch { /* 조회 실패는 무시(접수 허용) */ }
        if (maker === null) {
          // findById 가 정상 동작했고 없으면 404. (조회 자체가 throw 면 위에서 null 이 아니라 catch 로 흡수)
          res.status(404).json({ error: 'NOT_FOUND', message: '신고 대상을 찾을 수 없습니다' });
          return;
        }
      } else {
        let fund = null;
        try { fund = await groupBuyRepo.findById(targetId); } catch { /* 조회 실패는 무시(접수 허용) */ }
        if (fund === null) {
          res.status(404).json({ error: 'NOT_FOUND', message: '신고 대상을 찾을 수 없습니다' });
          return;
        }
        // 자기 게시글 신고 차단(창작자 본인).
        if (fund.creatorId === userId) {
          res.status(400).json({ error: 'SELF_REPORT', message: '본인 게시글은 신고할 수 없습니다' });
          return;
        }
      }

      await reportRepo.create({
        reporterId: userId,
        targetType,
        targetId,
        reasonCategory,
        detail: detail || null,
      });

      logger.info({ userId, targetType, targetId, reasonCategory }, '신고 접수');

      // 신고 접수 알림(best-effort) — 신고자 본인에게. (관리자 알림은 pending-counts 배지로 대체.)
      if (notificationRepo) {
        await notify(notificationRepo, {
          userId,
          type: 'report_received',
          title: '신고가 접수되었습니다',
          body: '신고가 정상적으로 접수되었어요. 검토 후 조치하겠습니다.',
          fundId: targetType === 'project' ? targetId : null,
        });
      }

      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, userId, targetType, targetId }, '신고 접수 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/admin/reports?status= — 관리자 신고 목록(상태 필터 선택). */
export function createAdminReportsListHandler(reportRepo: ReportRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const statusRaw = (req.query.status as string | undefined)?.trim();
    const status: ReportStatus | undefined =
      statusRaw === 'open' || statusRaw === 'resolved' || statusRaw === 'dismissed' ? statusRaw : undefined;
    try {
      const items = await reportRepo.listForAdmin(status);
      res.json({
        items: items.map((r) => ({
          id: r.id,
          targetType: r.targetType,
          targetId: r.targetId,
          targetLabel: r.targetLabel,
          reasonCategory: r.reasonCategory,
          detail: r.detail,
          status: r.status,
          reporterNickname: r.reporterNickname,
          createdAt: r.createdAt.toISOString(),
          resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
        })),
      });
    } catch (err) {
      logger.error({ err }, '관리자 신고 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/admin/reports/:id/resolve — 신고 처리(resolved/dismissed). */
export function createAdminReportResolveHandler(reportRepo: ReportRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const adminId = req.userId;
    if (!adminId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const id = req.params.id;
    const status = (req.body ?? {}).status;
    if (status !== 'resolved' && status !== 'dismissed') {
      res.status(400).json({ error: 'INVALID', message: "status 는 'resolved' 또는 'dismissed' 여야 합니다" });
      return;
    }
    try {
      const updated = await reportRepo.resolve(id, status, adminId);
      if (!updated) {
        res.status(409).json({ error: 'INVALID_STATE', message: '미처리(open) 상태의 신고만 처리할 수 있습니다' });
        return;
      }
      logger.info({ id, adminId, status }, '관리자 신고 처리');
      res.json({ id: updated.id, status: updated.status });
    } catch (err) {
      logger.error({ err, id }, '관리자 신고 처리 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
