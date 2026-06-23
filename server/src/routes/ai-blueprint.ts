import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { ImageAiService } from '../services/ai/ai-interfaces.js';
import type { PointService } from '../interfaces/point-service.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { startAiJob } from '../services/ai/ai-jobs.js';
import { isValidCategory } from '../constants/categories.js';
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
 */
export function createAiBlueprintHandler(gemini: ImageAiService, timeoutMs: number, pointService: PointService) {
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

    const category = isValidCategory(String(body.category)) ? String(body.category) : 'etc';
    // 면 라벨(front/back/left/right/neck …) — 이미지 순서와 1:1. 프롬프트가 각 이미지의 면을 명시해 정확도↑.
    const faces = Array.isArray(body.faces)
      ? body.faces.slice(0, parsedList.length).map((f: unknown) => (typeof f === 'string' ? f : ''))
      : [];

    // 포인트 차감 — AI 실행 전에 선결제. 잔액 부족이면 402 로 막고 AI 는 실행하지 않음.
    const requestId = randomUUID();
    const spend = await pointService.spend(userId, 'ai_blueprint', SPEND_COSTS.ai_blueprint, requestId);
    if (!spend.ok) {
      res.status(402).json(createErrorResponse(new AppError('INSUFFICIENT_POINTS')));
      return;
    }

    // 생성은 1분+ 걸릴 수 있어 비동기 작업으로 — jobId 즉시 반환, 프론트가 GET /ai/jobs/:id 폴링으로 회수.
    const jobId = startAiJob(userId, 'blueprint', async () => {
      try {
        const result = await gemini.generateBlueprint(parsedList, { route: 'blueprint', userId }, category, faces);
        return { blueprintDataUrl: `data:${result.mimeType};base64,${result.base64}` };
      } catch (err) {
        // AI 실패/타임아웃 → 차감한 포인트 환불(환불 실패가 원래 에러를 가리지 않도록 자체 try/catch).
        try {
          await pointService.refund(userId, 'ai_blueprint', SPEND_COSTS.ai_blueprint);
        } catch {
          // 환불 실패는 무시 — 원래 AI 에러를 그대로 전파한다.
        }
        throw err;
      }
    });
    res.status(202).json({ jobId });
  };
}
