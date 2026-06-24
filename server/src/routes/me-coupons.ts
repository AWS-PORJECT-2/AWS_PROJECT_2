/**
 * 내 쿠폰함 — GET /api/me/coupons
 * 본인이 보유한 수수료 할인 쿠폰 목록(미사용 우선, 최신순).
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
