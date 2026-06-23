import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createMePointsHandler } from './me-points.js';
import { AppError } from '../errors/app-error.js';
import type { PointService } from '../interfaces/point-service.js';

// 핸들러는 PointService 의존성만 사용하므로 필요한 메서드만 mock 한다.
function createPointServiceMock(): PointService {
  return {
    earnOnce: vi.fn(),
    spend: vi.fn(),
    refund: vi.fn(),
    getBalance: vi.fn(),
    getTransactions: vi.fn(),
  } as unknown as PointService;
}

// Express req/res/next 를 최소한으로 mock 한다.
function createResMock(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createReqMock(userId?: string): Request {
  return { userId } as unknown as Request;
}

describe('createMePointsHandler (GET /api/me/points)', () => {
  let pointService: PointService;
  let next: NextFunction;

  beforeEach(() => {
    pointService = createPointServiceMock();
    next = vi.fn();
  });

  it('인증된 사용자의 잔액을 { points } 형식으로 응답한다 (요구사항 7.3)', async () => {
    vi.mocked(pointService.getBalance).mockResolvedValue({ userId: 'user-1', points: 250 });
    const req = createReqMock('user-1');
    const res = createResMock();

    await createMePointsHandler(pointService)(req, res, next);

    // getBalance 는 인증된 userId 로 호출되어야 한다.
    expect(pointService.getBalance).toHaveBeenCalledTimes(1);
    expect(pointService.getBalance).toHaveBeenCalledWith('user-1');
    // 응답은 200 + { points } 형식이어야 한다.
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ points: 250 });
    expect(next).not.toHaveBeenCalled();
  });

  it('잔액이 0 이어도 { points: 0 } 을 응답한다', async () => {
    vi.mocked(pointService.getBalance).mockResolvedValue({ userId: 'user-2', points: 0 });
    const req = createReqMock('user-2');
    const res = createResMock();

    await createMePointsHandler(pointService)(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ points: 0 });
    expect(next).not.toHaveBeenCalled();
  });

  it('req.userId 가 없으면 NOT_AUTHENTICATED 에러를 next 로 전달한다 (전역 핸들러가 401 매핑)', async () => {
    const req = createReqMock(undefined);
    const res = createResMock();

    await createMePointsHandler(pointService)(req, res, next);

    // getBalance 는 호출되면 안 된다.
    expect(pointService.getBalance).not.toHaveBeenCalled();
    // res 응답도 없어야 한다.
    expect(res.json).not.toHaveBeenCalled();
    // next 는 401 NOT_AUTHENTICATED AppError 와 함께 호출되어야 한다.
    expect(next).toHaveBeenCalledTimes(1);
    const err = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('NOT_AUTHENTICATED');
    expect(err.httpStatus).toBe(401);
  });

  it('getBalance 가 throw 하면 에러를 next 로 전달한다', async () => {
    const failure = new Error('db down');
    vi.mocked(pointService.getBalance).mockRejectedValue(failure);
    const req = createReqMock('user-3');
    const res = createResMock();

    await createMePointsHandler(pointService)(req, res, next);

    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(failure);
  });
});
