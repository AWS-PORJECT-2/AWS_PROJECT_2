/**
 * 내 쿠폰함.
 *  GET  /api/me/coupons            보유 쿠폰 목록(미사용 우선)
 *  POST /api/me/coupons/register   { code } 공유 코드 등록 → 쿠폰함 적립
 */
import type { Request, Response } from 'express';
import type { CouponRepository } from '../repositories/coupon-repository.js';
import { couponView } from './admin-coupons.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

export function createMeCouponsHandler(couponRepo: CouponRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    try {
      const list = await couponRepo.listByOwner(userId);
      res.json({ coupons: list.map(couponView) });
    } catch (err) {
      logger.error({ err, userId }, '내 쿠폰함 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

const REASON_MSG: Record<string, string> = {
  NOT_FOUND: '존재하지 않는 쿠폰 코드예요.',
  INACTIVE: '이미 마감된(비활성) 쿠폰 코드예요.',
  EXPIRED: '등록 기간이 지난 쿠폰 코드예요.',
  FULL: '등록 인원이 모두 찬 쿠폰 코드예요.',
  ALREADY: '이미 등록한 쿠폰이에요.',
};

export function createMeCouponRegisterHandler(couponRepo: CouponRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }
    const code = typeof (req.body as Record<string, unknown>)?.code === 'string'
      ? ((req.body as Record<string, string>).code).trim().toUpperCase() : '';
    if (!code) { res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', '쿠폰 코드를 입력해 주세요'))); return; }
    try {
      const result = await couponRepo.registerCode(code, userId);
      if (!result.ok) {
        res.status(400).json({ error: 'COUPON_REGISTER_FAILED', reason: result.reason, message: REASON_MSG[result.reason] ?? '등록할 수 없는 쿠폰이에요.' });
        return;
      }
      logger.info({ userId, code, couponId: result.coupon.id }, '쿠폰 코드 등록');
      res.status(201).json({ coupon: couponView(result.coupon) });
    } catch (err) {
      logger.error({ err, userId, code }, '쿠폰 코드 등록 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
