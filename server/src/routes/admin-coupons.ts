/**
 * 관리자 쿠폰 발급 — 특정 사용자에게 수수료 할인 쿠폰을 지급한다.
 *  POST /api/admin/coupons   { email | userId, discountType, discountValue?, note?, expiresInDays? }
 *  GET  /api/admin/coupons   최근 발급 내역
 * 발급 시 사용자 쿠폰함에 적립되고 'coupon_received' 알림이 발송된다.
 */
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { CouponRepository } from '../repositories/coupon-repository.js';
import type { UserRepository } from '../repositories/user-repository.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import type { CouponDiscountType } from '../types/index.js';
import { notify } from '../services/notify.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

function genCode(): string {
  // DT + 8 hex (대문자) — 사람이 입력 가능한 충분히 유일한 코드.
  return 'DT' + randomBytes(4).toString('hex').toUpperCase();
}

function labelFor(type: CouponDiscountType, value: number): string {
  return type === 'waive' ? '수수료 전액 면제' : `수수료 ${value}%p 할인`;
}

export function couponView(c: {
  id: string; code: string; discountType: CouponDiscountType; discountValue: number;
  label: string; status: string; note?: string | null; expiresAt?: Date | null;
  createdAt: Date; usedAt?: Date | null; usedGroupbuyId?: string | null; ownerUserId?: string;
}) {
  return {
    id: c.id,
    code: c.code,
    discountType: c.discountType,
    discountValue: c.discountValue,
    label: c.label,
    status: c.status,
    note: c.note ?? null,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    usedAt: c.usedAt ? c.usedAt.toISOString() : null,
  };
}

export function createAdminCouponIssueHandler(
  couponRepo: CouponRepository,
  userRepo: UserRepository,
  notificationRepo?: NotificationRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // 대상 사용자 — userId 또는 email 로 지정.
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!userId && !email) {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', '대상 사용자(email 또는 userId)가 필요합니다')));
      return;
    }

    // 할인 유형/값
    const discountType: CouponDiscountType = body.discountType === 'waive' ? 'waive' : 'rate_off';
    let discountValue = 0;
    if (discountType === 'rate_off') {
      const v = Math.floor(Number(body.discountValue));
      if (!Number.isFinite(v) || v < 1 || v > 100) {
        res.status(400).json(createErrorResponse(new AppError('INVALID_INPUT', '할인 %p 는 1~100 사이여야 합니다')));
        return;
      }
      discountValue = v;
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : null;
    let expiresAt: Date | null = null;
    if (body.expiresInDays != null && body.expiresInDays !== '') {
      const days = Math.floor(Number(body.expiresInDays));
      if (Number.isFinite(days) && days > 0) expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    try {
      const target = userId ? await userRepo.findById(userId) : await userRepo.findByEmail(email);
      if (!target) {
        res.status(404).json({ error: 'USER_NOT_FOUND', message: '대상 사용자를 찾을 수 없습니다' });
        return;
      }

      const label = labelFor(discountType, discountValue);

      // 코드 충돌 대비 몇 회 재시도.
      let created = null;
      for (let i = 0; i < 5 && !created; i++) {
        try {
          created = await couponRepo.create({
            code: genCode(),
            ownerUserId: target.id,
            discountType,
            discountValue,
            label,
            issuedBy: req.userId ?? null,
            note,
            expiresAt,
          });
        } catch (e) {
          if (i === 4) throw e; // 마지막까지 실패하면 상위로
        }
      }
      if (!created) {
        res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
        return;
      }

      // 알림(best-effort)
      if (notificationRepo) {
        await notify(notificationRepo, {
          userId: target.id,
          type: 'coupon_received',
          title: '수수료 할인 쿠폰이 도착했어요',
          body: `'${label}' 쿠폰(${created.code})이 쿠폰함에 추가되었어요. 프로젝트 개설 시 사용할 수 있어요.`,
          fundId: null,
        });
      }

      logger.info({ couponId: created.id, target: target.id, issuedBy: req.userId, discountType, discountValue }, '관리자 쿠폰 발급');
      res.status(201).json({ coupon: couponView(created) });
    } catch (err) {
      logger.error({ err }, '쿠폰 발급 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

export function createAdminCouponListHandler(couponRepo: CouponRepository) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const list = await couponRepo.listRecent(100);
      res.json({ coupons: list.map(couponView) });
    } catch (err) {
      logger.error({ err }, '쿠폰 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
