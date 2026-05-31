import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { GroupBuyRepository, GroupBuyUpdateFields } from '../repositories/groupbuy-repository.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import type { RewardTier, CreatorInfo } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';
import { pool } from '../db.js';
import { notify } from '../services/notify.js';
import { logAudit } from '../services/audit-log.js';
import { isValidCategory } from '../constants/categories.js';
import { MAX_IMG_CHARS, normalizeContentBlocks } from '../utils/content-blocks.js';

// 관리자 리워드 입력 검증 — id/soldCount 는 서버 부여, 가격/수량 범위 검증.
function sanitizeTiers(v: unknown): RewardTier[] {
  if (!Array.isArray(v)) return [];
  const out: RewardTier[] = [];
  for (const t of v.slice(0, 12)) {
    if (!t || typeof t !== 'object') continue;
    const title = typeof t.title === 'string' ? t.title.trim().slice(0, 60) : '';
    const price = Number(t.price);
    if (!title || !Number.isFinite(price) || price < 0 || price > 10_000_000) continue;
    let stockLimit: number | null = null;
    if (t.stockLimit != null && t.stockLimit !== '') {
      const s = Number(t.stockLimit);
      if (Number.isFinite(s) && s >= 1 && s <= 100_000) stockLimit = Math.floor(s);
    }
    out.push({
      id: randomUUID(), title, price: Math.floor(price),
      description: typeof t.description === 'string' ? t.description.trim().slice(0, 500) : '',
      stockLimit, soldCount: 0,
    });
  }
  return out;
}

/**
 * 관리자 펀드 심사 핸들러.
 * authRequired + requireAdmin 뒤에 마운트.
 *   GET  /api/admin/funds?status=pending  심사 대기/상태별 목록
 *   POST /api/admin/funds/:id/approve      승인 → status 'open'(공개)
 *   POST /api/admin/funds/:id/reject       반려 → status 'rejected'
 */
export function createAdminFundsListHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const status = (req.query.status as string | undefined)?.trim() || 'pending';
    try {
      const { items, total } = await repo.list({ status, sort: 'latest', limit: 100, offset: 0 });
      const funds = items.map((g) => ({
        id: g.id,
        title: g.title,
        category: g.category ?? null,
        status: g.status,
        creatorId: g.creatorId,
        authorName: (g as { authorName?: string | null }).authorName ?? null,
        imageUrl: (g as { imageUrl?: string | null }).imageUrl ?? null,
        delegated: g.delegated ?? false,
        mode: g.mode ?? 'normal',
        rewardCount: (g.rewardTiers ?? []).length,
        targetQuantity: g.targetQuantity,
        finalPrice: g.finalPrice,
        deadline: g.deadline,
        createdAt: g.createdAt,
      }));
      res.json({ items: funds, total });
    } catch (err) {
      logger.error({ err }, '관리자 펀드 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

function createReviewHandler(
  repo: GroupBuyRepository,
  next: 'open' | 'rejected',
  label: string,
  notificationRepo?: NotificationRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    try {
      const fund = await repo.findById(id);
      if (!fund) {
        res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '펀드를 찾을 수 없습니다' });
        return;
      }
      // 일반 펀드는 'pending', 대리개설(proxy) 의뢰는 'pending_review' 로 들어온다. 둘 다 심사 대기로 취급.
      if (fund.status !== 'pending' && fund.status !== 'pending_review') {
        res.status(409).json({ error: 'INVALID_STATE', message: `심사 대기 상태만 ${label}할 수 있습니다 (현재: ${fund.status})` });
        return;
      }
      await repo.updateStatus(id, next);
      logger.info({ id, adminId: req.userId, next }, `관리자 펀드 ${label}`);
      void logAudit(pool, { level: 'info', source: 'admin', message: `펀드 ${label}`, meta: { fundId: id, next }, userId: req.userId ?? null });

      // 알림(best-effort) — 심사 결과를 창작자에게. notify()/실패는 흡수돼 메인 응답에 영향 없음.
      if (notificationRepo && fund.creatorId) {
        if (next === 'open') {
          await notify(notificationRepo, {
            userId: fund.creatorId,
            type: 'fund_approved',
            title: '프로젝트가 공개되었어요',
            body: `심사가 완료되어 '${fund.title}' 프로젝트가 공개되었습니다.`,
            fundId: id,
          });
        } else {
          await notify(notificationRepo, {
            userId: fund.creatorId,
            type: 'fund_rejected',
            title: '프로젝트가 반려되었어요',
            body: `'${fund.title}' 프로젝트가 반려되었습니다. 내용을 보완해 다시 제출해 주세요.`,
            fundId: id,
          });
        }
      }

      res.json({ id, status: next });
    } catch (err) {
      logger.error({ err, id }, `관리자 펀드 ${label} 실패`);
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

export const createAdminFundApproveHandler = (repo: GroupBuyRepository, notificationRepo?: NotificationRepository) =>
  createReviewHandler(repo, 'open', '승인', notificationRepo);
export const createAdminFundRejectHandler = (repo: GroupBuyRepository, notificationRepo?: NotificationRepository) =>
  createReviewHandler(repo, 'rejected', '반려', notificationRepo);

// ─── 관리자 펀드 편집(대리개설 대행 작성) 검증 상수 — funds-create.ts 와 동일 기준 유지 ───
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 2000;
const TARGET_QTY_MAX = 500;
const PRICE_MAX = 10_000_000;

function isValidImage(v: string): boolean {
  if (v.length === 0 || v.length > MAX_IMG_CHARS) return false;
  return /^https?:\/\//.test(v) || /^data:image\/(png|jpe?g|webp);base64,/.test(v);
}

// 대표 영상 — funds-create.ts videoField 와 동일 기준.
const MAX_VIDEO_CHARS = 48_000_000;
function isValidVideo(v: string): boolean {
  if (v.length === 0 || v.length > MAX_VIDEO_CHARS) return false;
  return /^https?:\/\//.test(v) || /^data:video\/(mp4|webm|quicktime);base64,/.test(v);
}

// 창작자 정보 검증 — funds-create.ts creatorInfoField 와 동일 상한. 어느 필드도 없으면 null.
function parseCreatorInfo(v: unknown): CreatorInfo | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const info: CreatorInfo = {};
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 20) : '';
  if (name) info.name = name;
  if (typeof o.image === 'string' && isValidImage(o.image)) info.image = o.image;
  const intro = typeof o.intro === 'string' ? o.intro.trim().slice(0, 300) : '';
  if (intro) info.intro = intro;
  const sido = typeof o.sido === 'string' ? o.sido.trim().slice(0, 30) : '';
  if (sido) info.sido = sido;
  const sigungu = typeof o.sigungu === 'string' ? o.sigungu.trim().slice(0, 30) : '';
  if (sigungu) info.sigungu = sigungu;
  return Object.keys(info).length ? info : null;
}

/** deadline 검증: YYYY-MM-DD 또는 ISO datetime, 미래여야 함(funds-create 와 동일). */
function isValidFutureDate(s: string): boolean {
  if (!s) return false;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dt = dateOnly ? new Date(s + 'T23:59:59') : new Date(s);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getTime() > Date.now();
}
function parseDeadline(s: string): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  return dateOnly ? new Date(s + 'T23:59:59') : new Date(s);
}

// content_blocks 정규화 — 리치 스키마(text/image/split + variant/align/width/imageSide) 보존, 하위호환.
// funds-create / me-funds 와 동일한 공유 normalizeContentBlocks 위임.
const parseBlocks = normalizeContentBlocks;

/**
 * PATCH /api/admin/funds/:id — 관리자가 (대리개설 의뢰 등) 펀드를 대신 작성/수정.
 * body 에 제공된 필드만 갱신. creatorId 는 절대 변경 안 함(의뢰자 유지).
 * 갱신 가능: title, category, description, basePrice, designFee, coverImageUrl,
 *           contentBlocks, deadline, targetQuantity.
 */
export function createAdminFundUpdateHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fields: GroupBuyUpdateFields = {};
    const errors: string[] = [];

    if ('title' in body) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title || title.length > TITLE_MAX) errors.push('title');
      else fields.title = title;
    }
    if ('category' in body) {
      const category = typeof body.category === 'string' ? body.category.trim() : '';
      if (!isValidCategory(category)) errors.push('category');
      else fields.category = category;
    }
    if ('description' in body) {
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      if (description.length > DESCRIPTION_MAX) errors.push('description');
      else fields.description = description;
    }
    if ('basePrice' in body) {
      const n = Number(body.basePrice);
      if (!Number.isFinite(n) || n < 0 || n > PRICE_MAX) errors.push('basePrice');
      else fields.basePrice = Math.floor(n);
    }
    if ('designFee' in body) {
      const n = Number(body.designFee);
      if (!Number.isFinite(n) || n < 0 || n > PRICE_MAX) errors.push('designFee');
      else fields.designFee = Math.floor(n);
    }
    if ('coverImageUrl' in body) {
      const v = body.coverImageUrl;
      if (v == null || v === '') fields.coverImageUrl = null;
      else if (typeof v === 'string' && isValidImage(v)) fields.coverImageUrl = v;
      else errors.push('coverImageUrl');
    }
    if ('contentBlocks' in body) {
      const blocks = parseBlocks(body.contentBlocks);
      fields.contentBlocks = blocks.length ? blocks : null;
    }
    if ('deadline' in body) {
      const d = typeof body.deadline === 'string' ? body.deadline.trim() : '';
      if (!isValidFutureDate(d)) errors.push('deadline');
      else fields.deadline = parseDeadline(d);
    }
    if ('targetQuantity' in body) {
      const n = Number(body.targetQuantity);
      if (!Number.isFinite(n) || Math.floor(n) < 1 || Math.floor(n) > TARGET_QTY_MAX) errors.push('targetQuantity');
      else fields.targetQuantity = Math.floor(n);
    }
    if ('plan' in body) {
      const p = typeof body.plan === 'string' ? body.plan.trim() : '';
      if (p === 'start' || p === 'run' || p === 'boost') fields.plan = p;
      else errors.push('plan');
    }
    if ('videoUrl' in body) {
      const v = body.videoUrl;
      if (v == null || v === '') fields.videoUrl = null;
      else if (typeof v === 'string' && isValidVideo(v)) fields.videoUrl = v;
      else errors.push('videoUrl');
    }
    if ('creatorInfo' in body) {
      const v = body.creatorInfo;
      if (v == null) fields.creatorInfo = null;
      else fields.creatorInfo = parseCreatorInfo(v); // 유효 필드만 추림(없으면 null)
    }

    if (errors.length > 0) {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', `유효하지 않은 필드: ${errors.join(', ')}`)));
      return;
    }

    try {
      const existing = await repo.findById(id);
      if (!existing) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '펀드를 찾을 수 없습니다' }); return; }

      const updated = await repo.updateFields(id, fields);
      if (!updated) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '펀드를 찾을 수 없습니다' }); return; }

      logger.info({ id, adminId: req.userId, fields: Object.keys(fields) }, '관리자 펀드 편집');
      void logAudit(pool, { level: 'info', source: 'admin', message: '펀드 편집', meta: { fundId: id, fields: Object.keys(fields) }, userId: req.userId ?? null });

      res.json({
        id: updated.id,
        title: updated.title,
        category: updated.category ?? null,
        status: updated.status,
        creatorId: updated.creatorId,
        delegated: updated.delegated ?? false,
        mode: updated.mode ?? 'normal',
        description: updated.description,
        basePrice: updated.basePrice,
        designFee: updated.designFee,
        finalPrice: updated.finalPrice,
        targetQuantity: updated.targetQuantity,
        coverImageUrl: updated.coverImageUrl ?? null,
        contentBlocks: updated.contentBlocks ?? [],
        plan: updated.plan ?? 'start',
        videoUrl: updated.videoUrl ?? null,
        creatorInfo: updated.creatorInfo ?? null,
        deadline: updated.deadline instanceof Date ? updated.deadline.toISOString() : updated.deadline,
        updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      });
    } catch (err) {
      logger.error({ err, id }, '관리자 펀드 편집 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/admin/funds/:id/rewards — (대리 펀딩 등) 관리자가 리워드/대표가격 설정 */
export function createAdminSetRewardsHandler(repo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    const tiers = sanitizeTiers((req.body ?? {}).rewardTiers);
    if (tiers.length === 0) { res.status(400).json({ error: 'NO_TIERS', message: '유효한 리워드를 1개 이상 입력하세요' }); return; }
    try {
      const fund = await repo.findById(id);
      if (!fund) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '펀드를 찾을 수 없습니다' }); return; }
      const finalPrice = Math.min(...tiers.map((t) => t.price));
      await repo.updateRewards(id, tiers, finalPrice);
      logger.info({ id, adminId: req.userId, tiers: tiers.length }, '관리자 리워드 설정');
      res.json({ id, rewardTiers: tiers, finalPrice });
    } catch (err) {
      logger.error({ err, id }, '관리자 리워드 설정 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** GET /api/admin/fund-delete-requests — 삭제 요청된 펀드 목록 */
export function createAdminDeleteRequestsHandler(repo: GroupBuyRepository) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({ items: await repo.listDeleteRequests() });
    } catch (err) {
      logger.error({ err }, '삭제 요청 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * POST /api/admin/funds/:id/delete — 펀드 삭제 처리 + 후원 취소/환불 안내.
 * confirmed(입금완료) 후원은 실제 송금 환불이 필요하므로 목록으로 반환.
 */
export function createAdminFundDeleteHandler(
  repo: GroupBuyRepository,
  rewardOrderRepo: {
    cancelAllForFund: (fundId: string) => Promise<{ refundable: unknown[]; cancelledCount: number }>;
    countUnrefundedConfirmedForFund: (fundId: string) => Promise<number>;
  },
  notificationRepo?: NotificationRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    try {
      // 삭제 전에 제목·창작자를 확보 — cancelFund 이후엔 조회가 안 될 수 있으므로 알림용으로 미리 캡처.
      const fund = await repo.findById(id);
      if (!fund) { res.status(404).json({ error: 'GROUPBUY_NOT_FOUND', message: '펀드를 찾을 수 없습니다' }); return; }

      // #6 가드 — 환불되지 않은 confirmed(입금완료) 후원이 있으면 삭제 금지.
      //   awaiting_deposit(미입금) 만 있으면 환불 불필요 → cancelAllForFund 가 정리하므로 삭제 허용.
      const unrefunded = await rewardOrderRepo.countUnrefundedConfirmedForFund(id);
      if (unrefunded > 0) {
        res.status(409).json({
          error: 'REFUND_REQUIRED',
          message: '환불되지 않은 후원자가 있어 삭제할 수 없어요. 후원 건을 먼저 환불·취소해 주세요.',
          unrefunded,
        });
        return;
      }

      const result = await rewardOrderRepo.cancelAllForFund(id);
      await repo.cancelFund(id);
      logger.info({ id, adminId: req.userId, cancelled: result.cancelledCount, refundable: result.refundable.length }, '관리자 펀드 삭제 처리');
      void logAudit(pool, { level: 'info', source: 'admin', message: '펀드 삭제 처리', meta: { fundId: id, cancelledBackings: result.cancelledCount, refundable: result.refundable.length }, userId: req.userId ?? null });

      // 알림(best-effort) — 창작자에게 삭제 사실 통지. 미리 캡처한 fund.title/creatorId 사용.
      if (notificationRepo && fund.creatorId) {
        await notify(notificationRepo, {
          userId: fund.creatorId,
          type: 'fund_deleted',
          title: '프로젝트가 삭제되었어요',
          body: `'${fund.title}' 프로젝트가 관리자에 의해 삭제되었습니다.`,
          fundId: id,
        });
      }

      res.json({ id, status: 'cancelled', cancelledBackings: result.cancelledCount, refundable: result.refundable });
    } catch (err) {
      logger.error({ err, id }, '펀드 삭제 처리 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
