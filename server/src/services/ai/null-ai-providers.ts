import type { AiDesignGenerator } from '../../interfaces/ai-design-generator.js';
import type { AiVirtualTryOn } from '../../interfaces/ai-virtual-try-on.js';
import type { AiDesignRequest, AiDesignResult, AiTryOnRequest, AiTryOnResult } from '../../types/ai.js';
import { AppError } from '../../errors/app-error.js';

/**
 * AI 서버 미연결 시 사용하는 기본 어댑터.
 *
 * isAvailable() 은 항상 false 를 반환하므로 라우트에서 503 으로 응답하게 된다.
 * 프론트엔드(api.js)는 503 을 받으면 사용자에게 "AI 서버 미연결" 메시지를 보여주고
 * 펀드 등록 자체는 그대로 진행 가능.
 */
export class NullAiDesignGenerator implements AiDesignGenerator {
  async isAvailable(): Promise<boolean> { return false; }
  async generate(_req: AiDesignRequest): Promise<AiDesignResult[]> {
    throw new AppError('AI_UNAVAILABLE', 'AI 디자인 서버가 연결되어 있지 않습니다');
  }
}

export class NullAiVirtualTryOn implements AiVirtualTryOn {
  async isAvailable(): Promise<boolean> { return false; }
  async generate(_req: AiTryOnRequest): Promise<AiTryOnResult> {
    throw new AppError('AI_UNAVAILABLE', '가상 피팅 서버가 연결되어 있지 않습니다');
  }
}
