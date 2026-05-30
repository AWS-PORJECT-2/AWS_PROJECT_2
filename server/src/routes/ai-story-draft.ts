import type { Request, Response } from 'express';
import type { GeminiTextService, StoryBasicInfo } from '../services/ai/gemini-text-service.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { withTimeout } from '../utils/fetch-with-timeout.js';
import { isValidCategory } from '../constants/categories.js';

const TITLE_MAX = 80;
const SUMMARY_MAX = 300;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * POST /api/ai/story-draft
 * body: { basicInfo: { title, category, summary?, basePrice?, targetQuantity? } }
 * 성공: 200 { blocks: [{ type:'text', value }] }  (2~4개 문단 초안)
 * 핵심 정보(title/category/summary) 부족: 400 { error:'NEED_BASIC_INFO', message, missing:[...] }
 * AI 미설정/실패: 503 { error:'AI_UNAVAILABLE', message:'AI 초안 생성을 사용할 수 없습니다' }
 *
 * 두띵=대학생 굿즈 크라우드펀딩 맥락의 스토리 본문 초안을 생성한다.
 */
export function createAiStoryDraftHandler(gemini: GeminiTextService | null, timeoutMs: number) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED')));
      return;
    }

    // GEMINI 키 미설정 → 서비스 없음. 미설정/실패 모두 503 통일.
    if (!gemini) {
      res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'AI 초안 생성을 사용할 수 없습니다' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const basicRaw = (body.basicInfo && typeof body.basicInfo === 'object' && !Array.isArray(body.basicInfo))
      ? (body.basicInfo as Record<string, unknown>)
      : {};

    const title = str(basicRaw.title).slice(0, TITLE_MAX);
    const category = str(basicRaw.category);
    const summary = str(basicRaw.summary).slice(0, SUMMARY_MAX);

    // 핵심 정보(제목·카테고리·소개) 중 비면 400 — 프론트가 기본정보부터 채우게.
    const missing: string[] = [];
    if (!title) missing.push('title');
    if (!category || !isValidCategory(category)) missing.push('category');
    if (!summary) missing.push('summary');
    if (missing.length > 0) {
      res.status(400).json({
        error: 'NEED_BASIC_INFO',
        message: '기본 정보(제목·카테고리·소개)를 먼저 입력해 주세요',
        missing,
      });
      return;
    }

    const info: StoryBasicInfo = { title, category, summary };
    const basePrice = Number(basicRaw.basePrice);
    if (Number.isFinite(basePrice) && basePrice > 0) info.basePrice = Math.floor(basePrice);
    const targetQuantity = Number(basicRaw.targetQuantity);
    if (Number.isFinite(targetQuantity) && targetQuantity > 0) info.targetQuantity = Math.floor(targetQuantity);

    try {
      const blocks = await withTimeout(gemini.generateStoryDraft(info, userId), timeoutMs);
      res.json({ blocks });
    } catch (err) {
      // 어떤 실패든(미설정/타임아웃/모델오류) 프론트엔 503 통일 메시지로 안내.
      res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'AI 초안 생성을 사용할 수 없습니다' });
    }
  };
}
