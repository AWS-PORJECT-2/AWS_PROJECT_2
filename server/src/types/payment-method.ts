export interface PaymentMethod {
  id: string;
  userId: string;
  pgProvider: string;
  channelType: 'TOSSPAY' | 'KAKAOPAY' | 'NAVERPAY' | 'CARD_DIRECT';
  billingKeyRef: string;
  cardName: string | null;
  cardLastFour: string | null;
  isDefault: boolean;
  status: 'ACTIVE' | 'DELETED' | 'EXPIRED';
  createdAt: Date;
  updatedAt: Date;
}
