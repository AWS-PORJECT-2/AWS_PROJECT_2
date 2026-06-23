import type { Request, Response, NextFunction } from 'express';
import type { PointService } from '../interfaces/point-service.js';
import { AppError } from '../errors/app-error.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * 쿼리 파라미터를 정수로 파싱한다. 유효한 정수가 아니면 null 을 반환한다.
 * (Express 쿼리 값은 string | string[] | undefined 이므로 단일 문자열만 허용)
 */
function parseIntParam(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  // 정수 형식만 허용(소수점·지수 표기 등 거부)
  if (!/^-?\d+$/.test(value.trim())) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * GET /api/me/points/transactions 핸들러 팩토리.
 * 인증된 사용자의 포인트 거래 내역을 최신순으로 조회한다. (요구사항 7.1, 7.2)
 */
export function createMePointsTransactionsHandler(pointService: PointService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new AppError('NOT_AUTHENTICATED');
      }

      // limit: 정수만 허용, 1~MAX_LIMIT 로 클램프, 미지정/무효 시 기본값
      const parsedLimit = parseIntParam(req.query.limit);
      let limit = parsedLimit ?? DEFAULT_LIMIT;
      if (limit < 1) {
        limit = DEFAULT_LIMIT;
      }
      if (limit > MAX_LIMIT) {
        limit = MAX_LIMIT;
      }

      // offset: 정수만 허용, 0 이상으로 클램프, 미지정/무효 시 0
      const parsedOffset = parseIntParam(req.query.offset);
      let offset = parsedOffset ?? 0;
      if (offset < 0) {
        offset = 0;
      }

      const transactions = await pointService.getTransactions(userId, limit, offset);
      res.status(200).json({ transactions });
    } catch (err) {
      next(err);
    }
  };
}
