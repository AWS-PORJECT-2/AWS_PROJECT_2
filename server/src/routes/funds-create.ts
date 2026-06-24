import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { GroupBuyRepository } from '../repositories/groupbuy-repository.js';
import type { FollowRepository } from '../repositories/follow-repository.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import type { CouponRepository } from '../repositories/coupon-repository.js';
import type { GroupBuy, ContentBlock, RewardTier, CreatorInfo } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { notify, notifyMany } from '../services/notify.js';
import { logger } from '../logger.js';
import { isValidCategory } from '../constants/categories.js';
import { imageField, normalizeContentBlocks, firstHtmlImageSrc } from '../utils/content-blocks.js';

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 2000;
const TARGET_QTY_MAX = 500;
const NOTE_MAX = 2000;

// ─── 금액 기준 펀딩(와디즈/텀블벅식) — 031 ───
// 개설 시 "목표 금액 + 마감일"만 필수. 목표 금액 하한 1,000원 / 상한 100억원.
const TARGET_AMOUNT_MIN = 1_000;
const TARGET_AMOUNT_MAX = 10_000_000_000;
const PHONE_RE = /^[0-9\-+ ]{7,20}$/;

const MAX_TIERS = 12;
const TIER_TITLE_MAX = 60;
const TIER_DESC_MAX = 500;
const TIER_PRICE_MAX = 10_000_000;
const TIER_STOCK_MAX = 100_000;

// ─── 수수료율(서버 권위) ───
// 일반(normal): 창작자가 직접 운영. 요금제(plan)별 차등 수수료.
//   Start 5% / Run 9% / Boost 15%. 대리(proxy): 플랫폼이 대행 → 12%.
// platform_fee = round(finalPrice * RATE). 클라이언트가 보낸 금액은 절대 신뢰하지 않음.
const NORMAL_FEE_RATE = 0.05; // 직접개설 기본(Start) — 하위호환용 기준값
const PROXY_FEE_RATE = 0.12;

// 직접개설 요금제 → 플랫폼 수수료율. 알 수 없는 값/미지정은 'start'(5%).
const PLAN_FEE_RATE: Record<string, number> = {
  start: 0.05,
  run: 0.09,
  boost: 0.15,
};
function resolvePlan(v: unknown): 'start' | 'run' | 'boost' {
  return v === 'run' || v === 'boost' ? v : 'start';
}

// ─── 기본 정책(면책 고지) — 작성자가 정책을 입력하지 않으면 서버가 자동 첨부 ───
//  (정책 작성 단계 제거에 따라, 통신판매중개자 면책 고지를 기본값으로 강제.)
const DEFAULT_LEGAL_NOTICE =
  '두띵은 통신판매중개자로서 거래 당사자가 아니며, 본 프로젝트의 상품 정보·제작·배송 및 환불에 대한 책임은 프로젝트 창작자에게 있습니다. 두띵은 창작자와 후원자 간 거래에 대하여 어떠한 책임도 지지 않습니다.';
const DEFAULT_REFUND_POLICY =
  '목표 금액 미달 시 후원은 결제되지 않습니다. 목표 달성 후에는 제작 특성상 단순 변심에 의한 환불이 제한될 수 있으며, 환불·교환 및 관련 분쟁은 관계 법령에 따라 창작자와 후원자 간 협의로 처리됩니다.';

// 창작자 정보(creatorInfo) 검증 상한
const CREATOR_NAME_MAX = 20;
const CREATOR_INTRO_MAX = 300;
const CREATOR_REGION_MAX = 30;

// 정책(교환·반품 refundPolicy / 정보고시 legalNotice) — 스토리(contentBlocks)와 분리 저장(023).
const POLICY_MAX = 5000;

// 정책 텍스트 필드 — 문자열만, 상한 슬라이스. 빈 값은 null(과거 데이터 호환: 서버는 빈 값 허용).
function policyField(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, POLICY_MAX) : null;
}

// 공개예정 오픈 예정시각(openAt) — 미래 ISO/날짜(YYYY-MM-DD)만 허용. 과거/무효는 null.
function futureDateField(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(v);
  const dt = dateOnly ? new Date(v + 'T00:00:00') : new Date(v);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getTime() > Date.now() ? dt : null;
}

// 대표 영상(videoUrl) — data:video/(mp4|webm|quicktime);base64, 또는 http(s) URL.
// 영상 data URL 은 크므로 별도 상한(base64 약 36MB). app.ts express.json limit 은 50mb 로 상향.
const MAX_VIDEO_CHARS = 48_000_000;

function videoField(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  if (v.length > MAX_VIDEO_CHARS) return null;
  const isHttp = /^https?:\/\//.test(v);
  const isDataVideo = /^data:video\/(mp4|webm|quicktime);base64,/.test(v);
  return (isHttp || isDataVideo) ? v : null;
}

// {name,image,intro,sido,sigungu} 검증. 어느 필드도 없으면 null 반환(저장 생략).
// forceName 이 있으면 창작자 이름을 그 값(작성자 계정 이름 = nickname ?? name)으로 강제 — 클라가 보낸 name 은 무시.
// "창작자 정보의 이름은 무조건 그 사람(작성자) 이름을 따라간다" 요구사항의 서버측 강제.
function creatorInfoField(v: unknown, forceName?: string): CreatorInfo | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const info: CreatorInfo = {};
  const name = ((forceName && forceName.trim()) ? forceName : stringField(o.name)).slice(0, CREATOR_NAME_MAX);
  if (name) info.name = name;
  const image = imageField(o.image);
  if (image) info.image = image;
  const intro = stringField(o.intro).slice(0, CREATOR_INTRO_MAX);
  if (intro) info.intro = intro;
  const sido = stringField(o.sido).slice(0, CREATOR_REGION_MAX);
  if (sido) info.sido = sido;
  const sigungu = stringField(o.sigungu).slice(0, CREATOR_REGION_MAX);
  if (sigungu) info.sigungu = sigungu;
  return Object.keys(info).length ? info : null;
}

/**
 * POST /api/funds — 공구(groupbuy) 개설. mode 로 일반/대리 분기.
 * 가격/수수료는 서버 계산. → 201 { id }
 */
export function createFundsCreateHandler(
  groupBuyRepository: GroupBuyRepository,
  notificationRepo?: NotificationRepository,
  followRepo?: FollowRepository,
  couponRepo?: CouponRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const mode = body.mode === 'proxy' ? 'proxy' : 'normal';

    try {
      const groupbuy = mode === 'proxy'
        ? buildProxy(userId, body, res, req.userName)
        : buildNormal(userId, body, res, req.userName);
      if (!groupbuy) return; // 에러 응답은 build* 에서 이미 보냄

      // ── 수수료 할인 쿠폰(직접 개설만) — 보유 쿠폰 id 로 검증 후 feeRate/platformFee 재계산 ──
      //   feeRate 는 percent 로 저장(예: 5). waive=0%, rate_off=max(0, 현재-차감%p).
      const couponId = mode === 'normal' && typeof body.couponId === 'string' ? body.couponId.trim() : '';
      let couponApplied: { label: string; feeRate: number } | null = null;
      let appliedCouponId = '';
      if (couponId && couponRepo) {
        const coupon = await couponRepo.findById(couponId);
        const expired = coupon?.expiresAt ? coupon.expiresAt.getTime() <= Date.now() : false;
        if (!coupon || coupon.ownerUserId !== userId || coupon.status !== 'unused' || expired) {
          res.status(400).json(createErrorResponse(new AppError('INVALID_INPUT', '사용할 수 없는 쿠폰이에요. 보유·사용 여부·유효기간을 확인해 주세요.')));
          return;
        }
        const curPercent = groupbuy.feeRate ?? 0; // 이미 percent
        const newPercent = coupon.discountType === 'waive' ? 0 : Math.max(0, curPercent - coupon.discountValue);
        groupbuy.feeRate = newPercent;
        groupbuy.platformFee = Math.round(groupbuy.finalPrice * (newPercent / 100));
        couponApplied = { label: coupon.label, feeRate: newPercent };
        appliedCouponId = coupon.id;
      }

      const created = await groupBuyRepository.create(groupbuy);
      logger.info({ id: created.id, userId, mode, coupon: appliedCouponId || undefined }, '공구 개설 완료');

      // 쿠폰 사용 처리(원자적) — create 성공 후. 실패(경합)해도 생성은 유지.
      if (couponApplied && appliedCouponId && couponRepo) {
        const used = await couponRepo.markUsedById(appliedCouponId, userId, created.id);
        if (!used) logger.warn({ userId, couponId: appliedCouponId, fundId: created.id }, '쿠폰 사용 처리 실패(경합 가능) — 할인은 적용됨');
      }

      // 알림(best-effort) — 응답 전에 보내되 실패는 흡수(notify/notifyMany 가 throw 안 함).
      if (notificationRepo) {
        // (a) 작성자 본인 — 제출/심사 중.
        await notify(notificationRepo, {
          userId,
          type: 'fund_submitted',
          title: '프로젝트가 제출되어 심사 중입니다',
          body: `'${created.title}' 프로젝트가 접수되었어요. 심사가 끝나면 알려드릴게요.`,
          fundId: created.id,
        });
        // (b) 작성자를 팔로우한 사용자들 — 새 프로젝트 소식.
        if (followRepo) {
          try {
            const followers = await followRepo.listFollowers(userId);
            await notifyMany(notificationRepo, followers.map((f) => f.userId), {
              type: 'creator_new_fund',
              title: '팔로우한 창작자가 새 프로젝트를 열었어요',
              body: `'${created.title}' 프로젝트를 확인해 보세요.`,
              fundId: created.id,
            });
          } catch (err) {
            logger.warn({ err, userId, fundId: created.id }, '팔로워 새 프로젝트 알림 실패(무시)');
          }
        }
      }

      res.status(201).json(couponApplied ? { id: created.id, couponApplied } : { id: created.id });
    } catch (err) {
      logger.error({ err, userId, mode }, '공구 개설 INSERT 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

// ─── 일반(normal) ───
function buildNormal(userId: string, body: Record<string, unknown>, res: Response, creatorName?: string): GroupBuy | null {
  const title = stringField(body.title);
  const description = stringField(body.description, '');
  const category = stringField(body.category);
  const deadline = stringField(body.deadline);
  // 금액 기준 펀딩(031): targetAmount(원) 필수. targetQuantity 는 선택(없으면 NULL).
  const targetAmount = intField(body.targetAmount, TARGET_AMOUNT_MIN, TARGET_AMOUNT_MAX);
  const targetQuantity = intField(body.targetQuantity, 1, TARGET_QTY_MAX); // 선택/파생
  const basePrice = intField(body.basePrice, 0, TIER_PRICE_MAX) ?? 0;
  const designFee = intField(body.designFee, 0, TIER_PRICE_MAX) ?? 0;
  const rewardTiers = parseRewardTiers(body.rewardTiers);
  const contentBlocks = parseBlocks(body.contentBlocks);
  // coverImageUrl 우선, 없으면 designImageDataUrl(기존 프론트 호환)
  const cover = imageField(body.coverImageUrl) ?? imageField(body.designImageDataUrl);
  const delegated = body.delegated === true; // 기존 프론트 호환 플래그
  const plan = resolvePlan(body.plan);        // start|run|boost (수수료율 5/9/15%)
  const videoUrl = videoField(body.videoUrl); // 대표 영상(선택)
  const creatorInfo = creatorInfoField(body.creatorInfo, creatorName); // 창작자 정보 — 이름은 작성자 계정 이름으로 강제
  // 정책: 스토리(contentBlocks)에 합치지 않고 별도 컬럼에 저장(023). 빈 값 허용(과거 데이터 호환).
  // 정책 단계 제거 — 작성자가 안 보내면 기본 면책 고지를 자동 첨부(서버 권위).
  const refundPolicy = policyField(body.refundPolicy) ?? DEFAULT_REFUND_POLICY;
  const legalNotice = policyField(body.legalNotice) ?? DEFAULT_LEGAL_NOTICE;
  // 공개예정 일시(plan 이 run|boost 이고 미래일 때만) — 값은 저장하되, 공개예정 전환은 '관리자 승인 후'에만 일어난다.
  //  (신규 펀드는 무조건 pending 으로 들어가 심사를 거치고, 승인 시 openAt 이 미래면 scheduled, 아니면 open 으로 전환.)
  const openAt = (plan === 'run' || plan === 'boost') ? futureDateField(body.openAt) : null;

  const errors: string[] = [];
  if (!title || title.length > TITLE_MAX) errors.push('title');
  if (description && description.length > DESCRIPTION_MAX) errors.push('description');
  if (!category || !isValidCategory(category)) errors.push('category');
  if (!isValidFutureDate(deadline)) errors.push('deadline');
  // 금액 기준 펀딩: 목표 금액 필수(1,000~100억원). targetQuantity 는 더 이상 필수 아님(선택).
  if (targetAmount === null) errors.push('targetAmount (목표 금액 필수, 1000원 이상)');
  if (!rewardTiers || rewardTiers.length === 0) errors.push('rewardTiers (최소 1개의 리워드 필요)');

  if (errors.length > 0) {
    res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', `유효하지 않은 필드: ${errors.join(', ')}`)));
    return null;
  }

  // 안전장치(서버 강제) — 리워드로 모을 수 있는 "최대 금액"(가격 × 한정 수량 합)이 목표 금액 이상이어야 함(클라 우회 방지).
  //  예) 목표 100만 / 1만원×50개 + 2만원×50개 = 150만 → 통과. (가격만 합치면 3만으로 잘못 막힘.)
  //  무제한(stockLimit=null) 리워드가 하나라도 있으면 상한이 없어 어떤 목표든 도달 가능 → 통과.
  const hasUnlimitedTier = (rewardTiers ?? []).some((t) => t.stockLimit == null);
  const rewardCapacity = (rewardTiers ?? []).reduce(
    (s, t) => s + (t.stockLimit == null ? 0 : (Number(t.price) || 0) * t.stockLimit),
    0,
  );
  if (targetAmount !== null && !hasUnlimitedTier && rewardCapacity < (targetAmount as number)) {
    res.status(400).json(createErrorResponse(new AppError('INVALID_INPUT', '리워드로 모을 수 있는 최대 금액(가격 × 수량)이 목표 금액보다 적습니다. 한정 수량을 늘리거나 가격을 조정해 주세요.')));
    return null;
  }
  // 공개 예정(openAt)이 있으면 마감일보다 앞서야 함(모집 일정이 더 길어야 함).
  if (openAt && new Date(openAt).getTime() >= parseDeadline(deadline).getTime()) {
    res.status(400).json(createErrorResponse(new AppError('INVALID_INPUT', '공개 예정 일시는 마감일보다 앞서야 합니다.')));
    return null;
  }

  const tiers = rewardTiers ?? [];
  // 대표가격 = 최저 리워드가(목록/결제 호환).
  const finalPrice = tiers.length > 0 ? Math.min(...tiers.map((t) => t.price)) : 0;
  // 요금제(plan)별 수수료율 — Start 5% / Run 9% / Boost 15%. 서버에서만 결정.
  const feeRate = PLAN_FEE_RATE[plan] ?? NORMAL_FEE_RATE;
  const platformFee = Math.round(finalPrice * feeRate);
  const firstContentImage = firstBlockImage(contentBlocks);
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
    feeRate: feeRate * 100,
    productOptions: [],
    basePrice,
    designFee,
    platformFee,
    finalPrice,
    // 금액 기준 펀딩(031): 목표 금액이 핵심. 목표 수량은 선택(없으면 NULL). 달성 금액 캐시는 0으로 시작.
    targetAmount: targetAmount as number,
    currentAmount: 0,
    targetQuantity: targetQuantity, // null 허용(선택)
    currentQuantity: 0,
    deadline: parseDeadline(deadline),
    // 신규 펀드는 항상 pending(관리자 승인 전 비공개) — openAt 유무와 무관. 승인 시 admin 핸들러가 scheduled/open 결정.
    status: 'pending',
    designImageUrl: cover ?? thumbnail,
    tryonImageUrl: null,
    contentBlocks,
    coverImageUrl: thumbnail,
    mode: 'normal',
    plan,
    videoUrl,
    creatorInfo,
    openAt,
    refundPolicy, // 정책: 스토리와 분리된 별도 컬럼
    legalNotice,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── 대리(proxy) — 플랫폼이 비용/리워드 설정 대행 ───
function buildProxy(userId: string, body: Record<string, unknown>, res: Response, creatorName?: string): GroupBuy | null {
  const title = stringField(body.title);
  const category = stringField(body.category);
  const contactPhone = stringField(body.contactPhone);
  const requestNote = stringField(body.requestNote, '').slice(0, NOTE_MAX);
  const targetQuantity = intField(body.targetQuantity, 1, TARGET_QTY_MAX) ?? 1;
  // 대리 의뢰도 목표 금액(선택) 수용 — 있으면 그대로 저장, 없으면 NULL(관리자가 가격 확정 시 설정).
  const targetAmount = intField(body.targetAmount, TARGET_AMOUNT_MIN, TARGET_AMOUNT_MAX);
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
  // 의뢰 메모/연락처를 본문 텍스트 블록으로 보존(관리자 검토용) + 첨부 이미지(있으면).
  const noteParts = [requestNote, `연락처: ${contactPhone}`].filter(Boolean);
  const blocks: ContentBlock[] = [];
  if (noteParts.length) blocks.push({ type: 'text', value: noteParts.join('\n\n') });
  if (Array.isArray(body.attachments)) {
    for (const raw of (body.attachments as unknown[]).slice(0, 6)) {
      const img = imageField(raw);
      if (img) blocks.push({ type: 'image', value: img });
    }
  }
  const contentBlocks: ContentBlock[] | null = blocks.length ? blocks : null;
  // 대리 의뢰에도 대표 영상/창작자 정보/정책은 선택 허용(있으면 저장).
  const videoUrl = videoField(body.videoUrl);
  const creatorInfo = creatorInfoField(body.creatorInfo, creatorName); // 이름은 작성자 계정 이름으로 강제
  const refundPolicy = policyField(body.refundPolicy);
  const legalNotice = policyField(body.legalNotice);

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
    // 대리: 목표 금액은 선택(있으면 저장). 달성 금액 캐시는 0.
    targetAmount: targetAmount ?? null,
    currentAmount: 0,
    targetQuantity,
    currentQuantity: 0,
    deadline,
    status: 'pending_review', // 대리 의뢰는 관리자 검토 대기.
    designImageUrl: null,
    tryonImageUrl: null,
    contentBlocks,
    coverImageUrl: null,
    mode: 'proxy',
    plan: 'start', // 대리는 요금제 개념 없음 — 기본값.
    videoUrl,
    creatorInfo,
    openAt: null, // 대리는 공개예정 개념 없음.
    refundPolicy,
    legalNotice,
    createdAt: now,
    updatedAt: now,
  };
}

function stringField(v: unknown, fallback?: string): string {
  if (typeof v !== 'string') return fallback ?? '';
  return v.trim();
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
 * 본문 블록 파싱(리치 스키마, 하위호환) — 공유 normalizeContentBlocks 위임.
 * text/image/split 타입별로 스타일·정렬·크기·좌우배치를 보존하고 빈/무효 블록은 제외.
 * 빈 배열은 null 로(저장 생략) 반환해 기존 계약 유지.
 */
function parseBlocks(v: unknown): ContentBlock[] | null {
  const blocks = normalizeContentBlocks(v);
  return blocks.length ? blocks : null;
}

// 본문 블록에서 첫 이미지 URL 추출(썸네일 폴백).
// image 블록은 value, split 블록은 image, html 블록은 본문 첫 <img src> 를 추출(imageField 검증 통과분만).
function firstBlockImage(blocks: ContentBlock[] | null): string | null {
  if (!blocks) return null;
  for (const b of blocks) {
    if (b.type === 'image') return b.value;
    if (b.type === 'split') return b.image;
    if (b.type === 'html') {
      const src = firstHtmlImageSrc(b.html);
      const img = src ? imageField(src) : null;
      if (img) return img;
    }
  }
  return null;
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
