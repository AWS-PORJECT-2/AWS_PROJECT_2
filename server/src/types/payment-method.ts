export interface PaymentMethod {
  id: string;
  userId: string;
  pgProvider: string;
  channelType: 'TOSSPAY' | 'KAKAOPAY' | 'NAVERPAY' | 'CARD_DIRECT';
  encryptedBillingKey: string; // AES-256-GCM 암호화된 빌링키
  cardName: string | null;
  cardLastFour: string | null;
  isDefault: boolean;
  status: 'ACTIVE' | 'DELETED' | 'EXPIRED';
  createdAt: Date;
  updatedAt: Date;
}
