import type { Request, Response } from 'express';
import type { PaymentService } from '../interfaces/payment-service.js';
import type { PgClient } from '../interfaces/pg-client.js';
import { logger } from '../logger.js';

export function createPaymentWebhookHandler(paymentService: PaymentService, pgClient: PgClient, webhookSecret: string) {
  return async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['x-portone-signature'] as string | undefined;
    const rawBody = JSON.stringify(req.body);

    if (!signature) {
      logger.warn('Webhook: 서명 헤더 누락');
      res.status(400).json({ error: 'INVALID_WEBHOOK_SIGNATURE', message: '서명이 누락되었습니다' });
      return;
    }

    const isValid = pgClient.verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      logger.warn({ signature }, 'Webhook: 유효하지 않은 서명');
      res.status(400).json({ error: 'INVALID_WEBHOOK_SIGNATURE', message: '유효하지 않은 웹훅 서명입니다' });
      return;
    }

    // Respond immediately with 200
    res.status(200).json({ received: true });

    // Process event asynchronously
    try {
      const body = req.body as Record<string, unknown>;
      const eventType = body.type as string;
      const data = body.data as Record<string, unknown> | undefined;
      const pgTransactionId = (data?.pgTxId ?? data?.transactionId ?? '') as string;

      if (eventType && pgTransactionId) {
        await paymentService.handleWebhookEvent(eventType, pgTransactionId, body);
      }
    } catch (err) {
      logger.error({ err }, 'Webhook: 이벤트 처리 실패');
    }
  };
}
