import type { AiVirtualTryOn } from '../../interfaces/ai-virtual-try-on.js';
import type { AiTryOnRequest, AiTryOnResult } from '../../types/ai.js';

/**
 * CatVTON 기반 가상 피팅 어댑터.
 *
 * 사장님 PC(RX 7900 GRE 16GB, ROCm)에서 CatVTON 또는 CatVTON ComfyUI 노드를
 * 띄워두고 HTTP 로 호출한다.
 *
 * 왜 CatVTON?
 *  - 8~16GB VRAM 으로 안정 동작 (RX 7900 GRE 적합)
 *  - 마스킹 기반 인페인팅 → 인물 사진을 거의 변형하지 않음
 *  - PyTorch ROCm 빌드와 호환
 *  - 공식 ComfyUI 노드 존재 → 워크플로우 통합 용이
 *
 * 옵션:
 *  - 자체 호스팅이 부담스러우면 환경변수만 바꿔 FashnAiClient 로 교체 가능
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
    throw new Error('CatVtonVirtualTryOn.generate 미구현 — 사장님 GPU 셋업 후 채우세요');
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
