import type { PaymentMethod } from '../types/index.js';

export interface PaymentMethodRepository {
  create(pm: PaymentMethod): Promise<PaymentMethod>;
  findById(id: string): Promise<PaymentMethod | null>;
  list(userId: string): Promise<PaymentMethod[]>;
  findDefault(userId: string): Promise<PaymentMethod | null>;
  update(id: string, patch: Partial<PaymentMethod>): Promise<PaymentMethod>;
  unsetAllDefaults(userId: string): Promise<void>;
  /**
   * 한 SQL 안에서 대상 row 만 is_default=true, 나머지는 false 로 atomic 설정.
   * unsetAllDefaults + update 두 쿼리로 분리한 TOCTOU race 를 막는다.
   */
  setDefaultAtomic(userId: string, id: string): Promise<PaymentMethod | null>;
}

