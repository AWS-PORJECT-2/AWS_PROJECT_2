export interface Address {
  id: string;
  userId: string;
  label: string;
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  roadAddress: string;
  jibunAddress: string | null;
  detailAddress: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
