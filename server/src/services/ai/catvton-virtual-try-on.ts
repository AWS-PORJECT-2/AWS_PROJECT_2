import type { AiVirtualTryOn } from '../../interfaces/ai-virtual-try-on.js';
import type { AiTryOnRequest, AiTryOnResult } from '../../types/ai.js';
import { AppError } from '../../errors/app-error.js';
import { fetchWithTimeout } from '../../utils/fetch-with-timeout.js';

/**
 * CatVTON 기반 가상 피팅 어댑터.
 *
 * ⚠️ 라이선스 주의 — CatVTON 은 **CC BY-NC-SA 4.0 (비상업적 전용)** 입니다.
 *    펀드 중개 수수료 등 수익이 발생하는 운영에서는 상업적 사용으로 분류될 수
 *    있으므로, 시연·MVP 단계에서만 사용하고 실제 거래 단계에서는 FASHN AI
 *    같은 상업 라이선스 모델로 교체해야 합니다 (어댑터만 바꾸면 됨).
 *
 * 사장님 PC(RX 7900 GRE 16GB, ROCm)에서 CatVTON ComfyUI 노드를 띄워두고
 * HTTP 로 호출한다.
 *
 * 왜 CatVTON? (시연·MVP 한정)
 *  - bf16 정밀도에서 <8GB VRAM 으로 동작 (RX 7900 GRE 16GB 충분)
 *  - 마스킹 기반 인페인팅 → 인물 사진을 거의 변형하지 않음
 *  - 공식 ComfyUI 노드 존재 (ComfyUI_CatVTON_Wrapper)
 *
 * ROCm 호환 주의:
 *  - CatVTON 공식 문서는 CUDA 기준이며 ROCm 동작은 저자 보증이 아님
 *  - PyTorch ROCm 빌드와 ComfyUI 자체는 RX 7900 GRE 에서 동작 검증되어 있으나,
 *    CatVTON 노드 자체는 셋업 후 자체 검증 필요
 *
 * 환경변수:
 *   AI_TRYON_URL           (ComfyUI 서버 또는 별도 try-on 서버)
 *   AI_TRYON_MODEL_DIR     (사용할 모델 사진 카탈로그 경로)
 *   AI_TIMEOUT_MS
 */
export class CatVtonVirtualTryOn implements AiVirtualTryOn {
  constructor(
    private readonly serverUrl: string,
    private readonly modelDir: string,
    private readonly timeoutMs: number,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(`${this.serverUrl}/system_stats`, {}, 3000);
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(_req: AiTryOnRequest): Promise<AiTryOnResult> {
    // TODO: 실제 구현 단계
    //  1. designId 로 design.preview_image 조회
    //  2. modelType, background 에 맞는 마네킹 사진을 modelDir 에서 선택
    //  3. ComfyUI 의 CatVTON 워크플로우 JSON 로드 + 두 이미지 경로 치환
    //  4. POST /prompt 큐잉 → prompt_id
    //  5. /history/:id 폴링 후 결과 이미지 다운로드
    //  6. uploads/ 또는 S3 저장
    //  7. AiTryOnResult 반환
    //
    // 어댑터 본체 미구현 단계 — 라우트의 catch 가 AppError 면 그대로 503 으로 떨어진다.
    // 일반 Error 로 던지면 글로벌 핸들러에서 500 으로 처리되므로, 명시적으로 AI_UNAVAILABLE.
    throw new AppError('AI_UNAVAILABLE', 'CatVTON 어댑터 미구현 — GPU 셋업 후 활성화');
  }
}
