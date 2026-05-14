export interface Address {
  id: string;
  userId: string;
  label: string;
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  roadAddress: string;
  jibunAddress?: string;
  detailAddress?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
