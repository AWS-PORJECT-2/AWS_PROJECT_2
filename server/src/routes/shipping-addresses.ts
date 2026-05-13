import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { ShippingAddressService, ServiceError } from '../services/shipping-address-service.js';

export function createShippingAddressesRouter(service: ShippingAddressService): Router {
  const router = Router();

  // GET /api/shipping-addresses
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.userId!, 10);
      const list = await service.list(userId);
      res.json(list);
    } catch (err) {
      handle(err, res, next);
    }
  });

  // POST /api/shipping-addresses
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.userId!, 10);
      const b = req.body ?? {};
      const required = ['label', 'recipientName', 'recipientPhone', 'postalCode', 'roadAddress'];
      for (const k of required) {
        if (!b[k] || typeof b[k] !== 'string' || !b[k].trim()) {
          res.status(400).json({ error: 'MISSING_REQUIRED_FIELD', message: `${k} 가 필요합니다` });
          return;
        }
      }

      const created = await service.create(userId, {
        label: String(b.label).trim(),
        recipientName: String(b.recipientName).trim(),
        recipientPhone: String(b.recipientPhone).trim(),
        postalCode: String(b.postalCode).trim(),
        roadAddress: String(b.roadAddress).trim(),
        jibunAddress: b.jibunAddress ? String(b.jibunAddress) : null,
        detailAddress: b.detailAddress ? String(b.detailAddress) : null,
        isDefault: b.isDefault === true,
      });
      res.status(201).json(created);
    } catch (err) {
      handle(err, res, next);
    }
  });

  // PATCH /api/shipping-addresses/:id
  router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.userId!, 10);
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'INVALID_ID', message: 'id가 올바르지 않습니다' });
        return;
      }
      const b = req.body ?? {};
      const updated = await service.update(userId, id, {
        label: b.label,
        recipientName: b.recipientName,
        recipientPhone: b.recipientPhone,
        postalCode: b.postalCode,
        roadAddress: b.roadAddress,
        jibunAddress: b.jibunAddress,
        detailAddress: b.detailAddress,
      });
      res.json(updated);
    } catch (err) {
      handle(err, res, next);
    }
  });

  // PATCH /api/shipping-addresses/:id/default
  router.patch('/:id/default', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.userId!, 10);
      const id = parseInt(req.params.id, 10);
      const updated = await service.setDefault(userId, id);
      res.json(updated);
    } catch (err) {
      handle(err, res, next);
    }
  });

  // DELETE /api/shipping-addresses/:id
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.userId!, 10);
      const id = parseInt(req.params.id, 10);
      await service.delete(userId, id);
      res.status(204).end();
    } catch (err) {
      handle(err, res, next);
    }
  });

  return router;
}

function handle(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof ServiceError) {
    res.status(err.httpStatus).json({ error: err.code, message: err.message });
    return;
  }
  next(err);
}
