import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';

/**
 * POST /api/ai/garments/extract
 *
 * 옷 사진(dataURL) → 배경 제거 + 평면 도면(flat lay) 변환.
 *
 * 실제 구현 옵션:
 *  - 클라이언트 측: @imgly/background-removal (WebAssembly, ~5MB)
 *  - 서버 측: rembg (Python) — Express → 별도 Python 마이크로서비스 호출
 *  - 하이브리드: 백엔드가 ComfyUI 워크플로우 호출 (rembg 노드 + 후처리)
 *
 * 현재는 placeholder (503 응답). 사장님 GPU 셋업 후 채울 영역.
 * 임시 fallback: 입력 이미지를 그대로 반환 (배경 제거 없이)
 *   → 환경변수 ALLOW_GARMENT_PASSTHROUGH=true 일 때만 활성
 */
export function createAiGarmentsExtractHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('AUTH_FAILED')));
      return;
    }

    const imageDataUrl = req.body?.imageDataUrl;
    if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
      res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', 'imageDataUrl 누락')));
      return;
    }

    // 시연용 임시 fallback: 입력 그대로 반환 (실제 배경 제거는 추후)
    if (process.env.ALLOW_GARMENT_PASSTHROUGH === 'true') {
      res.json({ previewImage: imageDataUrl, passthrough: true });
      return;
    }

    res.status(503).json(createErrorResponse(
      new AppError('AI_UNAVAILABLE', '설계도 자동 추출은 GPU 셋업 후 활성화됩니다. 원본 그대로 사용 옵션을 이용해 주세요.'),
    ));
  };
}
