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
export const MAX_HTML_CHARS = 200_000; // WYSIWYG html 블록 1개의 새니타이즈 후 상한

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

// ───────────────────────── 스토리 HTML 새니타이즈 (심층 방어) ─────────────────────────
// WYSIWYG(임의 HTML) 블록용 서버측 새니타이즈. Node 엔 DOM 이 없으므로 정규식 기반 보수적 필터다.
// 1차 방어는 클라 렌더 시점의 DOMPurify(아래 allowlist 와 동일하게 맞춤). 이 함수는 심층 방어로,
// 완벽한 HTML 파서는 아니지만 script/style/주석/위험 iframe/on* 핸들러/위험 스킴은 확실히 제거한다.
// 의심스러운 것은 보수적으로(제거 우선) 처리한다.

// 허용 태그(소문자). 이 목록 외의 여는/닫는 태그는 태그만 벗기고 내부 텍스트는 보존한다.
const HTML_ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'mark',
  'span', 'div', 'ul', 'ol', 'li', 'blockquote', 'hr', 'a', 'img', 'figure', 'figcaption', 'iframe',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'audio', 'video', 'source',
]);

// 허용 속성(소문자). on* 이벤트 핸들러는 전부 제거(아래 별도 처리).
const HTML_ALLOWED_ATTRS: ReadonlySet<string> = new Set([
  'href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height', 'style', 'class',
  'data-align', 'data-width', 'controls', 'allow', 'allowfullscreen', 'frameborder',
  'colspan', 'rowspan',
]);

// style 인라인에서 허용하는 CSS 속성(소문자). 그 외 선언은 제거.
const HTML_ALLOWED_STYLE_PROPS: ReadonlySet<string> = new Set([
  'text-align', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'color',
  'background-color', 'width', 'max-width', 'float', 'margin', 'margin-left', 'margin-right',
]);

// iframe src 화이트리스트(youtube/vimeo embed). 아니면 iframe 태그 자체 제거.
const IFRAME_SRC_OK = /^https:\/\/(www\.youtube\.com\/embed\/|www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)/;

// href/src 등 URL 속성값 검증. 허용되면 정규화된 값, 아니면 null(속성 제거).
//  - http(s)/mailto/상대경로 허용. javascript:/vbscript:/file: 금지.
//  - data: 는 data:image/(png|jpe?g|webp|gif) 만 허용.
function safeUrlAttr(raw: string): string | null {
  // HTML 엔티티/공백/제어문자 디코드 후 스킴 판정(우회 방지).
  const decoded = raw
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&colon;?/gi, ':')
    .replace(/&tab;?/gi, '\t')
    .replace(/&newline;?/gi, '\n');
  // 스킴 판정용으로만 제어문자/공백 제거(원본 보존은 별도).
  const probe = decoded.replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase();
  if (/^(javascript|vbscript|file):/.test(probe)) return null;
  // data: 는 이미지 화이트리스트만.
  if (probe.startsWith('data:')) {
    return /^data:image\/(png|jpe?g|webp|gif)[;,]/.test(probe) ? raw.trim() : null;
  }
  // http(s)/mailto/상대경로(스킴 없음 + 명시적 위험스킴 아님)는 허용.
  return raw.trim();
}

// 한 태그의 속성 문자열(<tag 와 > 사이)을 새니타이즈해서 재조립.
// on* 제거 / 비허용 속성 제거 / href·src 스킴 검증 / style prop 필터.
function sanitizeAttributes(tagName: string, attrStr: string): string | null {
  const out: string[] = [];
  // name="..." | name='...' | name=unquoted | name(불리언) 토큰 단위 매칭.
  const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*("[^"]*"|'[^']*'|[^\s"'`=<>]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(attrStr)) !== null) {
    const name = m[1].toLowerCase();
    let rawVal = m[3] ?? '';
    // 따옴표 제거.
    if (rawVal && (rawVal[0] === '"' || rawVal[0] === "'")) rawVal = rawVal.slice(1, -1);
    const hasValue = m[2] !== undefined;

    if (/^on/i.test(name)) continue;                  // on* 이벤트 핸들러 전부 제거
    if (!HTML_ALLOWED_ATTRS.has(name)) continue;       // 비허용 속성 제거

    if (name === 'href' || name === 'src') {
      const safe = safeUrlAttr(rawVal);
      if (safe === null) continue;                     // 위험 스킴 → 속성 제거(태그 무력화)
      out.push(`${name}="${escapeAttr(safe)}"`);
      continue;
    }
    if (name === 'style') {
      const safeStyle = sanitizeStyle(rawVal);
      if (!safeStyle) continue;                         // 허용 선언 없으면 style 제거
      out.push(`style="${escapeAttr(safeStyle)}"`);
      continue;
    }
    if (!hasValue) { out.push(name); continue; }        // 불리언 속성(allowfullscreen 등)
    out.push(`${name}="${escapeAttr(rawVal)}"`);
  }
  // iframe 은 src 가 화이트리스트 통과해야만 유지. (src 없으면 제거)
  if (tagName === 'iframe') {
    const srcMatch = out.find((a) => /^src="/.test(a));
    if (!srcMatch) return null;
    const src = srcMatch.slice(5, -1); // 'src="' ... '"'
    if (!IFRAME_SRC_OK.test(decodeAttr(src))) return null;
  }
  return out.join(' ');
}

// style 선언에서 허용 prop 만 남기고 재조립. url(...)/expression()/javascript: 등 위험 값은 제거.
function sanitizeStyle(style: string): string {
  const decls: string[] = [];
  for (const part of style.split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (!HTML_ALLOWED_STYLE_PROPS.has(prop)) continue;
    // 값에 위험 토큰(url(/expression/javascript:/등)이 있으면 해당 선언 제거.
    if (/url\s*\(|expression\s*\(|javascript:|vbscript:|@import|<|>/i.test(val)) continue;
    if (!val) continue;
    decls.push(`${prop}: ${val}`);
  }
  return decls.join('; ');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}
function decodeAttr(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

// 스토리 본문 HTML 새니타이즈(심층 방어, 정규식 기반).
// 처리 순서:
//  1) script/style 블록 + HTML 주석 통째 제거.
//  2) 비-화이트리스트 iframe(youtube/vimeo embed 아님) 제거(여닫이 통째).
//  3) 남은 모든 태그를 토큰 단위로 순회: 허용 태그가 아니면 태그만 벗기고(내부 텍스트 보존),
//     허용 태그면 속성 새니타이즈(on 핸들러/비허용/위험스킴/style 필터). iframe 은 src 재검증.
//  4) MAX_HTML_CHARS 로 절단.
export function sanitizeStoryHtml(html: string, maxChars: number = MAX_HTML_CHARS): string {
  if (typeof html !== 'string' || !html) return '';
  let s = html;
  // 정규식 패스 '전' 입력 길이 캡 — 대용량(최대 전역 바디) 입력에 다중 정규식을 돌릴 때의
  // 이벤트루프 블록/RangeError 방지. (결과 캡(line 아래)과 별개로 입력 자체를 먼저 제한.)
  if (s.length > maxChars * 2) s = s.slice(0, maxChars * 2);

  // 1) script/style 블록 + HTML 주석 제거(여닫이 사이 전부). 닫는 태그 없는 경우도 끝까지 제거.
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  s = s.replace(/<script\b[^>]*>[\s\S]*$/gi, '');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  s = s.replace(/<style\b[^>]*>[\s\S]*$/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // CDATA/처리지시 등 잔재 제거.
  s = s.replace(/<![\s\S]*?>/g, '');
  s = s.replace(/<\?[\s\S]*?\?>/g, '');

  // 2) 위험 iframe(여닫이) 통째 제거 — src 가 화이트리스트 아니면.
  s = s.replace(/<iframe\b([^>]*)>([\s\S]*?)<\/iframe\s*>/gi, (full, attrs: string) => {
    const src = extractAttrValue(attrs, 'src');
    return src && IFRAME_SRC_OK.test(decodeAttr(src)) ? full : '';
  });
  // 닫는 태그 없는 iframe 도 src 검증.
  s = s.replace(/<iframe\b([^>]*)\/?>/gi, (full, attrs: string) => {
    const src = extractAttrValue(attrs, 'src');
    return src && IFRAME_SRC_OK.test(decodeAttr(src)) ? full : '';
  });

  // 3) 모든 태그 토큰 순회.
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/g, (full, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase();
    const isClose = full[1] === '/';
    if (!HTML_ALLOWED_TAGS.has(name)) return ''; // 비허용 태그: 태그만 제거(내부 텍스트는 그대로 남음)
    if (isClose) return `</${name}>`;
    const selfClose = /\/>\s*$/.test(full);
    const cleanedAttrs = sanitizeAttributes(name, attrs);
    if (cleanedAttrs === null) return ''; // iframe src 재검증 실패 등
    const attrPart = cleanedAttrs ? ` ${cleanedAttrs}` : '';
    return selfClose ? `<${name}${attrPart} />` : `<${name}${attrPart}>`;
  });

  // 4) 길이 제한.
  if (s.length > maxChars) s = s.slice(0, maxChars);
  return s;
}

// 속성 문자열에서 특정 속성값(따옴표 제거) 1개 추출. 없으면 ''.
function extractAttrValue(attrStr: string, attr: string): string {
  const re = new RegExp(`\\b${attr}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s"'\`=<>]+)`, 'i');
  const m = re.exec(attrStr);
  if (!m) return '';
  let v = m[1];
  if (v[0] === '"' || v[0] === "'") v = v.slice(1, -1);
  return v;
}

// 새니타이즈된 HTML 에 의미 있는 콘텐츠(텍스트 또는 이미지)가 있는지 판정.
// 태그를 모두 벗기고 엔티티/공백을 정리해 텍스트가 남거나, <img/<iframe/<video/<audio 가 있으면 true.
function htmlHasContent(html: string): boolean {
  if (/<(img|iframe|video|audio)\b/i.test(html)) return true;
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, '')
    .replace(/[\s\u00a0]+/g, '');
  return text.length > 0;
}

// html 블록 문자열에서 첫 <img src="..."> 의 src 추출(없으면 null).
export function firstHtmlImageSrc(html: string): string | null {
  if (typeof html !== 'string') return null;
  const m = /<img\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/i.exec(html);
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? '').trim() || null;
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
    } else if (b.type === 'html') {
      if (typeof b.html !== 'string') continue;
      const html = sanitizeStoryHtml(b.html);
      // 새니타이즈 결과에 의미 있는 텍스트/이미지가 모두 없으면(빈 HTML) 블록 제외.
      if (!htmlHasContent(html)) continue;
      blocks.push({ type: 'html', html });
    }
  }
  return blocks;
}
