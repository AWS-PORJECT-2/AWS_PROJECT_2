import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { AddressService } from '../services/address-service-impl.js';
import { AppError } from '../errors/app-error.js';

export function createAddressesHandlers(service: AddressService): Router {
  const router = Router();

  // POST /api/addresses — create
  router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const body = req.body as Record<string, unknown>;
      const label = body.label as string | undefined;
      const recipientName = body.recipientName as string | undefined;
      const recipientPhone = body.recipientPhone as string | undefined;
      const postalCode = body.postalCode as string | undefined;
      const roadAddress = body.roadAddress as string | undefined;

      if (!label || !recipientName || !recipientPhone || !postalCode || !roadAddress) {
        throw new AppError('MISSING_REQUIRED_FIELD', 'label, recipientName, recipientPhone, postalCode, roadAddress가 필요합니다');
      }

      const result = await service.create(userId, {
        label,
        recipientName,
        recipientPhone,
        postalCode,
        roadAddress,
        jibunAddress: (body.jibunAddress as string) ?? undefined,
        detailAddress: (body.detailAddress as string) ?? undefined,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/addresses — list
  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const result = await service.list(userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/addresses/:id — get single
  router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const { id } = req.params;
      const result = await service.getById(userId, id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/addresses/:id — update
  router.patch('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const { id } = req.params;
      const body = req.body as Record<string, unknown>;

      const result = await service.update(userId, id, {
        label: body.label as string | undefined,
        recipientName: body.recipientName as string | undefined,
        recipientPhone: body.recipientPhone as string | undefined,
        postalCode: body.postalCode as string | undefined,
        roadAddress: body.roadAddress as string | undefined,
        jibunAddress: body.jibunAddress as string | null | undefined,
        detailAddress: body.detailAddress as string | null | undefined,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/addresses/:id/default — setDefault
  router.patch('/:id/default', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const { id } = req.params;
      const result = await service.setDefault(userId, id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/addresses/:id — delete
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('NOT_AUTHENTICATED');

      const { id } = req.params;
      await service.delete(userId, id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
