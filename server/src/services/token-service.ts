import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import type { TokenService } from '../interfaces/token-service';
import type { User, TokenPayload } from '../types';

export class TokenServiceImpl implements TokenService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;

  constructor(accessTokenSecret?: string, refreshTokenSecret?: string) {
    if (!accessTokenSecret && !process.env.ACCESS_TOKEN_SECRET) throw new Error('ACCESS_TOKEN_SECRET 미설정');
    if (!refreshTokenSecret && !process.env.REFRESH_TOKEN_SECRET) throw new Error('REFRESH_TOKEN_SECRET 미설정');
    this.accessTokenSecret = accessTokenSecret ?? process.env.ACCESS_TOKEN_SECRET!;
    this.refreshTokenSecret = refreshTokenSecret ?? process.env.REFRESH_TOKEN_SECRET!;
  }

  generateAccessToken(user: User): string { return jwt.sign({ userId: user.id, email: user.email }, this.accessTokenSecret, { expiresIn: '15m' }); }
  generateRefreshToken(user: User, rememberMe: boolean): string { return jwt.sign({ userId: user.id, email: user.email }, this.refreshTokenSecret, { expiresIn: rememberMe ? '30d' : '24h' }); }
  verifyAccessToken(token: string): TokenPayload | null { return this.verifyToken(token, this.accessTokenSecret); }
  verifyRefreshToken(token: string): TokenPayload | null { return this.verifyToken(token, this.refreshTokenSecret); }
  static hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }

  private verifyToken(token: string, secret: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, secret);
      if (typeof decoded === 'string') return null;
      const { userId, email, iat, exp } = decoded;
      if (typeof userId !== 'string' || typeof email !== 'string' || typeof iat !== 'number' || typeof exp !== 'number') {
        return null;
      }
      return { userId, email, iat, exp };
    } catch { return null; }
  }
}
