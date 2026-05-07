export interface OAuthState {
  state: string;
  rememberMe: boolean;
  createdAt: Date;
  expiresAt: Date;
}
