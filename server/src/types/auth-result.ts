export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
  user: { id: string; email: string; name: string; };
}
