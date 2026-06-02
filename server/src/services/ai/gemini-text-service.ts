import { GoogleGenAI } from '@google/genai';
import { logger } from '../../logger.js';
import { AppError } from '../../errors/app-error.js';
import { categoryType } from '../../constants/categories.js';

// 텍스트 생성 전용 모델. 이미지 모델(gemini-2.5-flash-image)과 분리.
// gemini-2.0-flash-lite 는 신규 사용자에게 제공 중단(404 NOT_FOUND)되어 → 현재 제공되는 가장 저렴한
// 텍스트 모델 gemini-2.5-flash-lite 로 변경. GEMINI_TEXT_MODEL 로 override 유지.
const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_DAILY_LIMIT = 50;

interface DailyCounter {
  date: string;
  count: number;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

// 스토리 초안 생성 입력(기본 정보).
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

const CATEGORY_LABEL: Record<string, string> = {
  jacket: '과잠', hoodie: '후드티·맨투맨', tshirt: '반팔티', ecobag: '에코백',
  keyring: '키링·스트랩', phonecase: '폰케이스', sticker: '스티커·문구', badge: '뱃지',
  tumbler: '텀블러·머그', fabric: '담요·패브릭', doll: '인형·마스코트', accessory: '액세서리', etc: '기타',
};

function buildPrompt(info: StoryBasicInfo): string {
  const catLabel = CATEGORY_LABEL[info.category] ?? info.category;
  const type = categoryType(info.category);
  const kind = type === 'apparel' ? '의류 굿즈' : type === 'goods' ? '굿즈' : '굿즈';
  const lines: string[] = [];
  lines.push(`프로젝트 제목: ${info.title}`);
  lines.push(`카테고리: ${catLabel} (${kind})`);
  if (info.summary) lines.push(`한 줄 소개: ${info.summary}`);
  if (typeof info.basePrice === 'number' && info.basePrice > 0) lines.push(`예상 기본가: ${info.basePrice.toLocaleString('ko-KR')}원`);
  if (typeof info.targetQuantity === 'number' && info.targetQuantity > 0) lines.push(`목표 수량: ${info.targetQuantity}개`);

  return (
    '당신은 대학생 굿즈 크라우드펀딩 플랫폼 "두띵(Doothing)"의 스토리 작성 도우미입니다. ' +
    '아래 기본 정보를 바탕으로, 후원자(같은 학교 학생들)의 공감을 끌어내는 프로젝트 소개 스토리 본문 초안을 한국어로 작성하세요.\n\n' +
    '[기본 정보]\n' + lines.join('\n') + '\n\n' +
    '[작성 지침]\n' +
    '- 문단을 2~4개로 나눠 작성합니다. 각 문단은 빈 줄로 구분합니다.\n' +
    '- 1문단: 이 굿즈를 왜 만들게 됐는지(동기·배경).\n' +
    '- 2문단: 제품의 특징·구성·디자인 포인트.\n' +
    '- 3문단: 후원 참여를 권하는 따뜻한 마무리.\n' +
    '- 자연스러운 구어체, 과장·허위 표현 금지. 가격·수량을 단정적으로 약속하지 않습니다.\n' +
    '- 이모지나 마크다운 기호(#, *, - 등)는 사용하지 않습니다. 순수 문장 텍스트만.\n' +
    '- 머리말/꼬리말("아래는 초안입니다" 등) 없이 본문만 출력합니다.'
  );
}

export class GeminiTextService {
  private readonly ai: GoogleGenAI;
  private readonly model: string;
  private readonly dailyLimit: number;
  private daily: DailyCounter = { date: todayUtc(), count: 0 };

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_TEXT_MODEL ?? DEFAULT_TEXT_MODEL;
    this.dailyLimit = parsePositiveInt(process.env.AI_GEMINI_TEXT_DAILY_LIMIT, DEFAULT_DAILY_LIMIT);
  }

  // 이미지 서비스와 동일한 키(GEMINI_API_KEY 또는 GEMINI_KEY) 사용. 없으면 null → 라우트 미등록.
  static fromEnv(): GeminiTextService | null {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GEMINI_KEY;
    if (!apiKey) return null;
    return new GeminiTextService(apiKey);
  }

  // 스토리 본문 초안 생성 → 문단별 text 블록 배열. 실패 시 AppError('AI_UNAVAILABLE').
  async generateStoryDraft(info: StoryBasicInfo, userId: string): Promise<StoryBlock[]> {
    // 일일 한도 — 자정 UTC 리셋. (과금 호출 방어)
    if (this.daily.date !== todayUtc()) this.daily = { date: todayUtc(), count: 0 };
    if (this.daily.count >= this.dailyLimit) {
      throw new AppError('AI_UNAVAILABLE', `오늘 AI 초안 한도(${this.dailyLimit}회)에 도달했습니다. 자정 UTC 이후 다시 시도해주세요`);
    }
    this.daily.count += 1;
    logger.warn({ userId, model: this.model, todayCount: this.daily.count, dailyLimit: this.dailyLimit }, '[GEMINI-TEXT-BILLED] 스토리 초안 호출 시작');

    let response;
    try {
      response = await this.ai.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: buildPrompt(info) }] }],
        config: { temperature: 0.8 },
      });
    } catch (err) {
      // 업스트림(제미나이) 원본 오류 메시지는 로그로만 남기고 클라이언트에는 일반 메시지(이미지 서비스와 동일 정책).
      logger.error({ err, userId }, '[GEMINI-TEXT-FAILED] 스토리 초안 호출 실패');
      throw new AppError('AI_UNAVAILABLE', 'AI 초안 생성에 실패했어요. 잠시 후 다시 시도해 주세요.');
    }

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const fullText = parts.map((p) => p.text).filter(Boolean).join('\n').trim();
    if (!fullText) {
      logger.warn({ userId }, '[GEMINI-TEXT-EMPTY] 응답 텍스트 없음');
      throw new AppError('AI_UNAVAILABLE', 'AI가 초안을 생성하지 못했습니다');
    }

    // 빈 줄(문단 경계)로 분할 → text 블록 배열. 너무 길면 상위 6문단까지만.
    const paragraphs = fullText
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+$/g, '').trim())
      .filter((p) => p.length > 0)
      .slice(0, 6);

    const blocks: StoryBlock[] = (paragraphs.length > 0 ? paragraphs : [fullText])
      .map((value) => ({ type: 'text' as const, value: value.slice(0, 5000) }));

    logger.info({ userId, blocks: blocks.length }, '[GEMINI-TEXT-BILLED] 스토리 초안 완료');
    return blocks;
  }
}
