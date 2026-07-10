import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * 인메모리 프렌드십 모델 — pg-follow-repository 의 upsert/setStatus/getStatus/areFriends 와
 * 동일 의미를 갖는 순수 구현. DB 없이 상태 전이 불변식(P4 대칭성, P5 pending 비대칭)을 검증한다.
 * key = `${from}>${to}` → 'pending' | 'accepted'
 */
class InMemoryFriends {
  private m = new Map<string, 'pending' | 'accepted'>();
  private k(a: string, b: string) { return `${a}>${b}`; }

  upsert(from: string, to: string, status: 'pending' | 'accepted') {
    if (from === to) return;
    this.m.set(this.k(from, to), status);
  }
  setStatus(from: string, to: string, status: 'pending' | 'accepted') {
    if (this.m.has(this.k(from, to))) this.m.set(this.k(from, to), status);
  }
  getStatus(from: string, to: string): 'pending' | 'accepted' | null {
    return this.m.get(this.k(from, to)) ?? null;
  }
  remove(from: string, to: string) { this.m.delete(this.k(from, to)); }
  areFriends(a: string, b: string): boolean {
    if (a === b) return false;
    return this.getStatus(a, b) === 'accepted' && this.getStatus(b, a) === 'accepted';
  }

  // 라우트 핸들러 로직과 동일한 상위 동작들
  request(from: string, to: string) {
    if (from === to) return;
    // 상대가 이미 나에게 pending → 즉시 상호 accepted
    if (this.getStatus(to, from) === 'pending') {
      this.setStatus(to, from, 'accepted');
      this.upsert(from, to, 'accepted');
      return;
    }
    this.upsert(from, to, 'pending');
  }
  accept(me: string, requester: string) {
    if (this.getStatus(requester, me) !== 'pending') return;
    this.setStatus(requester, me, 'accepted');
    this.upsert(me, requester, 'accepted');
  }
  unfriend(a: string, b: string) { this.remove(a, b); this.remove(b, a); }
}

describe('프렌드십 상태 전이 (상호 수락)', () => {
  it('요청 → pending (비대칭)', () => {
    const f = new InMemoryFriends();
    f.request('A', 'B');
    expect(f.getStatus('A', 'B')).toBe('pending');
    expect(f.getStatus('B', 'A')).toBeNull();
    expect(f.areFriends('A', 'B')).toBe(false);
  });

  it('수락 → 양방향 accepted (대칭)', () => {
    const f = new InMemoryFriends();
    f.request('A', 'B');
    f.accept('B', 'A');
    expect(f.areFriends('A', 'B')).toBe(true);
    expect(f.areFriends('B', 'A')).toBe(true);
  });

  it('맞요청(상대가 이미 pending)이면 즉시 친구', () => {
    const f = new InMemoryFriends();
    f.request('A', 'B');
    f.request('B', 'A'); // A가 이미 보냈으니 즉시 수락
    expect(f.areFriends('A', 'B')).toBe(true);
  });

  it('친구 끊기 → none', () => {
    const f = new InMemoryFriends();
    f.request('A', 'B'); f.accept('B', 'A');
    f.unfriend('A', 'B');
    expect(f.areFriends('A', 'B')).toBe(false);
    expect(f.getStatus('A', 'B')).toBeNull();
    expect(f.getStatus('B', 'A')).toBeNull();
  });

  it('요청 취소 → none', () => {
    const f = new InMemoryFriends();
    f.request('A', 'B');
    f.unfriend('A', 'B');
    expect(f.areFriends('A', 'B')).toBe(false);
  });

  it('pending 상태에서 엉뚱한 수락 시도는 무효', () => {
    const f = new InMemoryFriends();
    f.request('A', 'B');
    f.accept('A', 'B'); // A가 B의 요청을 수락? B는 요청한 적 없음
    expect(f.areFriends('A', 'B')).toBe(false);
  });

  // Property 4: 대칭성 — areFriends 는 항상 대칭
  it('[속성 P4] areFriends(a,b) === areFriends(b,a)', () => {
    const users = ['A', 'B', 'C', 'D'];
    const opArb = fc.record({
      kind: fc.constantFrom('request', 'accept', 'unfriend'),
      x: fc.constantFrom(...users),
      y: fc.constantFrom(...users),
    });
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), (ops) => {
        const f = new InMemoryFriends();
        for (const op of ops) {
          if (op.x === op.y) continue;
          if (op.kind === 'request') f.request(op.x, op.y);
          else if (op.kind === 'accept') f.accept(op.x, op.y);
          else f.unfriend(op.x, op.y);
        }
        for (const a of users) for (const b of users) {
          expect(f.areFriends(a, b)).toBe(f.areFriends(b, a));
        }
      }),
    );
  });

  // Property 5: pending 동안에는 어느 방향으로도 친구가 아님
  it('[속성 P5] 한쪽만 pending 이면 친구 아님', () => {
    fc.assert(
      fc.property(fc.constantFrom('A', 'B'), fc.constantFrom('C', 'D'), (a, b) => {
        const f = new InMemoryFriends();
        f.request(a, b); // 아직 수락 전
        expect(f.areFriends(a, b)).toBe(false);
        expect(f.areFriends(b, a)).toBe(false);
      }),
    );
  });

  // 자기 자신과는 친구가 될 수 없음
  it('[속성] 자기 자신은 친구 아님', () => {
    fc.assert(
      fc.property(fc.string(), (u) => {
        const f = new InMemoryFriends();
        f.request(u, u);
        expect(f.areFriends(u, u)).toBe(false);
      }),
    );
  });
});
