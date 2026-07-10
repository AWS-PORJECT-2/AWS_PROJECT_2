/**
 * 표시 포맷 유틸 (프론트 wz-core.js formatLikeCount 와 동일 규칙).
 * 좋아요 카운트 표시 캡: 저장값은 정확히 유지하고 '표시'만 캡한다.
 * - 100 이상 → '99+' 고정 (숫자 경쟁 피로감 방지)
 * - 0~99    → 그대로 문자열
 * - 음수/NaN → '0' 방어
 */
export function formatLikeCount(n: number): string {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return '0';
  return v > 99 ? '99+' : String(v);
}
