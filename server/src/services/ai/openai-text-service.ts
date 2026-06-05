import { logger } from '../../logger.js';
import { AppError } from '../../errors/app-error.js';
import { categoryType } from '../../constants/categories.js';
import type { TextAiService, StoryBasicInfo, StoryBlock } from './ai-interfaces.js';

// OpenAI(ChatGPT) 기반 스토리 초안 생성. 기본 gpt-4o-mini(저렴·충분). OPENAI_TEXT_MODEL 로 override.
const DEFAULT_TEXT_MODEL = 'gpt-4o-mini';
const DEFAULT_DAILY_LIMIT = 50;
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

interface DailyCounter { date: string; count: number; }

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

const CATEGORY_LABEL: Record<string, string> = {
  jacket: '과잠', hoodie: '후드티·맨투맨', tshirt: '반팔티', ecobag: '에코백',
  keyring: '키링·스트랩', phonecase: '폰케이스', sticker: '스티커·문구', badge: '뱃지',
  tumbler: '텀블러·머그', fabric: '담요·패브릭', doll: '인형·마스코트', accessory: '액세서리', etc: '기타',
};

function buildPrompt(info: StoryBasicInfo): string {
  const catLabel = CATEGORY_LABEL[info.category] ?? info.category;
  const type = categoryType(info.category);
  const kind = type === 'apparel' ? '의류 굿즈' : '굿즈';
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

export class OpenAiTextService implements TextAiService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly dailyLimit: number;
  private daily: DailyCounter = { date: todayUtc(), count: 0 };

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.model = process.env.OPENAI_TEXT_MODEL ?? DEFAULT_TEXT_MODEL;
    this.timeoutMs = parsePositiveInt(process.env.OPENAI_TEXT_TIMEOUT_MS, 60_000);
    this.dailyLimit = parsePositiveInt(process.env.AI_TEXT_DAILY_LIMIT, DEFAULT_DAILY_LIMIT);
  }

  static fromEnv(): OpenAiTextService | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return new OpenAiTextService(apiKey);
  }

  async generateStoryDraft(info: StoryBasicInfo, userId: string): Promise<StoryBlock[]> {
    if (this.daily.date !== todayUtc()) this.daily = { date: todayUtc(), count: 0 };
    if (this.daily.count >= this.dailyLimit) {
      throw new AppError('AI_UNAVAILABLE', `오늘 AI 초안 한도(${this.dailyLimit}회)에 도달했습니다. 자정 UTC 이후 다시 시도해주세요`);
    }
    this.daily.count += 1;
    logger.warn({ userId, model: this.model, todayCount: this.daily.count, dailyLimit: this.dailyLimit }, '[OPENAI-TEXT-BILLED] 스토리 초안 호출 시작');

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    let res: globalThis.Response;
    try {
      res = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: buildPrompt(info) }],
          temperature: 0.8,
        }),
        signal: ac.signal,
      });
    } catch (err) {
      logger.error({ err, userId }, '[OPENAI-TEXT-FAILED] 스토리 초안 호출 실패(네트워크/타임아웃)');
      throw new AppError('AI_UNAVAILABLE', 'AI 초안 생성에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.error({ userId, status: res.status, errText: errText.slice(0, 600) }, '[OPENAI-TEXT-FAILED] OpenAI 비정상 응답');
      throw new AppError('AI_UNAVAILABLE', 'AI 초안 생성에 실패했어요. 잠시 후 다시 시도해 주세요.');
    }

    let json: { choices?: Array<{ message?: { content?: string } }> };
    try {
      json = await res.json() as typeof json;
    } catch (err) {
      logger.error({ err, userId }, '[OPENAI-TEXT-FAILED] 응답 JSON 파싱 실패');
      throw new AppError('AI_UNAVAILABLE');
    }
    const fullText = (json?.choices?.[0]?.message?.content ?? '').trim();
    if (!fullText) {
      logger.warn({ userId }, '[OPENAI-TEXT-EMPTY] 응답 텍스트 없음');
      throw new AppError('AI_UNAVAILABLE', 'AI가 초안을 생성하지 못했습니다');
    }

    const paragraphs = fullText
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+$/g, '').trim())
      .filter((p) => p.length > 0)
      .slice(0, 6);

    const blocks: StoryBlock[] = (paragraphs.length > 0 ? paragraphs : [fullText])
      .map((value) => ({ type: 'text' as const, value: value.slice(0, 5000) }));

    logger.info({ userId, blocks: blocks.length }, '[OPENAI-TEXT-BILLED] 스토리 초안 완료');
    return blocks;
  }
}
