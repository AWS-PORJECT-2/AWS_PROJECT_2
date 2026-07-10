import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatLikeCount } from './display-format.js';

describe('formatLikeCount — 좋아요 99+ 캡 (표시 규칙)', () => {
  // 경계값 테이블 테스트
  it('경계값: 0, 99, 100', () => {
    expect(formatLikeCount(0)).toBe('0');
    expect(formatLikeCount(99)).toBe('99');
    expect(formatLikeCount(100)).toBe('99+');
  });

  it('0~99 사이는 그대로 표시', () => {
    expect(formatLikeCount(1)).toBe('1');
    expect(formatLikeCount(42)).toBe('42');
    expect(formatLikeCount(98)).toBe('98');
  });

  it('음수/NaN 은 0 으로 방어', () => {
    expect(formatLikeCount(-1)).toBe('0');
    expect(formatLikeCount(-999)).toBe('0');
    expect(formatLikeCount(Number.NaN)).toBe('0');
  });

  it('소수는 내림 후 판정', () => {
    expect(formatLikeCount(99.9)).toBe('99');
    expect(formatLikeCount(100.1)).toBe('99+');
  });

  // Property 3 (좋아요 캡): 임의 정수 n 에 대한 불변식
  it('[속성] n >= 100 이면 항상 99+', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 2_000_000_000 }), (n) => {
        expect(formatLikeCount(n)).toBe('99+');
      }),
    );
  });

  it('[속성] 1 <= n <= 99 이면 String(n) 과 동일', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), (n) => {
        expect(formatLikeCount(n)).toBe(String(n));
      }),
    );
  });

  it('[속성] n <= 0 이면 항상 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2_000_000_000, max: 0 }), (n) => {
        expect(formatLikeCount(n)).toBe('0');
      }),
    );
  });

  it('[속성] 반환값은 항상 문자열', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        expect(typeof formatLikeCount(n)).toBe('string');
      }),
    );
  });
});
