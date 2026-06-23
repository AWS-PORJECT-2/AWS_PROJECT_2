/**
 * 속성 기반 테스트(PBT) 공통 규약 및 헬퍼 - point-system
 *
 * 테스트 프레임워크: vitest (`npm test` = `vitest run`)
 * PBT 라이브러리: fast-check
 *
 * 규약 (설계 문서 "Testing Strategy - 속성 기반 테스트" 참조):
 *  1. 각 속성 테스트는 최소 100회 이상 반복한다 (numRuns >= 100). 아래 `PBT_NUM_RUNS` 기본값 사용.
 *  2. 각 속성 테스트에는 설계의 정확성 속성을 주석으로 연결한다:
 *       // Feature: point-system, Property N: {속성 텍스트}
 *  3. 대상은 InMemory 리포지토리를 주입한 PointServiceImpl 로, DB 없이 순수 비즈니스 규칙을 검증한다.
 *  4. 입력 생성기는 경계값(잔액 0, 정확히 cost, cost-1, 대량 시퀀스)을 포함하도록 구성한다.
 *
 * 사용 예:
 *   import fc from 'fast-check';
 *   import { PBT_NUM_RUNS, pbtParams } from '../test-utils/pbt.js';
 *
 *   // Feature: point-system, Property 1: 잔액 비음수 불변식
 *   it('balance is always a non-negative integer', () => {
 *     fc.assert(
 *       fc.property(opSequenceArb(), (ops) => { ... }),
 *       pbtParams(),
 *     );
 *   });
 */
import type fc from 'fast-check';

/** 모든 point-system 속성 테스트의 기본 반복 횟수. 설계 규약상 100회 이상. */
export const PBT_NUM_RUNS = 100;

/**
 * fast-check `assert`/`check` 에 전달할 공통 파라미터를 생성한다.
 * 기본 numRuns(>=100)을 적용하면서 호출부에서 필요한 옵션을 덮어쓸 수 있다.
 */
export function pbtParams(
  overrides: Parameters<typeof fc.assert>[1] = {},
): Parameters<typeof fc.assert>[1] {
  return { numRuns: PBT_NUM_RUNS, ...overrides };
}
