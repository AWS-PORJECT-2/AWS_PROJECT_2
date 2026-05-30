import type { Request, Response, NextFunction } from 'express';
import type { OrderRepository } from '../repositories/order-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

// Delivery Tracker API (오픈소스, 무료)
const TRACKER_API_BASE = 'https://apis.tracker.delivery/carriers';

export interface TrackingEvent {
  time: string;
  status: string;
  location: string;
  description: string;
}

export interface TrackingResult {
  carrierId: string;
  trackingNumber: string;
  status: string;
  events: TrackingEvent[];
}

/**
 * GET /api/orders/:id/tracking
 * 주문의 운송장 번호로 택배 추적 정보 조회
 */
export function createOrderTrackingHandler(orderRepo: OrderRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED')));
      return;
    }

    const { id } = req.params;
    let order;
    try { order = await orderRepo.findById(id); }
    catch (err) { next(err); return; } // DB 오류 → errorHandler 위임(무한로딩 방지)

    if (!order) {
      res.status(404).json(createErrorResponse(new AppError('ORDER_NOT_FOUND')));
      return;
    }

    if (order.userId !== userId) {
      res.status(403).json({ error: 'FORBIDDEN', message: '해당 주문에 대한 권한이 없습니다' });
      return;
    }

    if (!order.carrierId || !order.trackingNumber) {
      res.status(400).json({ error: 'NO_TRACKING_INFO', message: '아직 운송장 정보가 등록되지 않았습니다' });
      return;
    }

    try {
      const trackingUrl = `${TRACKER_API_BASE}/${encodeURIComponent(order.carrierId)}/tracks/${encodeURIComponent(order.trackingNumber)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(trackingUrl, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn({ carrierId: order.carrierId, trackingNumber: order.trackingNumber, status: response.status }, '택배 추적 API 실패');
        res.status(502).json({ error: 'TRACKING_UNAVAILABLE', message: '배송 조회 서비스에 연결할 수 없습니다' });
        return;
      }

      const data = await response.json() as Record<string, unknown>;

      // Delivery Tracker API 응답 파싱
      const events: TrackingEvent[] = Array.isArray(data.progresses)
        ? (data.progresses as Array<Record<string, unknown>>).map((p) => ({
            time: String((p.time as string) || ''),
            status: String(((p.status as Record<string, unknown>)?.text as string) || p.status || ''),
            location: String(((p.location as Record<string, unknown>)?.name as string) || ''),
            description: String((p.description as string) || ''),
          }))
        : [];

      const result: TrackingResult = {
        carrierId: order.carrierId,
        trackingNumber: order.trackingNumber,
        status: String(((data.state as Record<string, unknown>)?.text as string) || order.status),
        events,
      };

      res.json(result);
    } catch (err) {
      logger.error({ err, orderId: id }, '택배 추적 조회 실패');
      res.status(502).json({ error: 'TRACKING_UNAVAILABLE', message: '배송 조회 서비스에 연결할 수 없습니다' });
    }
  };
}

/**
 * PATCH /api/orders/:id/tracking
 * 운송장 번호 등록/수정 (관리자 또는 주문 소유자)
 * body: { carrierId: string, trackingNumber: string }
 */
export function createOrderTrackingUpdateHandler(orderRepo: OrderRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED')));
        return;
      }

      const { id } = req.params;
      const { carrierId, trackingNumber } = req.body as { carrierId?: string; trackingNumber?: string };

      if (!carrierId || !trackingNumber) {
        res.status(400).json({ error: 'MISSING_REQUIRED_FIELD', message: 'carrierId와 trackingNumber가 필요합니다' });
        return;
      }

      const order = await orderRepo.findById(id);
      if (!order) {
        res.status(404).json(createErrorResponse(new AppError('ORDER_NOT_FOUND')));
        return;
      }

      if (order.userId !== userId) {
        res.status(403).json({ error: 'FORBIDDEN', message: '해당 주문에 대한 권한이 없습니다' });
        return;
      }

      await orderRepo.updateTracking(id, carrierId, trackingNumber);
      logger.info({ orderId: id, carrierId, trackingNumber }, '운송장 등록');
      res.json({ success: true, carrierId, trackingNumber });
    } catch (err) {
      next(err); // DB 오류 → errorHandler 위임(무한로딩 방지)
    }
  };
}
