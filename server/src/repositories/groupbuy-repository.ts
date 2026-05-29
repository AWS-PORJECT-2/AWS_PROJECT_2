import type { GroupBuy, GroupBuyStatus } from '../types/index.js';
import type { PoolClient } from 'pg';

export interface GroupBuyListItem extends GroupBuy {
  imageUrl?: string | null;
  authorName?: string | null;
  authorDepartment?: string | null;
  category?: string | null;
}

export interface GroupBuyListOptions {
  category?: string;
  sort?: 'popular' | 'latest';
  limit?: number;
  offset?: number;
  q?: string;
}

export interface GroupBuyRepository {
  create(groupbuy: GroupBuy): Promise<GroupBuy>;
  findById(id: string): Promise<GroupBuy | null>;
  findExpiredOpen(now: Date): Promise<GroupBuy[]>;
  updateStatus(id: string, status: GroupBuyStatus): Promise<void>;
  incrementQuantity(id: string, amount: number, client?: PoolClient | null): Promise<void>;
  decrementQuantity(id: string, amount: number, client?: PoolClient | null): Promise<void>;
  list(options: GroupBuyListOptions): Promise<{ items: GroupBuyListItem[]; total: number }>;
}

