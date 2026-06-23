import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createMePointsTransactionsHandler } from './me-points-transactions.js';
import { AppError } from '../errors/app-error.js';
import type { PointService } from '../interfaces/point-service.js';
import type { PointTransaction } from '../types/index.js';

function createPointServiceMock(): PointService {
  return {
    earnOnce: vi.fn(),
    spend: vi.fn(),
    refund: vi.fn(),
    getBalance: vi.fn(),
    getTransactions: vi.fn(),
  } as unknown as PointService;
}

function createResMock(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createReqMock(userId: string | undefined, query: Record<string, unknown> = {}): Request {
  return { userId, query } as unknown as Request;
}

function sampleTransaction(): PointTransaction {
  return {
    id: 'tx-1',
    userId: 'user-1',
    type: 'earn',
    reason: 'signup',
    amount: 100,
    balanceAfter: 100,
    requestId: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };
}

describe('createMePointsTransactionsHandler (GET /api/me/points/transactions)', () => {
  let pointService: PointService;
  let next: NextFunction;

  beforeEach(() => {
    pointService = createPointServiceMock();
    next = vi.fn();
    vi.mocked(pointService.getTransactions).mockResolvedValue([sampleTransaction()]);
  });

  it('거래 내역을 { transactions } 형식으로 응답한다 (요구사항 7.1, 7.2)', async () => {
    const req = createReqMock('user-1', {});
    const res = createResMock();

    await createMePointsTransactionsHandler(pointService)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ transactions: [sampleTransaction()] });
    expect(next).not.toHaveBeenCalled();
  });

  it('limit/offset 미지정 시 기본값(50, 0)을 사용한다', async () => {
    const req = createReqMock('user-1', {});
    const res = createResMock();

    await createMePointsTransactionsHandler(pointService)(req, res, next);

    expect(pointService.getTransactions).toHaveBeenCalledWith('user-1', 50, 0);
  });

  it('유효한 limit/offset 을 파싱하여 그대로 전달한다', async () => {
    const req = createReqMock('user-1', { limit: '20', offset: '40' });
    const res = createResMock();

    await createMePointsTransactionsHandler(pointService)(req, res, next);

    expect(pointService.getTransactions).toHaveBeenCalledWith('user-1', 20, 40);
  });

  it('limit 이 MAX_LIMIT(100)을 초과하면 100 으로 클램프한다', async () => {
    const req = createReqMock('user-1', { limit: '500' });
    const res = createResMock();

    await createMePointsTransactionsHandler(pointService)(req, res, next);

    expect(pointService.getTransactions).toHaveBeenCalledWith('user-1', 100, 0);
  });

  it('limit 이 1 미만이면 기본값(50)으로 대체한다', async () => {
    const req = createReqMock('user-1', { limit: '0' });
    const res = createResMock();

    await createMePointsTransactionsHandler(pointService)(req, res, next);

    expect(pointService.getTransactions).toHaveBeenCalledWith('user-1', 50, 0);
  });

  it('정수가 아닌 limit 은 무효 처리하여 기본값(50)을 사용한다', async () => {
    const req = createReqMock('user-1', { limit: 'abc' });
    const res = createResMock();

    await createMePointsTransactionsHandler(pointService)(req, res, next);

    expect(pointService.getTransactions).toHaveBeenCalledWith('user-1', 50, 0);
  });

  it('소수점 limit 은 무효 처리하여 기본값(50)을 사용한다', async () => {
    const req = createReqMock('user-1', { limit: '10.5' });
    const res = createResMock();

    await createMePointsTransactionsHandler(pointService)(req, res, next);

    expect(pointService.getTransactions).toHaveBeenCalledWith('user-1', 50, 0);
  });

  it('음수 offset 은 0 으로 클램프한다', async () => {
    const req = createReqMock('user-1', { offset: '-5' });
    const res = createResMock();

    await createMePointsTransactionsHandler(pointService)(req, res, next);

    expect(pointService.getTransactions).toHaveBeenCalledWith('user-1', 50, 0);
  });

  it('배열 형태의 쿼리 값은 무효 처리하여 기본값을 사용한다', async () => {
    const req = createReqMock('user-1', { limit: ['10', '20'], offset: ['5'] });
    const res = createResMock();

    await createMePointsTransactionsHandler(pointService)(req, res, next);

    expect(pointService.getTransactions).toHaveBeenCalledWith('user-1', 50, 0);
  });

  it('req.userId 가 없으면 NOT_AUTHENTICATED 에러를 next 로 전달한다 (전역 핸들러가 401 매핑)', async () => {
    const req = createReqMock(undefined, {});
    const res = createResMock();

    await createMePointsTransactionsHandler(pointService)(req, res, next);

    expect(pointService.getTransactions).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    const err = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('NOT_AUTHENTICATED');
    expect(err.httpStatus).toBe(401);
  });

  it('getTransactions 가 throw 하면 에러를 next 로 전달한다', async () => {
    const failure = new Error('db down');
    vi.mocked(pointService.getTransactions).mockRejectedValue(failure);
    const req = createReqMock('user-1', {});
    const res = createResMock();

    await createMePointsTransactionsHandler(pointService)(req, res, next);

    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(failure);
  });
});
