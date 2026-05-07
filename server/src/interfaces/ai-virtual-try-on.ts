import type { AiTryOnRequest, AiTryOnResult } from '../types/ai.js';

/**
 * 가상 피팅(Virtual Try-On) 추상화.
 *
 * 구현체:
 *  - CatVtonClient (사장님 본인 PC, ROCm + CatVTON ComfyUI 노드)
 *  - FashnAiClient (클라우드 API, 가장 간단·고품질)
 *  - LeffaClient (자체 GPU 호스팅)
 *
 * 동일 계약:
 *  - designId 의 preview 이미지를 입력으로 받아 모델 착용 이미지를 생성
 *  - 생성 시간이 보통 10~30초이므로 라우트에서 적절한 timeout 설정 필요
 *  - 결과는 영구 저장된 URL만 반환
 */
export interface AiVirtualTryOn {
  generate(req: AiTryOnRequest): Promise<AiTryOnResult>;
  isAvailable(): Promise<boolean>;
}
