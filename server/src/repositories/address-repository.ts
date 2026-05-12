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

