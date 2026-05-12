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
      // atomic: "마지막 1개는 못 지움" 가드 + DELETE 가 한 SQL 안에서 처리 → TOCTOU 없음.
      const result = await addressRepository.deleteWithGuard(userId, id);
      if (!result.deleted) {
        throw new AppError(result.reason === 'NOT_FOUND' ? 'ADDRESS_NOT_FOUND' : 'CANNOT_DELETE_LAST_ADDRESS');
      }

      // 삭제된 주소가 default 였다면 남은 것 중 하나를 default 로 승격.
      // (이미 1개 이상 남음을 deleteWithGuard 가 보장 — count > 1 조건이었으므로)
      if (result.wasDefault) {
        const remaining = await addressRepository.list(userId);
        if (remaining.length > 0) {
          await addressRepository.setDefaultAtomic(userId, remaining[0].id);
        }
      }
    },
  };
}
