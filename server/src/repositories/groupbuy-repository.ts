import type { GroupBuy, GroupBuyStatus } from '../types/index.js';
import type { PoolClient } from 'pg';

export interface GroupBuyRepository {
  create(groupbuy: GroupBuy): Promise<GroupBuy>;
  findById(id: string): Promise<GroupBuy | null>;
  findExpiredOpen(now: Date): Promise<GroupBuy[]>;
  updateStatus(id: string, status: GroupBuyStatus): Promise<void>;
  incrementQuantity(id: string, amount: number, client?: PoolClient | null): Promise<void>;
  decrementQuantity(id: string, amount: number, client?: PoolClient | null): Promise<void>;
}

