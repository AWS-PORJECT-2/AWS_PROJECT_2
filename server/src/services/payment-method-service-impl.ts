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
      const existing = await paymentMethodRepository.list(userId);
      const isFirst = existing.length === 0;

      const now = new Date();
      const pm: PaymentMethod = {
        id: crypto.randomUUID(),
        userId,
        pgProvider: data.pgProvider ?? 'tosspayments',
        channelType: data.channelType,
        encryptedBillingKey: encryptBillingKey(data.billingKeyRef),
        cardName: data.cardName ?? null,
        cardLastFour: data.cardLastFour ?? null,
        isDefault: isFirst,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      };

      return paymentMethodRepository.create(pm);
    },

    async list(userId) {
      return paymentMethodRepository.list(userId);
    },

    async setDefault(userId, id) {
      const pm = await paymentMethodRepository.findById(id);
      if (!pm || pm.status !== 'ACTIVE') {
        throw new AppError('PAYMENT_METHOD_NOT_FOUND');
      }
      if (pm.userId !== userId) {
        throw new AppError('FORBIDDEN');
      }

      await paymentMethodRepository.unsetAllDefaults(userId);
      return paymentMethodRepository.update(id, { isDefault: true });
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

      // If deleted card was default, promote the next active card
      if (pm.isDefault) {
        const remaining = await paymentMethodRepository.list(userId);
        if (remaining.length > 0) {
          await paymentMethodRepository.update(remaining[0].id, { isDefault: true });
        }
      }
    },
  };
}
