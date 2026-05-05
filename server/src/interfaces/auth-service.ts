import type { AuthResult } from '../types/index.js';
export interface AuthService {
  initiateLogin(rememberMe: boolean): Promise<{ authUrl: string; state: string }>;
  handleCallback(code: string, state: string): Promise<AuthResult>;
  refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>;
  logout(userId: string): void;
}
