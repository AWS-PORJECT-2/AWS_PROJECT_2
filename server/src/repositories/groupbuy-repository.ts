import type { GroupBuy, GroupBuyStatus } from '../types/index.js';

export interface GroupBuyRepository {
  create(groupbuy: GroupBuy): Promise<GroupBuy>;
  findById(id: string): Promise<GroupBuy | null>;
  findExpiredOpen(now: Date): Promise<GroupBuy[]>;
  updateStatus(id: string, status: GroupBuyStatus): Promise<void>;
  incrementQuantity(id: string, amount: number): Promise<void>;
  decrementQuantity(id: string, amount: number): Promise<void>;
}

export class InMemoryGroupBuyRepository implements GroupBuyRepository {
  private readonly store = new Map<string, GroupBuy>();

  async create(groupbuy: GroupBuy): Promise<GroupBuy> {
    this.store.set(groupbuy.id, { ...groupbuy });
    return { ...groupbuy };
  }

  async findById(id: string): Promise<GroupBuy | null> {
    const item = this.store.get(id);
    return item ? { ...item } : null;
  }

  async findExpiredOpen(now: Date): Promise<GroupBuy[]> {
    const results: GroupBuy[] = [];
    for (const gb of this.store.values()) {
      if (gb.status === 'open' && gb.deadline <= now) {
        results.push({ ...gb });
      }
    }
    return results;
  }

  async updateStatus(id: string, status: GroupBuyStatus): Promise<void> {
    const item = this.store.get(id);
    if (item) {
      item.status = status;
      item.updatedAt = new Date();
    }
  }

  async incrementQuantity(id: string, amount: number): Promise<void> {
    const item = this.store.get(id);
    if (item) {
      item.currentQuantity += amount;
      item.updatedAt = new Date();
    }
  }

  async decrementQuantity(id: string, amount: number): Promise<void> {
    const item = this.store.get(id);
    if (item) {
      item.currentQuantity -= amount;
      item.updatedAt = new Date();
    }
  }
}
