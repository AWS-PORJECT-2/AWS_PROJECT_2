import type { Address } from '../types/index.js';

export interface AddressRepository {
  create(addr: Address): Promise<Address>;
  findById(id: string): Promise<Address | null>;
  list(userId: string): Promise<Address[]>;
  findDefault(userId: string): Promise<Address | null>;
  update(id: string, patch: Partial<Address>): Promise<Address>;
  delete(id: string): Promise<void>;
  unsetAllDefaults(userId: string): Promise<void>;
}

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
    for (const addr of this.store.values()) {
      if (addr.userId === userId && addr.isDefault) {
        addr.isDefault = false;
        addr.updatedAt = new Date();
      }
    }
  }
}
