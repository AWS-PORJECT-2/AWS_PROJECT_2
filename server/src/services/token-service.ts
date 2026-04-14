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
  verifyAccessToken(token: string): TokenPayload | null { try { const d = jwt.verify(token, this.accessTokenSecret) as jwt.JwtPayload; return { userId: d.userId as string, email: d.email as string, iat: d.iat!, exp: d.exp! }; } catch { return null; } }
  verifyRefreshToken(token: string): TokenPayload | null { try { const d = jwt.verify(token, this.refreshTokenSecret) as jwt.JwtPayload; return { userId: d.userId as string, email: d.email as string, iat: d.iat!, exp: d.exp! }; } catch { return null; } }
  static hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
}
