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

  // POST /api/payment-orders/:orderId/report - 입금자명 보고 (사진 업로드 X)
  router.post('/:orderId/report', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.userId!, 10);
      const orderId = parseInt(req.params.orderId, 10);
      const depositorName = req.body?.depositorName;

      const result = await service.reportPayment(userId, orderId, depositorName);
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
