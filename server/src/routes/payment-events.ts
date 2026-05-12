import type { Request, Response, NextFunction } from 'express';
import type { PaymentService } from '../interfaces/payment-service.js';
import { AppError } from '../errors/app-error.js';

/**
 * GET /api/admin/payments/:id/events  (관리자 전용)
 *
 * ⚠️ 결제 raw payload (PG 응답·내부 status·금액) 가 노출되므로 admin 만 접근 가능.
 *    user 테이블에 role 컬럼이 아직 없으므로 임시로 ADMIN_EMAILS 환경변수 (쉼표 구분)
 *    화이트리스트로 가드. role 컬럼 도입 후엔 req.userRole === 'admin' 으로 교체.
 */
function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS ?? '';
  const list = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export function createPaymentEventsHandler(paymentService: PaymentService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new AppError('NOT_AUTHENTICATED');
      }

      if (!isAdmin(req.userEmail)) {
        throw new AppError('FORBIDDEN', '관리자만 접근 가능합니다');
      }

      const paymentId = req.params.id;
      if (!paymentId) {
        throw new AppError('MISSING_REQUIRED_FIELD', 'paymentId가 필요합니다');
      }

      const events = await paymentService.getPaymentEvents(paymentId);
      res.status(200).json({ events });
    } catch (err) {
      next(err);
    }
  };
}
