import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PaymentOrderService } from '../services/payment-order-service.js';

export function createPaymentOrdersRouter(service: PaymentOrderService): Router {
  const router = Router();

  // POST /api/payment-orders - 주문 생성
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.userId!, 10);
      const result = await service.createOrder(userId, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/payment-orders/:orderId/confirm-request - 입금 확인 요청 (사진 없음)
  // 입금자명만 받아서 상태를 WAITING_FOR_CONFIRM 으로 변경
  router.post('/:orderId/confirm-request', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.userId!, 10);
      const orderId = parseInt(req.params.orderId, 10);
      const depositorName = String(req.body?.depositorName || '').trim();

      if (!depositorName) {
        res.status(400).json({ error: 'MISSING_REQUIRED_FIELD', message: '입금자명을 입력해주세요' });
        return;
      }

      const result = await service.requestConfirm(userId, orderId, depositorName);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/payment-orders/:orderId
  router.get('/:orderId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.userId!, 10);
      const orderId = parseInt(req.params.orderId, 10);
      const result = await service.getOrderDetail(userId, orderId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/payment-orders
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.userId!, 10);
      const result = await service.getUserOrders(userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function createAdminPaymentOrdersRouter(service: PaymentOrderService): Router {
  const router = Router();

  // GET /api/admin/payment-orders/pending
  router.get('/pending', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await service.getPendingOrders();
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // PATCH /api/admin/payment-orders/:orderId/confirm
  router.patch('/:orderId/confirm', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminId = parseInt(req.userId!, 10);
      const orderId = parseInt(req.params.orderId, 10);
      const result = await service.confirmPayment(adminId, orderId, req.body ?? {});
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
