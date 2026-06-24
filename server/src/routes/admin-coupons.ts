/**
 * 관리자 쿠폰 — 2종.
 *  (A) 직접 발급: POST /api/admin/coupons { email|userId, discountType, discountValue?, note?, expiresInDays? }
 *      → 대상 사용자 쿠폰함에 코드 없이 바로 적립 + 'coupon_received' 알림.
 *  (B) 쿠폰 코드 생성: POST /api/admin/coupon-codes { discountType, discountValue?, label?, maxRegistrations?, codeExpiresInDays?, couponValidDays? }
 *      → 공유 코드 발급. 사용자가 코드 입력으로 등록. GET 으로 목록 조회.
 */
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { CouponRepository } from '../repositories/coupon-repository.js';
import type { UserRepository } from '../repositories/user-repository.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import type { Coupon, CouponCode, CouponDiscountType } from '../types/index.js';
import { notify } from '../services/notify.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

function genCode(): string {
  return 'DT' + randomBytes(4).toString('hex').toUpperCase();
}
function labelFor(type: CouponDiscountType, value: number): string {
  return type === 'waive' ? '수수료 전액 면제' : `수수료 ${value}%p 할인`;
}

export function couponView(c: Coupon) {
  return {
    id: c.id,
    code: c.code ?? null,
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

export function couponCodeView(c: CouponCode) {
  return {
    id: c.id,
    code: c.code,
    label: c.label,
    discountType: c.discountType,
    discountValue: c.discountValue,
    maxRegistrations: c.maxRegistrations ?? null,
    registeredCount: c.registeredCount,
    codeExpiresAt: c.codeExpiresAt ? c.codeExpiresAt.toISOString() : null,
    couponValidDays: c.couponValidDays ?? null,
    active: c.active,
    createdAt: c.createdAt.toISOString(),
  };
}

function parseDiscount(body: Record<string, unknown>): { ok: true; type: CouponDiscountType; value: number } | { ok: false; msg: string } {
  const type: CouponDiscountType = body.discountType === 'waive' ? 'waive' : 'rate_off';
  if (type === 'waive') return { ok: true, type, value: 0 };
  const v = Math.floor(Number(body.discountValue));
  if (!Number.isFinite(v) || v < 1 || v > 100) return { ok: false, msg: '할인 %p 는 1~100 사이여야 합니다' };
  return { ok: true, type, value: v };
}
function daysToDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = Math.floor(Number(v));
  return Number.isFinite(d) && d > 0 ? new Date(Date.now() + d * 86400000) : null;
}
function posIntOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── (A) 직접 발급 ──
export function createAdminCouponIssueHandler(
  couponRepo: CouponRepository,
  userRepo: UserRepository,
  notificationRepo?: NotificationRepository,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!userId && !email) {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', '대상 사용자(email 또는 userId)가 필요합니다')));
      return;
    }
    const d = parseDiscount(body);
    if (!d.ok) { res.status(400).json(createErrorResponse(new AppError('INVALID_INPUT', d.msg))); return; }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : null;
    const expiresAt = daysToDate(body.expiresInDays);

    try {
      const target = userId ? await userRepo.findById(userId) : await userRepo.findByEmail(email);
      if (!target) { res.status(404).json({ error: 'USER_NOT_FOUND', message: '대상 사용자를 찾을 수 없습니다' }); return; }

      const label = labelFor(d.type, d.value);
      const created = await couponRepo.create({
        ownerUserId: target.id, discountType: d.type, discountValue: d.value, label,
        issuedBy: req.userId ?? null, note, expiresAt,
      });

      if (notificationRepo) {
        await notify(notificationRepo, {
          userId: target.id, type: 'coupon_received',
          title: '수수료 할인 쿠폰이 도착했어요',
          body: `'${label}' 쿠폰이 쿠폰함에 추가되었어요. 프로젝트 개설 시 사용할 수 있어요.`,
          fundId: null,
        });
      }
      logger.info({ couponId: created.id, target: target.id, issuedBy: req.userId }, '관리자 쿠폰 직접 발급');
      res.status(201).json({ coupon: couponView(created) });
    } catch (err) {
      logger.error({ err }, '쿠폰 직접 발급 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

// ── (B) 쿠폰 코드 생성 ──
export function createAdminCouponCodeCreateHandler(couponRepo: CouponRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const d = parseDiscount(body);
    if (!d.ok) { res.status(400).json(createErrorResponse(new AppError('INVALID_INPUT', d.msg))); return; }
    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 60) : labelFor(d.type, d.value);
    const maxRegistrations = posIntOrNull(body.maxRegistrations);
    const codeExpiresAt = daysToDate(body.codeExpiresInDays);
    const couponValidDays = posIntOrNull(body.couponValidDays);

    try {
      let created = null;
      for (let i = 0; i < 5 && !created; i++) {
        try {
          created = await couponRepo.createCode({
            code: genCode(), label, discountType: d.type, discountValue: d.value,
            maxRegistrations, codeExpiresAt, couponValidDays, createdBy: req.userId ?? null,
          });
        } catch (e) { if (i === 4) throw e; }
      }
      if (!created) { res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR'))); return; }
      logger.info({ codeId: created.id, code: created.code, createdBy: req.userId }, '관리자 쿠폰 코드 생성');
      res.status(201).json({ couponCode: couponCodeView(created) });
    } catch (err) {
      logger.error({ err }, '쿠폰 코드 생성 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

export function createAdminCouponCodeListHandler(couponRepo: CouponRepository) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const list = await couponRepo.listCodes(100);
      res.json({ couponCodes: list.map(couponCodeView) });
    } catch (err) {
      logger.error({ err }, '쿠폰 코드 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
