import type { Address } from '../types/index.js';

export interface AddressRepository {
  create(address: Omit<Address, 'id' | 'createdAt' | 'updatedAt'>): Promise<Address>;
  findByUserId(userId: string): Promise<Address[]>;
  findById(id: string, userId: string): Promise<Address | null>;
  update(id: string, userId: string, data: Partial<Omit<Address, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<Address | null>;
  delete(id: string, userId: string): Promise<boolean>;
  setDefault(id: string, userId: string): Promise<void>;
}
