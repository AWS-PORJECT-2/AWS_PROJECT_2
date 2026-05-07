import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';

/**
 * POST /api/garments/fetch-from-url
 *
 * 상품 페이지 URL을 받아 대표 이미지를 추출. 실제 구현은:
 *  1. URL 화이트리스트 검사 (musinsa.com, topten.com 등)
 *  2. fetch + cheerio 로 og:image 추출
 *  3. 이미지 다운로드 + base64 dataURL 변환
 *  4. 응답: { imageDataUrl, sourceUrl }
 *
 * 현재는 placeholder (503 응답). 사장님이 정식 구현할 영역.
 */
export function createGarmentsFetchUrlHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('AUTH_FAILED')));
      return;
    }

    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url || !/^https?:\/\//i.test(url)) {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', '유효한 URL이 필요합니다')));
      return;
    }

    res.status(503).json(createErrorResponse(
      new AppError('AI_UNAVAILABLE', 'URL 가져오기는 아직 미구현입니다. 사진 업로드를 이용해 주세요.'),
    ));
  };
}
