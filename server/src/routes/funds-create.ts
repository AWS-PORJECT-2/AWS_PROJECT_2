import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { GroupBuy, ContentBlock, RewardTier } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';
import { isValidCategory } from '../constants/categories.js';

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 2000;
const DEPARTMENT_MAX = 50;
const TARGET_QTY_MAX = 500;

const MAX_IMG_CHARS = 12_000_000; // base64 data URL 약 8MB 상한
const MAX_BLOCKS = 40;            // 게시글 본문 블록 최대 개수
const MAX_TEXT_CHARS = 5000;      // 텍스트 블록 1개 최대 길이

// 리워드(선물) 티어 — 가격은 창작자가 직접 설정(플랫폼 프리셋 폐지)
const MAX_TIERS = 12;
const TIER_TITLE_MAX = 60;
const TIER_DESC_MAX = 500;
const TIER_PRICE_MAX = 10_000_000;
const TIER_STOCK_MAX = 100_000;

/**
 * POST /api/funds  (펀드 = groupbuy 개설)
 * body: { title, description?, department, deadline(YYYY-MM-DD), designFee, targetQuantity,
 *         designImageDataUrl(옷 사진), tryOnImages?([모델피팅]) }
 * → groupbuys 테이블에 INSERT (status='open'), 피드(GET /api/groupbuys)에 노출됨.
 * response: 201 { id }
 */
export function createFundsCreateHandler(groupBuyRepository: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED')));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = stringField(body.title);
    const description = stringField(body.description, '');
    const department = stringField(body.department, '');
    const category = stringField(body.category);
    const deadline = stringField(body.deadline);
    const targetQuantity = intField(body.targetQuantity, 1, TARGET_QTY_MAX);
    const rewardTiers = parseRewardTiers(body.rewardTiers);
    const designImage = imageField(body.designImageDataUrl);
    const tryonImage = imageField(Array.isArray(body.tryOnImages) ? body.tryOnImages[0] : body.tryOnImageDataUrl);
    const contentBlocks = parseBlocks(body.contentBlocks);

    const errors: string[] = [];
    if (!title || title.length > TITLE_MAX) errors.push('title');
    if (description && description.length > DESCRIPTION_MAX) errors.push('description');
    if (department && department.length > DEPARTMENT_MAX) errors.push('department'); // 소속·단체는 선택
    if (!category || !isValidCategory(category)) errors.push('category');
    if (!isValidFutureDate(deadline)) errors.push('deadline');
    if (targetQuantity === null) errors.push('targetQuantity');
    if (!rewardTiers || rewardTiers.length === 0) errors.push('rewardTiers (최소 1개의 리워드 필요)');
    // 이미지는 선택: 디자인/피팅 없으면 본문 첫 이미지를 썸네일로 사용(아래). 둘 다 없어도 생성 허용.

    if (errors.length > 0) {
      res.status(400).json(createErrorResponse(
        new AppError('MISSING_REQUIRED_FIELD', `유효하지 않은 필드: ${errors.join(', ')}`),
      ));
      return;
    }

    const tiers = rewardTiers as NonNullable<typeof rewardTiers>;
    // 대표 가격 = 최저 리워드가(목록/결제 호환). 가격은 전적으로 창작자 설정.
    const finalPrice = Math.min(...tiers.map((t) => t.price));
    const now = new Date();
    // 썸네일 우선순위: 피팅 > 디자인 업로드 > 본문 첫 이미지 블록
    const firstContentImage = contentBlocks?.find((b) => b.type === 'image')?.value ?? null;
    const thumbnail = tryonImage ?? designImage ?? firstContentImage;
    const groupbuy: GroupBuy = {
      id: randomUUID(),
      creatorId: userId,
      fundId: null,
      title,
      description,
      category,
      rewardTiers: tiers,
      productOptions: [],
      basePrice: 0,
      designFee: 0,
      platformFee: 0, // 정산 수수료는 Phase 4(결제·정산)에서 별도 처리
      finalPrice,
      targetQuantity: targetQuantity as number,
      currentQuantity: 0,
      deadline: new Date(deadline + 'T23:59:59'),
      status: 'pending', // 관리자 승인 전까지 비공개(심사중). 승인 시 'open'.
      designImageUrl: designImage ?? thumbnail, // 썸네일 폴백 보장(목록 image_url COALESCE 용)
      tryonImageUrl: tryonImage,
      contentBlocks,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const created = await groupBuyRepository.create(groupbuy);
      logger.info({ id: created.id, userId, department }, '펀드(공동구매) 개설 완료');
      res.status(201).json({ id: created.id });
    } catch (err) {
      logger.error({ err, userId }, '펀드 개설 INSERT 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

function stringField(v: unknown, fallback?: string): string {
  if (typeof v !== 'string') return fallback ?? '';
  return v.trim();
}

// 이미지: http(s) URL 또는 image data URL 만, 크기 상한 적용. 그 외/초과는 null.
function imageField(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  if (v.length > MAX_IMG_CHARS) return null;
  const isHttp = /^https?:\/\//.test(v);
  const isDataImage = /^data:image\/(png|jpe?g|webp);base64,/.test(v);
  return (isHttp || isDataImage) ? v : null;
}

// 리워드(선물) 티어 검증: 서버 권위 — id/soldCount 는 서버가 부여, 가격/수량 범위 검증.
function parseRewardTiers(v: unknown): RewardTier[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const tiers: RewardTier[] = [];
  for (const t of v.slice(0, MAX_TIERS)) {
    if (!t || typeof t !== 'object') continue;
    const title = typeof t.title === 'string' ? t.title.trim() : '';
    const price = Number(t.price);
    if (!title || title.length > TIER_TITLE_MAX) continue;
    if (!Number.isFinite(price) || price < 0 || price > TIER_PRICE_MAX) continue;
    const description = typeof t.description === 'string' ? t.description.trim().slice(0, TIER_DESC_MAX) : '';
    let stockLimit: number | null = null;
    if (t.stockLimit != null && t.stockLimit !== '') {
      const s = Number(t.stockLimit);
      if (Number.isFinite(s) && s >= 1 && s <= TIER_STOCK_MAX) stockLimit = Math.floor(s);
    }
    tiers.push({ id: randomUUID(), title, price: Math.floor(price), description, stockLimit, soldCount: 0 });
  }
  return tiers.length > 0 ? tiers : null;
}

// 게시글 본문 블록 검증: 텍스트/이미지 블록 배열. 형식·크기 위반 블록은 제거.
function parseBlocks(v: unknown): ContentBlock[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const blocks: ContentBlock[] = [];
  for (const b of v.slice(0, MAX_BLOCKS)) {
    if (!b || typeof b.value !== 'string') continue;
    if (b.type === 'text') {
      const text = b.value.trim();
      if (text) blocks.push({ type: 'text', value: text.slice(0, MAX_TEXT_CHARS) });
    } else if (b.type === 'image') {
      const img = imageField(b.value);
      if (img) blocks.push({ type: 'image', value: img });
    }
  }
  return blocks.length ? blocks : null;
}

function intField(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? Math.floor(v) : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/**
 * deadline 검증: YYYY-MM-DD 형식 + 실제 존재 날짜 + 오늘보다 미래.
 */
function isValidFutureDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map((p) => Number(p));
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dt.getTime() > today.getTime();
}
