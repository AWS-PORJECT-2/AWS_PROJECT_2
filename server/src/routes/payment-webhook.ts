import type { Request, Response } from 'express';
import type { PaymentService } from '../interfaces/payment-service.js';
import type { PgClient } from '../interfaces/pg-client.js';
import { logger } from '../logger.js';

/**
 * 웹훅 핸들러 — Raw Body 기반 HMAC 검증.
 *
 * app.ts에서 express.raw({ type: 'application/json' })로 등록되므로
 * req.body는 Buffer 타입이다. JSON.stringify를 사용하지 않고
 * PG사가 보낸 원본 바이트 그대로 HMAC 검증에 사용한다.
 */
export function createPaymentWebhookHandler(paymentService: PaymentService, pgClient: PgClient, webhookSecret: string) {
  return async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['tosspayments-webhook-signature'] as string | undefined;
    const transmissionTime = req.headers['tosspayments-webhook-transmission-time'] as string | undefined;

    // req.body는 Buffer (express.raw 미들웨어에 의해)
    const rawBuffer: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const rawBody = rawBuffer.toString('utf8');

    if (!signature) {
      logger.warn('Webhook: Toss Payments 웹훅 서명 헤더 누락');
      res.status(400).json({ error: 'INVALID_WEBHOOK_SIGNATURE', message: 'Toss Payments 웹훅 서명 헤더가 누락되었습니다' });
      return;
    }

    // Step 1: 원본 바이트로 HMAC 검증 (transmissionTime 결합)
    const isValid = pgClient.verifyWebhookSignature(rawBody, signature, webhookSecret, transmissionTime ?? undefined);
    if (!isValid) {
      logger.warn({ signature, transmissionTime }, 'Webhook: Toss Payments 서명 검증 실패');
      res.status(400).json({ error: 'INVALID_WEBHOOK_SIGNATURE', message: '유효하지 않은 웹훅 서명입니다' });
      return;
    }

    // Step 2: 검증 성공 후에만 JSON 파싱
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      logger.warn('Webhook: JSON 파싱 실패');
      res.status(400).json({ error: 'INVALID_PAYLOAD', message: '유효하지 않은 JSON입니다' });
      return;
    }

    // 5초 내 응답 보장
    res.status(200).json({ received: true });

    // Step 3: 비즈니스 로직 처리
    try {
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
