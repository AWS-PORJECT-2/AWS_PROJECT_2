/**
 * AI 디자인 생성 / 모델 피팅 도메인 타입.
 *
 * 실제 외부 AI 서버(ComfyUI, FASHN AI, Replicate 등) 와의 어댑터에서 사용.
 */

export type AiProductCategory = 'varsity' | 'tshirt' | 'hoodie' | 'ecobag' | 'keyring' | 'sticker';

export interface AiDesignRequest {
  prompt: string;
  productCategory: AiProductCategory;
  count: number;                   // 시안 장수 (1~4)
  userId: string;                  // 어떤 사용자가 요청했는지 (저장 시 creator_id)
}

export interface AiDesignResult {
  /** S3 / 업로드 디렉토리에 저장된 후의 URL */
  previewImage: string;
  /** DB에 저장된 design 레코드 id */
  id: string;
  aiGenerated: true;
}

export interface AiTryOnRequest {
  designId: string;
  modelType: 'female' | 'male' | 'female_athletic' | 'male_athletic';
  background: 'campus' | 'studio' | 'classroom' | 'outdoor';
  userId: string;
}

export interface AiTryOnResult {
  /** 생성된 모델 착용 이미지 URL 배열 (보통 1~3장) */
  images: string[];
  /** 외부 AI 서버 작업 id (디버깅·재호출용) */
  jobId?: string;
}
