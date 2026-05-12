import type { Address } from '../types/index.js';

export interface AddressRepository {
  create(addr: Address): Promise<Address>;
  findById(id: string): Promise<Address | null>;
  list(userId: string): Promise<Address[]>;
  findDefault(userId: string): Promise<Address | null>;
  update(id: string, patch: Partial<Address>): Promise<Address>;
  delete(id: string): Promise<void>;
  unsetAllDefaults(userId: string): Promise<void>;
  /** 한 SQL 안에 unset+set 처리. setDefault 동시 호출의 partial unique index 충돌 방지. */
  setDefaultAtomic(userId: string, id: string): Promise<Address | null>;
  /**
   * "마지막 1개는 못 지움" 가드와 DELETE 를 한 SQL 안에서 처리. TOCTOU race 방지.
   * 반환: { deleted: true, wasDefault } 성공, { deleted: false, reason } 실패 (NOT_FOUND | LAST).
   */
  deleteWithGuard(userId: string, id: string): Promise<DeleteResult>;
}

export type DeleteResult =
  | { deleted: true; wasDefault: boolean }
  | { deleted: false; reason: 'NOT_FOUND' | 'LAST' };

export class InMemoryAddressRepository implements AddressRepository {
  private readonly store = new Map<string, Address>();

  async create(addr: Address): Promise<Address> {
    this.store.set(addr.id, { ...addr });
    return { ...addr };
  }

  async findById(id: string): Promise<Address | null> {
    const item = this.store.get(id);
    return item ? { ...item } : null;
  }

  async list(userId: string): Promise<Address[]> {
    const results: Address[] = [];
    for (const addr of this.store.values()) {
      if (addr.userId === userId) {
        results.push({ ...addr });
      }
    }
    return results;
  }

  async findDefault(userId: string): Promise<Address | null> {
    for (const addr of this.store.values()) {
      if (addr.userId === userId && addr.isDefault) {
        return { ...addr };
      }
    }
    return null;
  }

  async update(id: string, patch: Partial<Address>): Promise<Address> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`Address not found: ${id}`);
    const updated = { ...existing, ...patch, updatedAt: new Date() };
    this.store.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async unsetAllDefaults(userId: string): Promise<void> {
    // 방어적 복사 — 다른 메서드들과 일관 (store 의 객체를 mutate 하지 않음).
    const now = new Date();
    for (const addr of this.store.values()) {
      if (addr.userId === userId && addr.isDefault) {
        this.store.set(addr.id, { ...addr, isDefault: false, updatedAt: now });
      }
    }
  }

  async setDefaultAtomic(userId: string, id: string): Promise<Address | null> {
    const target = this.store.get(id);
    if (!target || target.userId !== userId) return null;
    const now = new Date();
    for (const addr of this.store.values()) {
      if (addr.userId === userId) {
        const shouldBeDefault = addr.id === id;
        if (addr.isDefault !== shouldBeDefault) {
          this.store.set(addr.id, { ...addr, isDefault: shouldBeDefault, updatedAt: now });
        }
      }
    }
    return { ...this.store.get(id)! };
  }

  async deleteWithGuard(userId: string, id: string): Promise<DeleteResult> {
    const target = this.store.get(id);
    if (!target || target.userId !== userId) return { deleted: false, reason: 'NOT_FOUND' };
    // 동시 호출 시 둘 다 size=2 보고 통과하는 race 방지 — JS single-thread 라
    // 함수 본문 안에선 atomic. 한 함수 호출이 size 검사 + delete 를 분할 안 함.
    const userAddrs = Array.from(this.store.values()).filter((a) => a.userId === userId);
    if (userAddrs.length <= 1) return { deleted: false, reason: 'LAST' };
    const wasDefault = target.isDefault;
    this.store.delete(id);
    return { deleted: true, wasDefault };
  }
}
