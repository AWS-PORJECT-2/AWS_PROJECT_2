import crypto from 'node:crypto';
import type { PgClient, PaymentResult } from '../interfaces/pg-client.js';
import { fetchWithTimeout } from '../utils/fetch-with-timeout.js';
import { logger } from '../logger.js';

/**
 * 토스페이먼츠 V2 API 직접 연동 클라이언트.
 *
 * 인증 방식: Basic Auth (secretKey + ':' → base64)
 * Base URL: https://api.tosspayments.com/v2
 *
 * 빌링키 흐름:
 *   1. 프론트에서 SDK로 카드 등록 → successUrl로 authKey, customerKey 전달
 *   2. 서버에서 POST /v2/billing/authorizations/issue (authKey + customerKey) → billingKey 발급
 *   3. 결제 시점에 POST /v2/billing/{billingKey} → 결제 승인
 */

const TOSS_API_BASE = 'https://api.tosspayments.com/v2';

export class TossPaymentsClient implements PgClient {
  private readonly authHeader: string;

  constructor(
    secretKey: string,
    private readonly timeoutMs: number = 10000,
  ) {
    // Basic Auth: base64(secretKey + ':')
    this.authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');
  }

  /**
   * 빌링키로 자동결제 승인.
   * POST /v2/billing/{billingKey}
   */
  async payWithBillingKey(billingKey: string, orderId: string, amount: number, orderName: string): Promise<PaymentResult> {
    try {
      const res = await this.request('POST', `/billing/${billingKey}`, {
        customerKey: orderId,  // customerKey는 빌링키 발급 시 사용한 값이어야 함
        orderId,
        orderName,
        amount,
        currency: 'KRW',
      });

      if (res.status === 'DONE' || res.status === 'APPROVED') {
        return {
          success: true,
          pgPaymentId: res.paymentKey,
          pgTransactionId: res.paymentKey,
          paidAt: res.approvedAt ?? new Date().toISOString(),
        };
      }

      return {
        success: false,
        error: { code: res.code ?? 'PAYMENT_FAILED', message: res.message ?? '결제 실패' },
      };
    } catch (err: any) {
      logger.error({ err, orderId }, '토스페이먼츠 결제 승인 오류');
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: err.message ?? '네트워크 오류' },
      };
    }
  }

  /**
   * Webhook 서명 검증 — 토스페이먼츠 v2 공식 명세.
   *
   * 알고리즘:
   * 1. HMAC 페이로드 = `${payload}:${transmissionTime}` (전송 시간 결합)
   * 2. HMAC-SHA256(secret, 페이로드) → Buffer (raw bytes)
   * 3. 수신 서명 헤더를 쉼표로 분리 → `v1:` 접두사 필터 → Base64 디코딩
   * 4. timingSafeEqual로 비교 (하나라도 일치하면 true)
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string, transmissionTime?: string): boolean {
    // HMAC 페이로드 생성 (transmissionTime이 있으면 결합)
    const hmacPayload = transmissionTime ? `${payload}:${transmissionTime}` : payload;
    const expectedBuffer = crypto.createHmac('sha256', secret).update(hmacPayload).digest();

    // 수신 서명 파싱: 쉼표로 분리 → v1: 접두사 필터 → Base64 디코딩
    const signatureParts = signature.split(',').map(s => s.trim());
    // Buffer<ArrayBufferLike> 타입 호환 — 신 node typings 와 type predicate 호환.
    const v1Signatures: Buffer[] = [];
    for (const s of signatureParts) {
      if (!s.startsWith('v1:')) continue;
      try {
        v1Signatures.push(Buffer.from(s.slice(3), 'base64'));
      } catch { /* skip invalid base64 */ }
    }

    // v1: 접두사가 없는 경우 — 레거시 hex 형식으로 fallback
    if (v1Signatures.length === 0) {
      try {
        const sigBuffer = Buffer.from(signature, 'hex');
        const expectedHex = crypto.createHmac('sha256', secret).update(payload).digest();
        if (sigBuffer.length !== expectedHex.length) return false;
        return crypto.timingSafeEqual(sigBuffer, expectedHex);
      } catch {
        return false;
      }
    }

    // v1 서명 중 하나라도 일치하면 true
    for (const sigBuffer of v1Signatures) {
      if (sigBuffer.length !== expectedBuffer.length) continue;
      try {
        if (crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return true;
      } catch {
        continue;
      }
    }

    return false;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Record<string, any>> {
    const url = `${TOSS_API_BASE}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
    };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const res = await fetchWithTimeout(url, options, this.timeoutMs);
    const text = await res.text();

    if (!text) return {};

    const json = JSON.parse(text);

    // 토스페이먼츠 에러 응답 처리
    if (!res.ok) {
      logger.warn({ status: res.status, path, error: json }, '토스페이먼츠 API 에러');
      return json;
    }

    return json;
  }
}
