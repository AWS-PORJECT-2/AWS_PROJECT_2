export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; };
}
