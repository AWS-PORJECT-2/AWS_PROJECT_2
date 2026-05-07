import type { AiDesignRequest, AiDesignResult } from '../types/ai.js';

/**
 * AI 디자인 생성 추상화.
 * 구현체:
 *  - ComfyUiDesignGenerator (사장님 본인 PC, ROCm + ComfyUI)
 *  - ReplicateDesignGenerator (클라우드 fallback)
 *  - BedrockDesignGenerator (AWS 운영 시)
 *
 * 어떤 구현이든 다음 계약을 따름:
 *  - 입력 프롬프트를 안전하게 처리(쉘/SQL/프롬프트 인젝션 검토는 호출자 책임)
 *  - 외부 호출 실패 시 throw (라우트에서 503 응답으로 매핑)
 *  - 생성 결과는 영구 저장된 URL 만 반환 (휘발성 임시 URL 금지)
 */
export interface AiDesignGenerator {
  generate(req: AiDesignRequest): Promise<AiDesignResult[]>;
  isAvailable(): Promise<boolean>;
}
