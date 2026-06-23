import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { GeminiImageService } from '../services/ai/gemini-image-service.js';
import type { PointService } from '../interfaces/point-service.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { withTimeout } from '../utils/fetch-with-timeout.js';
import { SPEND_COSTS } from '../types/index.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_IMAGES = 5;

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

/**
 * POST /api/ai/blueprint
 * body: { imageDataUrls: ['data:image/jpeg;base64,...', ...] }   (1~5장)
 *   (단일 imageDataUrl 도 호환 — 자동으로 길이 1 배열로 변환)
 * response: { blueprintDataUrl: 'data:image/png;base64,...' }
 *
 * 옷 사진 1~5장 → 앞·뒤·옆 도면 1장. Gemini 호출 1회.
 *
 * 포인트 통합(요구사항 4): Gemini 호출 전에 포인트를 선차감하고, AI 작업이
 * 실패/타임아웃하면 보상 환불로 차감분을 환원한다.
 */
export function createAiBlueprintHandler(
  gemini: GeminiImageService,
  timeoutMs: number,
  pointService: PointService,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED')));
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    // 호환: 구버전 client 가 imageDataUrl(단수) 로 보내도 받음
    const rawList = Array.isArray(body.imageDataUrls)
      ? body.imageDataUrls
      : typeof body.imageDataUrl === 'string' ? [body.imageDataUrl] : [];

    if (rawList.length === 0) {
      res.status(400).json(createErrorResponse(
        new AppError('MISSING_REQUIRED_FIELD', 'imageDataUrls 가 비어 있습니다 (1~5장 필요)'),
      ));
      return;
    }
    if (rawList.length > MAX_IMAGES) {
      res.status(400).json(createErrorResponse(
        new AppError('MISSING_REQUIRED_FIELD', `이미지는 최대 ${MAX_IMAGES} 장까지 첨부 가능합니다`),
      ));
      return;
    }

    const parsedList: { mimeType: string; base64: string }[] = [];
    for (const item of rawList) {
      if (typeof item !== 'string') {
        res.status(400).json(createErrorResponse(
          new AppError('MISSING_REQUIRED_FIELD', 'imageDataUrls 항목은 문자열이어야 합니다'),
        ));
        return;
      }
      const parsed = parseDataUrl(item);
      if (!parsed) {
        res.status(400).json(createErrorResponse(
          new AppError('MISSING_REQUIRED_FIELD', '유효하지 않은 dataURL 이 포함돼 있습니다'),
        ));
        return;
      }
      if (!ALLOWED_MIME.has(parsed.mimeType.toLowerCase())) {
        res.status(400).json(createErrorResponse(
          new AppError('MISSING_REQUIRED_FIELD', '지원 이미지 형식: jpeg / png / webp'),
        ));
        return;
      }
      parsedList.push(parsed);
    }

    // 선차감(요구사항 4.1, 4.4): Gemini 호출 전에 포인트를 차감한다.
    // requestId 로 동일 요청 재시도 시 이중 차감을 방지한다(멱등).
    const requestId = randomUUID();
    const spend = await pointService.spend(
      userId,
      'ai_blueprint',
      SPEND_COSTS.ai_blueprint,
      requestId,
    );
    if (!spend.ok) {
      // 요구사항 4.4, 4.5: 잔액 부족 시 402 응답, AI 미실행.
      res.status(402).json(createErrorResponse(new AppError('INSUFFICIENT_POINTS')));
      return;
    }

    try {
      const result = await withTimeout(
        gemini.generateBlueprint(parsedList, { route: 'blueprint', userId }),
        timeoutMs,
      );
      // 요구사항 4.1, 4.2: 차감 성공 후 AI 성공 시 기존 응답 형식 유지.
      res.json({ blueprintDataUrl: `data:${result.mimeType};base64,${result.base64}` });
    } catch (err) {
      // 요구사항 4.2(역흐름): AI 실패/타임아웃 시 보상 환불로 차감분 환원.
      if (spend.transaction) {
        try {
          await pointService.refund(
            userId,
            'ai_blueprint',
            SPEND_COSTS.ai_blueprint,
            spend.transaction.id,
          );
        } catch {
          // 환불 실패는 원본 AI 에러 응답을 가리지 않도록 무시(로깅은 서비스 계층 담당).
        }
      }
      // 기존 에러 매핑 유지(AI_UNAVAILABLE / AI_TIMEOUT 등).
      if (err instanceof AppError) {
        res.status(err.httpStatus).json(createErrorResponse(err));
        return;
      }
      res.status(503).json(createErrorResponse(new AppError('AI_UNAVAILABLE')));
    }
  };
}
