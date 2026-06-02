/**
 * 게시판 콘텐츠 검증·정규화.
 * 본문(body)은 평문으로 저장하고 렌더 시 escape + 자동링크 → 본문 경유 HTML 주입 불가.
 * 미디어는 구조화(image/video/youtube/link)하여 타입·URL 형식을 서버에서 검증한다.
 */

export const BOARD_CATEGORIES = ['general', 'promo', 'question', 'free', 'review'] as const;
export type BoardCategory = (typeof BOARD_CATEGORIES)[number];

const TITLE_MAX = 120;
const BODY_MAX = 5000;
// 게시판 리치 본문(html 블록) 새니타이즈 후 상한 — 인라인(클라 압축) 이미지 몇 장 수용.
// funds 스토리(MAX_HTML_CHARS 200K)보다 큼: 게시판은 이미지를 별도 블록이 아닌 본문 인라인으로 둠.
// (S3 업로드 도입 전 임시. writeRateLimit + 전역 50mb 바디로 남용 제한.)
export const BOARD_HTML_MAX = 2_500_000;
const MEDIA_MAX = 10;
const COMMENT_MAX = 2000;
// 미디어 data URL 1건 상한(base64 문자수 ≈ 8MB). 과도한 업로드/DB 비대화 방지.
const DATAURL_MAX = 11_000_000;

export function isValidBoardCategory(c: unknown): c is BoardCategory {
  return typeof c === 'string' && (BOARD_CATEGORIES as readonly string[]).includes(c);
}

export function sanitizeTitle(v: unknown): string {
  return (typeof v === 'string' ? v : '').trim().slice(0, TITLE_MAX);
}
export function sanitizeBody(v: unknown): string {
  return (typeof v === 'string' ? v : '').replace(/\r\n/g, '\n').slice(0, BODY_MAX);
}
export function sanitizeComment(v: unknown): string {
  return (typeof v === 'string' ? v : '').trim().slice(0, COMMENT_MAX);
}

// 목록 카드용 경량 썸네일 — 작은 data:image(≤THUMB_MAX) 또는 https URL(ytimg 등)만 허용. 그 외 null.
// 목록 응답을 가볍게 유지하기 위해 본문 인라인 이미지(수 MB)와 별개로 작은 썸네일만 저장한다.
const THUMB_MAX = 400_000; // base64 약 300KB — 목록 N건 곱해도 가벼움
export function sanitizeThumbnail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  if (/^https:\/\/[^\s]+$/i.test(s) && s.length <= 2048) return s;
  if (/^data:image\/(png|jpe?g|webp);base64,/.test(s) && s.length <= THUMB_MAX) return s;
  return null;
}

/** 새니타이즈된 html → 평문(목록 스니펫·검색용). 태그/엔티티 제거 후 500자. */
export function htmlToText(html: unknown): string {
  return (typeof html === 'string' ? html : '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

/** 유튜브 URL/ID 에서 11자 영상 ID 추출(실패 시 null). */
export function youtubeId(input: string): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function isHttpUrl(v: unknown): boolean {
  return typeof v === 'string' && /^https?:\/\/[^\s]+$/i.test(v) && v.length <= 2048;
}
function isImageUrl(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return isHttpUrl(v) || (/^data:image\/(png|jpe?g|webp|gif);base64,/.test(v) && v.length <= DATAURL_MAX);
}
function isVideoUrl(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return isHttpUrl(v) || (/^data:video\/(mp4|webm|quicktime);base64,/.test(v) && v.length <= DATAURL_MAX);
}

export interface BoardMedia {
  type: 'image' | 'video' | 'youtube' | 'link';
  url?: string;       // image/video/link
  youtubeId?: string; // youtube
  title?: string;     // link 표시용(선택)
}

/** 미디어 배열 정규화 — 유효 항목만, 최대 MEDIA_MAX 개. 알 수 없는 형식은 버린다. */
export function normalizeMedia(arr: unknown): BoardMedia[] {
  if (!Array.isArray(arr)) return [];
  const out: BoardMedia[] = [];
  for (const raw of arr) {
    if (out.length >= MEDIA_MAX) break;
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const type = item.type;
    if (type === 'image' && isImageUrl(item.url)) out.push({ type: 'image', url: item.url as string });
    else if (type === 'video' && isVideoUrl(item.url)) out.push({ type: 'video', url: item.url as string });
    else if (type === 'youtube') {
      const id = youtubeId(typeof item.url === 'string' ? item.url : (typeof item.youtubeId === 'string' ? item.youtubeId : ''));
      if (id) out.push({ type: 'youtube', youtubeId: id });
    } else if (type === 'link' && isHttpUrl(item.url)) {
      const title = typeof item.title === 'string' ? item.title.trim().slice(0, 200) : undefined;
      out.push({ type: 'link', url: item.url as string, title: title || undefined });
    }
  }
  return out;
}
