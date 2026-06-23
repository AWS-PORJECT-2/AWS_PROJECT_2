import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createAiTryOnHandler } from './ai-try-on.js';
import type { PointService, SpendResult, PointBalance } from '../interfaces/point-service.js';
import type { GeminiImageService, ImageInput } from '../services/ai/gemini-image-service.js';
import type { PointTransaction } from '../types/index.js';
import { SPEND_COSTS } from '../types/index.js';
import { AppError } from '../errors/app-error.js';

// 8.4 AI 제어흐름 단위 테스트 - 가상피팅(try-on)
// 요구사항 5.2(차감 성공 후에만 AI 실행), 5.5(잔액 부족 → 402 + 메시지·AI 미실행),
// 5.2 역흐름(AI 실패 시 환불 1회).

const USER_ID = 'user-1';
const VALID_IMAGE = 'data:image/png;base64,AAAA';

function makeSpendTransaction(): PointTransaction {
  return {
    id: 'tx-spend-tryon-1',
    userId: USER_ID,
    type: 'spend',
    reason: 'ai_tryon',
    amount: SPEND_COSTS.ai_tryon,
    balanceAfter: 0,
    requestId: 'req-1',
    createdAt: new Date(),
  };
}

interface CapturedRes {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  get statusCode(): number;
  get body(): unknown;
}

function createMockRes(): CapturedRes {
  let statusCode = 200;
  let body: unknown;
  const res = {} as Response;
  const status = vi.fn((code: number) => {
    statusCode = code;
    return res;
  });
  const json = vi.fn((payload: unknown) => {
    body = payload;
    return res;
  });
  res.status = status as unknown as Response['status'];
  res.json = json as unknown as Response['json'];
  return {
    res,
    status,
    json,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

function createMockReq(body: Record<string, unknown>) {
  return { userId: USER_ID, body } as unknown as Request;
}

function createUnauthReq(body: Record<string, unknown>) {
  return { body } as unknown as Request;
}

function createMockPointService(spendResult: SpendResult): {
  service: PointService;
  spend: ReturnType<typeof vi.fn>;
  refund: ReturnType<typeof vi.fn>;
} {
  const balance: PointBalance = { userId: USER_ID, points: spendResult.balanceAfter };
  const spend = vi.fn(async () => spendResult);
  const refund = vi.fn(async () => balance);
  const service: PointService = {
    earnOnce: vi.fn(async () => balance),
    spend: spend as unknown as PointService['spend'],
    refund: refund as unknown as PointService['refund'],
    getBalance: vi.fn(async () => balance),
    getTransactions: vi.fn(async () => []),
  };
  return { service, spend, refund };
}

function createMockGemini(impl: () => Promise<ImageInput>): {
  gemini: GeminiImageService;
  generateTryOn: ReturnType<typeof vi.fn>;
} {
  const generateTryOn = vi.fn(impl);
  const gemini = {
    generateBlueprint: vi.fn(),
    generateTryOn,
  } as unknown as GeminiImageService;
  return { gemini, generateTryOn };
}

describe('createAiTryOnHandler 제어흐름', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(a) 차감 성공(ok=true) 시에만 gemini.generateTryOn 이 호출되고 성공 응답을 반환한다 (요구사항 5.2)', async () => {
    const { service, spend, refund } = createMockPointService({
      ok: true,
      balanceAfter: 0,
      transaction: makeSpendTransaction(),
    });
    const { gemini, generateTryOn } = createMockGemini(async () => ({
      mimeType: 'image/png',
      base64: 'RESULT',
    }));
    const handler = createAiTryOnHandler(gemini, 5000, service);
    const req = createMockReq({ blueprintDataUrl: VALID_IMAGE });
    const res = createMockRes();

    await handler(req, res.res);

    expect(spend).toHaveBeenCalledTimes(1);
    expect(spend).toHaveBeenCalledWith(USER_ID, 'ai_tryon', SPEND_COSTS.ai_tryon, expect.any(String));
    expect(generateTryOn).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ tryOnDataUrl: 'data:image/png;base64,RESULT' });
    expect(refund).not.toHaveBeenCalled();
  });

  it('(b) 잔액 부족(ok=false) 시 402 INSUFFICIENT_POINTS 응답하고 AI 를 호출하지 않는다 (요구사항 5.5)', async () => {
    const { service, refund } = createMockPointService({ ok: false, balanceAfter: 50 });
    const { gemini, generateTryOn } = createMockGemini(async () => ({
      mimeType: 'image/png',
      base64: 'RESULT',
    }));
    const handler = createAiTryOnHandler(gemini, 5000, service);
    const req = createMockReq({ blueprintDataUrl: VALID_IMAGE });
    const res = createMockRes();

    await handler(req, res.res);

    expect(generateTryOn).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    const body = res.body as { error: string; message: string };
    expect(body.error).toBe('INSUFFICIENT_POINTS');
    expect(body.message).toBe('포인트가 부족하여 생성할 수 없습니다');
    expect(refund).not.toHaveBeenCalled();
  });

  it('(c) 차감 성공 후 AI 가 throw 하면 refund 가 정확히 1회(원거래 id) 호출되고 에러 응답을 반환한다 (요구사항 5.2 역흐름)', async () => {
    const tx = makeSpendTransaction();
    const { service, refund } = createMockPointService({ ok: true, balanceAfter: 0, transaction: tx });
    const { gemini, generateTryOn } = createMockGemini(async () => {
      throw new AppError('AI_UNAVAILABLE');
    });
    const handler = createAiTryOnHandler(gemini, 5000, service);
    const req = createMockReq({ blueprintDataUrl: VALID_IMAGE });
    const res = createMockRes();

    await handler(req, res.res);

    expect(generateTryOn).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith(USER_ID, 'ai_tryon', SPEND_COSTS.ai_tryon, tx.id);
    expect(res.status).toHaveBeenCalledWith(503);
    const body = res.body as { error: string };
    expect(body.error).toBe('AI_UNAVAILABLE');
  });

  it('인증되지 않은 요청(userId 없음)은 401 을 반환하고 차감을 시도하지 않는다', async () => {
    const { service, spend } = createMockPointService({ ok: true, balanceAfter: 0, transaction: makeSpendTransaction() });
    const { gemini, generateTryOn } = createMockGemini(async () => ({ mimeType: 'image/png', base64: 'RESULT' }));
    const handler = createAiTryOnHandler(gemini, 5000, service);
    const req = createUnauthReq({ blueprintDataUrl: VALID_IMAGE });
    const res = createMockRes();

    await handler(req, res.res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(spend).not.toHaveBeenCalled();
    expect(generateTryOn).not.toHaveBeenCalled();
  });
});
