export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  rememberMe: boolean;
  expiresAt: Date;
  createdAt: Date;
}
