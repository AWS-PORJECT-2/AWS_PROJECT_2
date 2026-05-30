/**
 * 카테고리 단일 소스(백엔드). 프론트 frontend/categories.js 와 동기화 유지.
 * type: 'apparel'(의류→가상피팅) | 'goods'(굿즈→전시 이미지) | 'none'(기타→AI 없음)
 */
export type CategoryType = 'apparel' | 'goods' | 'none';

export interface CategoryDef {
  slug: string;
  label: string;
  type: CategoryType;
}

export const CATEGORIES: readonly CategoryDef[] = [
  { slug: 'jacket', label: '과잠', type: 'apparel' },
  { slug: 'hoodie', label: '후드티·맨투맨', type: 'apparel' },
  { slug: 'tshirt', label: '반팔티', type: 'apparel' },
  { slug: 'ecobag', label: '에코백', type: 'goods' },
  { slug: 'keyring', label: '키링·스트랩', type: 'goods' },
  { slug: 'phonecase', label: '폰케이스', type: 'goods' },
  { slug: 'sticker', label: '스티커·문구', type: 'goods' },
  { slug: 'badge', label: '뱃지·배지', type: 'goods' },
  { slug: 'tumbler', label: '텀블러·머그', type: 'goods' },
  { slug: 'fabric', label: '담요·패브릭', type: 'goods' },
  { slug: 'doll', label: '인형·마스코트', type: 'goods' },
  { slug: 'accessory', label: '액세서리', type: 'goods' },
  { slug: 'etc', label: '기타', type: 'none' },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function isValidCategory(slug: string): boolean {
  return BY_SLUG.has(slug);
}

export function categoryType(slug: string | undefined | null): CategoryType {
  if (!slug) return 'none';
  return BY_SLUG.get(slug)?.type ?? 'none';
}
