import crypto from 'node:crypto';
import type { PaymentMethod } from '../types/index.js';
import type { PaymentMethodRepository } from '../repositories/payment-method-repository.js';
import { AppError } from '../errors/app-error.js';
import { encryptBillingKey } from '../utils/crypto.js';

export interface PaymentMethodService {
  register(userId: string, data: RegisterPaymentMethodInput): Promise<PaymentMethod>;
  list(userId: string): Promise<PaymentMethod[]>;
  setDefault(userId: string, id: string): Promise<PaymentMethod>;
  delete(userId: string, id: string): Promise<void>;
}

export interface RegisterPaymentMethodInput {
  pgProvider?: string;
  channelType: PaymentMethod['channelType'];
  billingKeyRef: string;
  cardName?: string;
  cardLastFour?: string;
}

interface PaymentMethodServiceDeps {
  paymentMethodRepository: PaymentMethodRepository;
}

export function createPaymentMethodService(deps: PaymentMethodServiceDeps): PaymentMethodService {
  const { paymentMethodRepository } = deps;

  return {
    async register(userId, data) {
      // 빌링키는 PG 가 발급한 핵심 식별자 — 빈 값 / 공백만 검증.
      if (!data.billingKeyRef || data.billingKeyRef.trim() === '') {
        throw new AppError('MISSING_REQUIRED_FIELD', 'billingKeyRef 가 필요합니다');
      }

      const existing = await paymentMethodRepository.list(userId);
      const isFirst = existing.length === 0;

      // 동시 register race 방어: 둘 다 isDefault=true 로 INSERT 하면 partial unique index 충돌.
      // 항상 false 로 INSERT 후 isFirst 면 setDefaultAtomic 으로 atomic 활성화.
      const now = new Date();
      const pm: PaymentMethod = {
        id: crypto.randomUUID(),
        userId,
        pgProvider: data.pgProvider ?? 'tosspayments',
        channelType: data.channelType,
        encryptedBillingKey: encryptBillingKey(data.billingKeyRef),
        cardName: data.cardName ?? null,
        cardLastFour: data.cardLastFour ?? null,
        isDefault: false,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      };

      const created = await paymentMethodRepository.create(pm);
      if (isFirst) {
        const result = await paymentMethodRepository.setDefaultAtomic(userId, created.id);
        return result ?? created;
      }
      return created;
    },

    async list(userId) {
      return paymentMethodRepository.list(userId);
    },

    async setDefault(userId, id) {
      // atomic UPDATE 로 unset+set 을 한 쿼리에 묶음 — 동시 호출 시 partial unique index
      // 23505 가 노출되지 않음. ownership/status 검증은 SQL 의 WHERE user_id+status='ACTIVE' 가 동시에 처리.
      const result = await paymentMethodRepository.setDefaultAtomic(userId, id);
      if (!result) {
        throw new AppError('PAYMENT_METHOD_NOT_FOUND');
      }
      return result;
    },

    async delete(userId, id) {
      const pm = await paymentMethodRepository.findById(id);
      if (!pm || pm.status !== 'ACTIVE') {
        throw new AppError('PAYMENT_METHOD_NOT_FOUND');
      }
      if (pm.userId !== userId) {
        throw new AppError('FORBIDDEN');
      }

      await paymentMethodRepository.update(id, { status: 'DELETED', isDefault: false });

      // If deleted card was default, promote the next active card.
      // setDefaultAtomic 사용 — 동시 다른 setDefault 호출과 race 시에도 partial unique index 안전.
      if (pm.isDefault) {
        const remaining = await paymentMethodRepository.list(userId);
        if (remaining.length > 0) {
          await paymentMethodRepository.setDefaultAtomic(userId, remaining[0].id);
        }
      }
    },
  };
}
