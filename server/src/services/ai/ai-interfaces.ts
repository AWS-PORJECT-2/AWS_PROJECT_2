// AI 서비스 공용 인터페이스 — 라우트/핸들러는 구체 클래스(Gemini/OpenAI)가 아니라 이 인터페이스에 의존.
//  덕분에 백엔드 AI 공급자를 바꿔도(예: Gemini → OpenAI) 라우트 코드는 그대로다.

export interface ImageInput {
  mimeType: string;
  base64: string;
}

export interface BilledCallContext {
  route: 'blueprint' | 'try-on';
  userId: string;
}

// 이미지 생성(도면/실물 + 가상피팅) 서비스 계약.
export interface ImageAiService {
  generateBlueprint(
    clothing: ImageInput[],
    ctx: BilledCallContext,
    category?: string,
    faces?: string[],
  ): Promise<ImageInput>;
  generateTryOn(
    garments: ImageInput[],
    opts: { modelType: string; background: string; category?: string },
    ctx: BilledCallContext,
  ): Promise<ImageInput>;
}

// 스토리 초안(텍스트) 생성 서비스 계약.
export interface StoryBasicInfo {
  title: string;
  category: string;
  summary?: string;
  basePrice?: number;
  targetQuantity?: number;
}

export interface StoryBlock {
  type: 'text';
  value: string;
}

export interface TextAiService {
  generateStoryDraft(info: StoryBasicInfo, userId: string): Promise<StoryBlock[]>;
}
