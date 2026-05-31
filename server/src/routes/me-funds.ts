import type { Request, Response } from 'express';
import type { GroupBuyRepository, GroupBuyUpdateFields } from '../repositories/groupbuy-repository.js';
import type { FollowRepository } from '../repositories/follow-repository.js';
import type { CreatorInfo } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';
import { isValidCategory } from '../constants/categories.js';
import { MAX_IMG_CHARS, normalizeContentBlocks } from '../utils/content-blocks.js';

// ─── 본인 펀드 수정 검증 상수 — funds-create.ts / admin-funds.ts 와 동일 기준 ───
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 2000;
const MAX_VIDEO_CHARS = 48_000_000; // base64 data URL 약 36MB
const CREATOR_NAME_MAX = 20;
const CREATOR_INTRO_MAX = 300;
const CREATOR_REGION_MAX = 30;

function isValidImage(v: string): boolean {
  if (v.length === 0 || v.length > MAX_IMG_CHARS) return false;
  return /^https?:\/\//.test(v) || /^data:image\/(png|jpe?g|webp);base64,/.test(v);
}

function isValidVideo(v: string): boolean {
  if (v.length === 0 || v.length > MAX_VIDEO_CHARS) return false;
  return /^https?:\/\//.test(v) || /^data:video\/(mp4|webm|quicktime);base64,/.test(v);
}

// content_blocks 정규화 — 리치 스키마(text/image/split + variant/align/width/imageSide) 보존, 하위호환.
// funds-create / admin-funds 와 동일한 공유 normalizeContentBlocks 위임.
const parseBlocks = normalizeContentBlocks;

// 창작자 정보 검증 — funds-create.ts creatorInfoField 와 동일 상한. 유효 필드 없으면 null.
function parseCreatorInfo(v: unknown): CreatorInfo | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const info: CreatorInfo = {};
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, CREATOR_NAME_MAX) : '';
  if (name) info.name = name;
  if (typeof o.image === 'string' && isValidImage(o.image)) info.image = o.image;
  const intro = typeof o.intro === 'string' ? o.intro.trim().slice(0, CREATOR_INTRO_MAX) : '';
  if (intro) info.intro = intro;
  const sido = typeof o.sido === 'string' ? o.sido.trim().slice(0, CREATOR_REGION_MAX) : '';
  if (sido) info.sido = sido;
  const sigungu = typeof o.sigungu === 'string' ? o.sigungu.trim().slice(0, CREATOR_REGION_MAX) : '';
  if (sigungu) info.sigungu = sigungu;
  return Object.keys(info).length ? info : null;
}

/**
 * GET /api/me/funds — 내가 개설한 펀드(전 상태: pending/open/rejected/...).
 * 공개목록(GET /api/groupbuys)은 open 만 노출하므로, 창작자가 자신의 심사중/반려 펀드를 보려면 이 엔드포인트 사용.
 */
export function createMeFundsHandler(groupBuyRepo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      const { items } = await groupBuyRepo.list({ creatorId: userId, sort: 'latest', limit: 100, offset: 0 });
      const funds = items.map((g) => {
        // 금액 기준 달성(와디즈/텀블벅식, 031) — 목표 금액 폴백: (target_quantity × final_price).
        const targetAmount = (g.targetAmount && g.targetAmount > 0)
          ? g.targetAmount
          : (g.targetQuantity ?? 0) * (g.finalPrice || 0);
        const achievedAmount = g.currentAmount ?? 0;
        const rate = targetAmount > 0
          ? Math.round((achievedAmount / targetAmount) * 100)
          : ((g.targetQuantity ?? 0) > 0 ? Math.round((g.currentQuantity / (g.targetQuantity as number)) * 100) : 0);
        return {
          id: g.id,
          title: g.title,
          category: g.category ?? null,
          status: g.status,
          imageUrl: (g as { imageUrl?: string | null }).imageUrl ?? null,
          targetQuantity: g.targetQuantity,
          currentQuantity: g.currentQuantity,
          targetAmount,
          achievedAmount,
          achievementRate: rate,
          finalPrice: g.finalPrice,
          deadline: g.deadline,
          createdAt: g.createdAt,
        };
      });
      res.json({ items: funds });
    } catch (err) {
      logger.error({ err, userId }, '내 펀드 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * PATCH /api/me/funds/:id — 창작자 본인이 자기 펀드의 기본정보·스토리만 수정.
 * 본인(creatorId === req.userId)만 허용 — 아니면 404(존재 노출 방지).
 *
 * 수정 허용(화이트리스트): title, description, category, coverImageUrl, videoUrl, contentBlocks, creatorInfo.
 * 절대 수정 불가(요청에 와도 무시): rewardTiers, basePrice, designFee, finalPrice, platformFee,
 *   plan, status, deadline, targetQuantity, creatorId. (가격/수량/상태/일정은 별도 플로우·관리자 권한.)
 * 응답: 갱신된 펀드 detail(공개 상세와 동일 형태).
 */
export function createMeFundUpdateHandler(groupBuyRepo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const id = req.params.id;
    const body = (req.body ?? {}) as Record<string, unknown>;

    // 화이트리스트 필드만 추림 — 그 외 키(rewardTiers/basePrice/status/deadline/creatorId 등)는 통째로 무시.
    const fields: GroupBuyUpdateFields = {};
    const errors: string[] = [];

    if ('title' in body) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title || title.length > TITLE_MAX) errors.push('title');
      else fields.title = title;
    }
    if ('description' in body) {
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      if (description.length > DESCRIPTION_MAX) errors.push('description');
      else fields.description = description;
    }
    if ('category' in body) {
      const category = typeof body.category === 'string' ? body.category.trim() : '';
      if (!isValidCategory(category)) errors.push('category');
      else fields.category = category;
    }
    if ('coverImageUrl' in body) {
      const v = body.coverImageUrl;
      if (v == null || v === '') fields.coverImageUrl = null;
      else if (typeof v === 'string' && isValidImage(v)) fields.coverImageUrl = v;
      else errors.push('coverImageUrl');
    }
    if ('videoUrl' in body) {
      const v = body.videoUrl;
      if (v == null || v === '') fields.videoUrl = null;
      else if (typeof v === 'string' && isValidVideo(v)) fields.videoUrl = v;
      else errors.push('videoUrl');
    }
    if ('contentBlocks' in body) {
      const blocks = parseBlocks(body.contentBlocks);
      fields.contentBlocks = blocks.length ? blocks : null;
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
      const existing = await groupBuyRepo.findById(id);
      // 존재하지 않거나 본인 소유가 아니면 동일하게 404 — 타인 펀드 존재 여부 노출 방지.
      // 소프트삭제(cancelFund → status='cancelled' + deleted_at)된 펀드는 수정 불가(수정 후 getDetail null→404 혼란 방지).
      if (!existing || existing.creatorId !== userId || existing.status === 'cancelled') {
        res.status(404).json({ error: 'NOT_FOUND', message: '본인이 개설한 펀드만 수정할 수 있습니다' });
        return;
      }

      // updateFields 는 화이트리스트 컬럼만 동적 SET (creator_id/status 등은 컬럼 매핑에 없어 절대 변경 불가).
      await groupBuyRepo.updateFields(id, fields);

      // 갱신 결과는 공개 상세와 동일 형태로 반환(프론트가 곧장 상세 화면 갱신에 사용).
      const detail = await groupBuyRepo.getDetail(id, userId);
      if (!detail) { res.status(404).json({ error: 'NOT_FOUND', message: '펀드를 찾을 수 없습니다' }); return; }

      logger.info({ id, userId, fields: Object.keys(fields) }, '본인 펀드 수정');
      res.json(detail);
    } catch (err) {
      logger.error({ err, id, userId }, '본인 펀드 수정 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * GET /api/me/following-feed — 내가 팔로우한 창작자들이 올린 공개(open) 펀드 최신순.
 * query: limit, offset (선택). → { items:[<card>], total }
 * 팔로우가 없거나 공개 펀드가 없으면 { items:[], total:0 }.
 */
export function createFollowingFeedHandler(followRepo: FollowRepository, groupBuyRepo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const limit = Number(req.query.limit) || undefined;
    const offset = Number(req.query.offset) || undefined;
    try {
      const following = await followRepo.listFollowing(userId);
      const creatorIds = following.map((f) => f.userId);
      // 팔로우가 비면 DB 추가 조회 없이 즉시 빈 결과.
      if (creatorIds.length === 0) { res.json({ items: [], total: 0 }); return; }

      // following-feed 는 authRequired 라 userId 는 항상 존재 — viewer 로 isLiked 채움.
      const { total, rows } = await groupBuyRepo.findOpenByCreators(creatorIds, limit, offset, userId);
      res.json({ items: rows, total });
    } catch (err) {
      logger.error({ err, userId }, '팔로잉 피드 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/**
 * GET /api/me/funds/:id/analytics — 본인 펀드 분석(요금제 분석 기능, 023).
 * 본인 소유가 아니거나 없으면 404(존재 노출 방지).
 * → { viewCount, backerCount, confirmedCount, totalAmount, achievementRate,
 *     subscriberCount, daily:[{date, backers}] } (최근 14일 reward_orders 기준)
 */
export function createMeFundAnalyticsHandler(groupBuyRepo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const id = req.params.id;
    try {
      const analytics = await groupBuyRepo.getAnalytics(id, userId);
      // 본인 펀드가 아니거나 존재하지 않으면 동일하게 404 — 타인 펀드 분석 노출 방지.
      if (!analytics) { res.status(404).json({ error: 'NOT_FOUND', message: '본인이 개설한 펀드만 조회할 수 있습니다' }); return; }
      res.json(analytics);
    } catch (err) {
      logger.error({ err, id, userId }, '본인 펀드 분석 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/me/funds/:id/delete-request — 작성자가 본인 펀드 삭제 요청 (관리자가 처리). */
export function createFundDeleteRequestHandler(groupBuyRepo: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    try {
      const ok = await groupBuyRepo.requestDelete(req.params.id, userId, reason);
      if (!ok) { res.status(404).json({ error: 'NOT_FOUND', message: '본인이 개설한 펀드만 삭제 요청할 수 있습니다' }); return; }
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, userId }, '펀드 삭제 요청 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
