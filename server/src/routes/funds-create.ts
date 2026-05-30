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
const TARGET_QTY_MAX = 500;
const NOTE_MAX = 2000;
const PHONE_RE = /^[0-9\-+ ]{7,20}$/;

const MAX_IMG_CHARS = 12_000_000; // base64 data URL 약 8MB 상한
const MAX_BLOCKS = 40;
const MAX_TEXT_CHARS = 5000;

const MAX_TIERS = 12;
const TIER_TITLE_MAX = 60;
const TIER_DESC_MAX = 500;
const TIER_PRICE_MAX = 10_000_000;
const TIER_STOCK_MAX = 100_000;

// ─── 수수료율(서버 권위) ───
// 일반(normal): 창작자가 직접 운영 → 5%. 대리(proxy): 플랫폼이 대행 → 12%.
// platform_fee = round(finalPrice * RATE). 클라이언트가 보낸 금액은 절대 신뢰하지 않음.
const NORMAL_FEE_RATE = 0.05;
const PROXY_FEE_RATE = 0.12;

/**
 * POST /api/funds — 공구(groupbuy) 개설. mode 로 일반/대리 분기.
 * 가격/수수료는 서버 계산. → 201 { id }
 */
export function createFundsCreateHandler(groupBuyRepository: GroupBuyRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const mode = body.mode === 'proxy' ? 'proxy' : 'normal';

    try {
      const groupbuy = mode === 'proxy'
        ? buildProxy(userId, body, res)
        : buildNormal(userId, body, res);
      if (!groupbuy) return; // 에러 응답은 build* 에서 이미 보냄

      const created = await groupBuyRepository.create(groupbuy);
      logger.info({ id: created.id, userId, mode }, '공구 개설 완료');
      res.status(201).json({ id: created.id });
    } catch (err) {
      logger.error({ err, userId, mode }, '공구 개설 INSERT 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

// ─── 일반(normal) ───
function buildNormal(userId: string, body: Record<string, unknown>, res: Response): GroupBuy | null {
  const title = stringField(body.title);
  const description = stringField(body.description, '');
  const category = stringField(body.category);
  const deadline = stringField(body.deadline);
  const targetQuantity = intField(body.targetQuantity, 1, TARGET_QTY_MAX);
  const basePrice = intField(body.basePrice, 0, TIER_PRICE_MAX) ?? 0;
  const designFee = intField(body.designFee, 0, TIER_PRICE_MAX) ?? 0;
  const rewardTiers = parseRewardTiers(body.rewardTiers);
  const contentBlocks = parseBlocks(body.contentBlocks);
  // coverImageUrl 우선, 없으면 designImageDataUrl(기존 프론트 호환)
  const cover = imageField(body.coverImageUrl) ?? imageField(body.designImageDataUrl);
  const delegated = body.delegated === true; // 기존 프론트 호환 플래그

  const errors: string[] = [];
  if (!title || title.length > TITLE_MAX) errors.push('title');
  if (description && description.length > DESCRIPTION_MAX) errors.push('description');
  if (!category || !isValidCategory(category)) errors.push('category');
  if (!isValidFutureDate(deadline)) errors.push('deadline');
  if (targetQuantity === null) errors.push('targetQuantity');
  if (!rewardTiers || rewardTiers.length === 0) errors.push('rewardTiers (최소 1개의 리워드 필요)');

  if (errors.length > 0) {
    res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', `유효하지 않은 필드: ${errors.join(', ')}`)));
    return null;
  }

  const tiers = rewardTiers ?? [];
  // 대표가격 = 최저 리워드가(목록/결제 호환).
  const finalPrice = tiers.length > 0 ? Math.min(...tiers.map((t) => t.price)) : 0;
  const platformFee = Math.round(finalPrice * NORMAL_FEE_RATE);
  const firstContentImage = contentBlocks?.find((b) => b.type === 'image')?.value ?? null;
  const thumbnail = cover ?? firstContentImage;
  const now = new Date();

  return {
    id: randomUUID(),
    creatorId: userId,
    fundId: null,
    title,
    description,
    category,
    rewardTiers: tiers,
    delegated,
    feeRate: NORMAL_FEE_RATE * 100,
    productOptions: [],
    basePrice,
    designFee,
    platformFee,
    finalPrice,
    targetQuantity: targetQuantity as number,
    currentQuantity: 0,
    deadline: parseDeadline(deadline),
    status: 'pending', // 관리자 승인 전까지 비공개(심사중). 승인 시 'open'.
    designImageUrl: cover ?? thumbnail,
    tryonImageUrl: null,
    contentBlocks,
    coverImageUrl: thumbnail,
    mode: 'normal',
    createdAt: now,
    updatedAt: now,
  };
}

// ─── 대리(proxy) — 플랫폼이 비용/리워드 설정 대행 ───
function buildProxy(userId: string, body: Record<string, unknown>, res: Response): GroupBuy | null {
  const title = stringField(body.title);
  const category = stringField(body.category);
  const contactPhone = stringField(body.contactPhone);
  const requestNote = stringField(body.requestNote, '').slice(0, NOTE_MAX);
  const targetQuantity = intField(body.targetQuantity, 1, TARGET_QTY_MAX) ?? 1;
  const deadlineRaw = stringField(body.deadline);

  const errors: string[] = [];
  if (!title || title.length > TITLE_MAX) errors.push('title');
  if (!category || !isValidCategory(category)) errors.push('category');
  if (!contactPhone || !PHONE_RE.test(contactPhone)) errors.push('contactPhone');
  if (deadlineRaw && !isValidFutureDate(deadlineRaw)) errors.push('deadline');

  if (errors.length > 0) {
    res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', `유효하지 않은 필드: ${errors.join(', ')}`)));
    return null;
  }

  // 대리는 리워드/가격을 관리자가 추후 설정. 가격 0, 수수료율만 높게 기록(실제 fee 는 가격 확정 시 재계산).
  const now = new Date();
  // 마감 기본값: 미입력 시 30일 후
  const deadline = deadlineRaw ? parseDeadline(deadlineRaw) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  // 의뢰 메모/연락처를 본문 텍스트 블록으로 보존(관리자 검토용).
  const noteParts = [requestNote, `연락처: ${contactPhone}`].filter(Boolean);
  const contentBlocks: ContentBlock[] | null = noteParts.length
    ? [{ type: 'text', value: noteParts.join('\n\n') }]
    : null;

  return {
    id: randomUUID(),
    creatorId: userId,
    fundId: null,
    title,
    description: requestNote,
    category,
    rewardTiers: [],
    delegated: true,
    feeRate: PROXY_FEE_RATE * 100,
    productOptions: [],
    basePrice: 0,
    designFee: 0,
    platformFee: 0, // 가격 미확정 → 0. 관리자 리워드/가격 설정 시 재계산.
    finalPrice: 0,
    targetQuantity,
    currentQuantity: 0,
    deadline,
    status: 'pending_review', // 대리 의뢰는 관리자 검토 대기.
    designImageUrl: null,
    tryonImageUrl: null,
    contentBlocks,
    coverImageUrl: null,
    mode: 'proxy',
    createdAt: now,
    updatedAt: now,
  };
}

function stringField(v: unknown, fallback?: string): string {
  if (typeof v !== 'string') return fallback ?? '';
  return v.trim();
}

function imageField(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  if (v.length > MAX_IMG_CHARS) return null;
  const isHttp = /^https?:\/\//.test(v);
  const isDataImage = /^data:image\/(png|jpe?g|webp);base64,/.test(v);
  return (isHttp || isDataImage) ? v : null;
}

/**
 * 리워드 티어 파싱. 계약 형태({title, price, desc, stock?})와 내부 형태({description, stockLimit})
 * 양쪽 키를 모두 수용. id/soldCount 는 서버가 부여(클라 신뢰 안 함).
 */
function parseRewardTiers(v: unknown): RewardTier[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const tiers: RewardTier[] = [];
  for (const raw of v.slice(0, MAX_TIERS)) {
    if (!raw || typeof raw !== 'object') continue;
    const t = raw as Record<string, unknown>;
    const title = typeof t.title === 'string' ? t.title.trim() : '';
    const price = Number(t.price);
    if (!title || title.length > TIER_TITLE_MAX) continue;
    if (!Number.isFinite(price) || price < 0 || price > TIER_PRICE_MAX) continue;
    const descRaw = typeof t.desc === 'string' ? t.desc : (typeof t.description === 'string' ? t.description : '');
    const description = descRaw.trim().slice(0, TIER_DESC_MAX);
    const stockRaw = t.stock ?? t.stockLimit;
    let stockLimit: number | null = null;
    if (stockRaw != null && stockRaw !== '') {
      const s = Number(stockRaw);
      if (Number.isFinite(s) && s >= 1 && s <= TIER_STOCK_MAX) stockLimit = Math.floor(s);
    }
    tiers.push({ id: randomUUID(), title, price: Math.floor(price), description, stockLimit, soldCount: 0 });
  }
  return tiers.length > 0 ? tiers : null;
}

/**
 * 본문 블록 파싱. 계약 형태({type:'text', text} | {type:'image', url})와
 * 내부 형태({type, value}) 양쪽을 수용해 내부 {type, value} 로 정규화.
 */
function parseBlocks(v: unknown): ContentBlock[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const blocks: ContentBlock[] = [];
  for (const raw of v.slice(0, MAX_BLOCKS)) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, unknown>;
    if (b.type === 'text') {
      const src = typeof b.text === 'string' ? b.text : (typeof b.value === 'string' ? b.value : '');
      const text = src.trim();
      if (text) blocks.push({ type: 'text', value: text.slice(0, MAX_TEXT_CHARS) });
    } else if (b.type === 'image') {
      const src = typeof b.url === 'string' ? b.url : (typeof b.value === 'string' ? b.value : '');
      const img = imageField(src);
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

/** deadline 검증: YYYY-MM-DD(date) 또는 ISO datetime 모두 허용, 미래여야 함. */
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
