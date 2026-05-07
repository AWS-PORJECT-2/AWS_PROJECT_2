import type { AiDesignGenerator } from '../../interfaces/ai-design-generator.js';
import type { AiDesignRequest, AiDesignResult } from '../../types/ai.js';

/**
 * ComfyUI 기반 AI 디자인 생성 어댑터.
 *
 * 사장님 PC(RX 7900 GRE 16GB, ROCm)에서 ComfyUI 서버를 띄워 두고,
 * 백엔드는 HTTP REST 로 워크플로우를 큐잉한다.
 *
 * 권장 모델:
 *  - SDXL (안정적, 16GB에 잘 맞음) + 패션 LoRA
 *  - 또는 FLUX.1 [schnell] GGUF Q5_K_M (16GB로 빡빡, 4스텝)
 *
 * ComfyUI API 사양:
 *   POST /prompt           → workflow JSON 큐잉, prompt_id 반환
 *   GET  /history/:id      → 결과 image filename 조회
 *   GET  /view?filename=X  → 실제 이미지 바이트
 *
 * 환경변수:
 *   AI_COMFYUI_URL          (예: http://localhost:8188)
 *   AI_COMFYUI_WORKFLOW_DIR (워크플로우 JSON 템플릿 디렉토리)
 *   AI_TIMEOUT_MS           (기본 60000)
 *
 * 실제 구현은 이 클래스를 채우는 식. 현재는 골격만.
 */
export class ComfyUiDesignGenerator implements AiDesignGenerator {
  constructor(
    private readonly comfyUrl: string,
    private readonly workflowDir: string,
    private readonly timeoutMs: number,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(`${this.comfyUrl}/system_stats`, {}, 3000);
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(_req: AiDesignRequest): Promise<AiDesignResult[]> {
    // TODO: 실제 구현 단계
    //  1. workflowDir/{productCategory}.json 로드
    //  2. workflow 안의 PROMPT_PLACEHOLDER 를 req.prompt 로 치환
    //  3. POST /prompt 로 큐잉 → prompt_id
    //  4. GET /history/:prompt_id 폴링 (1초 간격, timeoutMs 까지)
    //  5. 결과 이미지를 /view 로 다운로드
    //  6. uploads/ 또는 S3에 저장 후 design 레코드 INSERT
    //  7. AiDesignResult[] 반환
    throw new Error('ComfyUiDesignGenerator.generate 미구현 — 사장님 셋업 후 채우세요');
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}
