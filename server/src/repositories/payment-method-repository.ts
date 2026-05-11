import type { PaymentMethod } from '../types/index.js';

export interface PaymentMethodRepository {
  create(pm: PaymentMethod): Promise<PaymentMethod>;
  findById(id: string): Promise<PaymentMethod | null>;
  list(userId: string): Promise<PaymentMethod[]>;
  findDefault(userId: string): Promise<PaymentMethod | null>;
  update(id: string, patch: Partial<PaymentMethod>): Promise<PaymentMethod>;
  unsetAllDefaults(userId: string): Promise<void>;
}

export class InMemoryPaymentMethodRepository implements PaymentMethodRepository {
  private readonly store = new Map<string, PaymentMethod>();

  async create(pm: PaymentMethod): Promise<PaymentMethod> {
    this.store.set(pm.id, { ...pm });
    return { ...pm };
  }

  async findById(id: string): Promise<PaymentMethod | null> {
    const item = this.store.get(id);
    return item ? { ...item } : null;
  }

  async list(userId: string): Promise<PaymentMethod[]> {
    const results: PaymentMethod[] = [];
    for (const pm of this.store.values()) {
      if (pm.userId === userId && pm.status === 'ACTIVE') {
        results.push({ ...pm });
      }
    }
    return results;
  }

  async findDefault(userId: string): Promise<PaymentMethod | null> {
    for (const pm of this.store.values()) {
      if (pm.userId === userId && pm.isDefault && pm.status === 'ACTIVE') {
        return { ...pm };
      }
    }
    return null;
  }

  async update(id: string, patch: Partial<PaymentMethod>): Promise<PaymentMethod> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`PaymentMethod not found: ${id}`);
    const updated = { ...existing, ...patch, updatedAt: new Date() };
    this.store.set(id, updated);
    return { ...updated };
  }

  async unsetAllDefaults(userId: string): Promise<void> {
    for (const pm of this.store.values()) {
      if (pm.userId === userId && pm.isDefault && pm.status === 'ACTIVE') {
        pm.isDefault = false;
        pm.updatedAt = new Date();
      }
    }
  }
}
