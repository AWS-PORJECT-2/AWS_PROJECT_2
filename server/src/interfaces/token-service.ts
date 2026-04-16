import type { User, TokenPayload } from '../types/index.js';
export interface TokenService {
  generateAccessToken(user: User): string;
  generateRefreshToken(user: User, rememberMe: boolean): string;
  verifyAccessToken(token: string): TokenPayload | null;
  verifyRefreshToken(token: string): TokenPayload | null;
}
