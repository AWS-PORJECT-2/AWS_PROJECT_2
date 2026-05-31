import type { ContentBlock, ContentTextVariant, ContentAlign, ContentImageWidth, ContentImageSide } from '../types/index.js';

// 스토리 본문 블록(content_blocks) 정규화 — funds-create / me-funds / admin-funds / pg-groupbuy 가 공유하는 단일 소스.
// 리치 스키마(text/image/split + variant/align/width/imageSide) 를 보존하면서 하위호환({type,value})을 유지한다.
//
// 검증 원칙:
//  - 알 수 없는 variant/align/width/imageSide 는 기본값으로 강등(throw·드롭 아님).
//  - 이미지 URL 은 imageField(검증 통과분)만. 통과 못 하면 해당 이미지/블록 제외.
//  - 빈 텍스트/이미지 블록은 제외.
//  - 최대 블록 수 MAX_BLOCKS, 텍스트 길이 MAX_TEXT_CHARS.

export const MAX_IMG_CHARS = 12_000_000; // base64 data URL 약 8MB 상한
export const MAX_BLOCKS = 40;
export const MAX_TEXT_CHARS = 5000;

const TEXT_VARIANTS: readonly ContentTextVariant[] = ['heading', 'subheading', 'body', 'quote'];
const ALIGNS: readonly ContentAlign[] = ['left', 'center', 'right'];
const IMAGE_WIDTHS: readonly ContentImageWidth[] = ['sm', 'md', 'lg', 'full'];
const IMAGE_SIDES: readonly ContentImageSide[] = ['left', 'right'];

// 이미지 값(data:image/(png|jpe?g|webp) 또는 http(s) URL) 검증. 통과 못 하면 null.
export function imageField(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  if (v.length > MAX_IMG_CHARS) return null;
  const isHttp = /^https?:\/\//.test(v);
  const isDataImage = /^data:image\/(png|jpe?g|webp);base64,/.test(v);
  return (isHttp || isDataImage) ? v : null;
}

// 허용 enum 중 하나면 그대로, 아니면 기본값으로 강등.
function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * 본문 블록 파싱(리치 스키마, 하위호환).
 * 계약 형태({type:'text', text} | {type:'image', url})와 내부 형태({type, value}) 양쪽을 수용.
 * - text:  value(또는 text) + variant(기본 body) + align(기본 left)
 * - image: value(또는 url) + width(기본 full) + align(기본 center)
 * - split: text + image(이미지 검증 통과 필수) + imageSide(기본 right) + align(기본 left)
 * 빈/무효 블록은 제외. 반환 배열의 각 원소는 정규화된 스키마 형태.
 */
export function normalizeContentBlocks(v: unknown): ContentBlock[] {
  if (!Array.isArray(v)) return [];
  const blocks: ContentBlock[] = [];
  for (const raw of v.slice(0, MAX_BLOCKS)) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, unknown>;

    if (b.type === 'text') {
      const src = typeof b.text === 'string' ? b.text : (typeof b.value === 'string' ? b.value : '');
      const text = src.trim();
      if (!text) continue;
      blocks.push({
        type: 'text',
        value: text.slice(0, MAX_TEXT_CHARS),
        variant: pickEnum(b.variant, TEXT_VARIANTS, 'body'),
        align: pickEnum(b.align, ALIGNS, 'left'),
      });
    } else if (b.type === 'image') {
      const src = typeof b.url === 'string' ? b.url : (typeof b.value === 'string' ? b.value : '');
      const img = imageField(src);
      if (!img) continue;
      blocks.push({
        type: 'image',
        value: img,
        width: pickEnum(b.width, IMAGE_WIDTHS, 'full'),
        align: pickEnum(b.align, ALIGNS, 'center'),
      });
    } else if (b.type === 'split') {
      const textSrc = typeof b.text === 'string' ? b.text : '';
      const text = textSrc.trim();
      const img = imageField(typeof b.image === 'string' ? b.image : '');
      // 분할 블록은 글·이미지 둘 다 있어야 의미가 있다. 하나라도 없으면 제외.
      if (!text || !img) continue;
      blocks.push({
        type: 'split',
        text: text.slice(0, MAX_TEXT_CHARS),
        image: img,
        imageSide: pickEnum(b.imageSide, IMAGE_SIDES, 'right'),
        align: pickEnum(b.align, ALIGNS, 'left'),
      });
    }
  }
  return blocks;
}
