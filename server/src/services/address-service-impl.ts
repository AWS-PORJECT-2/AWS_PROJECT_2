import crypto from 'node:crypto';
import type { Address } from '../types/index.js';
import type { AddressRepository } from '../repositories/address-repository.js';
import { AppError } from '../errors/app-error.js';

export interface AddressService {
  create(userId: string, data: CreateAddressInput): Promise<Address>;
  list(userId: string): Promise<Address[]>;
  getById(userId: string, id: string): Promise<Address>;
  update(userId: string, id: string, data: UpdateAddressInput): Promise<Address>;
  setDefault(userId: string, id: string): Promise<Address>;
  delete(userId: string, id: string): Promise<void>;
}

export interface CreateAddressInput {
  label: string;
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  roadAddress: string;
  jibunAddress?: string;
  detailAddress?: string;
}

export interface UpdateAddressInput {
  label?: string;
  recipientName?: string;
  recipientPhone?: string;
  postalCode?: string;
  roadAddress?: string;
  jibunAddress?: string | null;
  detailAddress?: string | null;
}

interface AddressServiceDeps {
  addressRepository: AddressRepository;
}

export function createAddressService(deps: AddressServiceDeps): AddressService {
  const { addressRepository } = deps;

  return {
    async create(userId, data) {
      const existing = await addressRepository.list(userId);
      const isFirst = existing.length === 0;

      const now = new Date();
      const addr: Address = {
        id: crypto.randomUUID(),
        userId,
        label: data.label,
        recipientName: data.recipientName,
        recipientPhone: data.recipientPhone,
        postalCode: data.postalCode,
        roadAddress: data.roadAddress,
        jibunAddress: data.jibunAddress ?? null,
        detailAddress: data.detailAddress ?? null,
        isDefault: isFirst,
        createdAt: now,
        updatedAt: now,
      };

      return addressRepository.create(addr);
    },

    async list(userId) {
      return addressRepository.list(userId);
    },

    async getById(userId, id) {
      const addr = await addressRepository.findById(id);
      if (!addr) {
        throw new AppError('ADDRESS_NOT_FOUND');
      }
      if (addr.userId !== userId) {
        throw new AppError('FORBIDDEN');
      }
      return addr;
    },

    async update(userId, id, data) {
      const addr = await addressRepository.findById(id);
      if (!addr) {
        throw new AppError('ADDRESS_NOT_FOUND');
      }
      if (addr.userId !== userId) {
        throw new AppError('FORBIDDEN');
      }

      return addressRepository.update(id, data);
    },

    async setDefault(userId, id) {
      // 단일 atomic UPDATE 로 TOCTOU 제거 — 동시 호출 시 partial unique index 23505 노출 방지.
      const result = await addressRepository.setDefaultAtomic(userId, id);
      if (!result) {
        throw new AppError('ADDRESS_NOT_FOUND');
      }
      return result;
    },

    async delete(userId, id) {
      const addr = await addressRepository.findById(id);
      if (!addr) {
        throw new AppError('ADDRESS_NOT_FOUND');
      }
      if (addr.userId !== userId) {
        throw new AppError('FORBIDDEN');
      }

      const allAddresses = await addressRepository.list(userId);
      if (allAddresses.length <= 1) {
        throw new AppError('CANNOT_DELETE_LAST_ADDRESS');
      }

      await addressRepository.delete(id);

      // If deleted address was default, promote the next one (no extra query)
      if (addr.isDefault) {
        const remaining = allAddresses.filter(a => a.id !== id);
        if (remaining.length > 0) {
          await addressRepository.update(remaining[0].id, { isDefault: true });
        }
      }
    },
  };
}
