import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import type { TokenService } from '../interfaces/token-service.js';
import type { User, TokenPayload, TokenVerifyResult } from '../types/index.js';

export class TokenServiceImpl implements TokenService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;

  private static readonly MIN_SECRET_LENGTH = 32;

  constructor(accessTokenSecret?: string, refreshTokenSecret?: string) {
    if (!accessTokenSecret && !process.env.ACCESS_TOKEN_SECRET) throw new Error('ACCESS_TOKEN_SECRET 미설정');
    if (!refreshTokenSecret && !process.env.REFRESH_TOKEN_SECRET) throw new Error('REFRESH_TOKEN_SECRET 미설정');
    this.accessTokenSecret = accessTokenSecret ?? process.env.ACCESS_TOKEN_SECRET!;
    this.refreshTokenSecret = refreshTokenSecret ?? process.env.REFRESH_TOKEN_SECRET!;
    if (this.accessTokenSecret.length < TokenServiceImpl.MIN_SECRET_LENGTH) {
      throw new Error(`ACCESS_TOKEN_SECRET은 최소 ${TokenServiceImpl.MIN_SECRET_LENGTH}자 이상이어야 합니다`);
    }
    if (this.refreshTokenSecret.length < TokenServiceImpl.MIN_SECRET_LENGTH) {
      throw new Error(`REFRESH_TOKEN_SECRET은 최소 ${TokenServiceImpl.MIN_SECRET_LENGTH}자 이상이어야 합니다`);
    }
  }

  // 서명·검증 모두 HS256 으로 고정 — algorithm confusion / alg:none 우회 차단.
  private static readonly ALGS: jwt.Algorithm[] = ['HS256'];

  generateAccessToken(user: User): string { return jwt.sign({ userId: user.id, email: user.email }, this.accessTokenSecret, { expiresIn: '15m', algorithm: 'HS256' }); }
  generateRefreshToken(user: User, rememberMe: boolean): string { return jwt.sign({ userId: user.id, email: user.email }, this.refreshTokenSecret, { expiresIn: rememberMe ? '30d' : '24h', algorithm: 'HS256' }); }
  verifyAccessToken(token: string): TokenPayload | null { return this.verifyToken(token, this.accessTokenSecret); }
  verifyRefreshToken(token: string): TokenPayload | null { return this.verifyToken(token, this.refreshTokenSecret); }

  verifyAccessTokenDetailed(token: string): TokenVerifyResult {
    return this.verifyTokenDetailed(token, this.accessTokenSecret);
  }

  static hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }

  private verifyToken(token: string, secret: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, secret, { algorithms: TokenServiceImpl.ALGS });
      if (typeof decoded === 'string') return null;
      const { userId, email, iat, exp } = decoded;
      if (typeof userId !== 'string' || typeof email !== 'string' || typeof iat !== 'number' || typeof exp !== 'number') {
        return null;
      }
      return { userId, email, iat, exp };
    } catch { return null; }
  }

  private verifyTokenDetailed(token: string, secret: string): TokenVerifyResult {
    try {
      const decoded = jwt.verify(token, secret, { algorithms: TokenServiceImpl.ALGS });
      if (typeof decoded === 'string') return { valid: false, reason: 'invalid' };
      const { userId, email, iat, exp } = decoded;
      if (typeof userId !== 'string' || typeof email !== 'string' || typeof iat !== 'number' || typeof exp !== 'number') {
        return { valid: false, reason: 'invalid' };
      }
      return { valid: true, payload: { userId, email, iat, exp } };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) return { valid: false, reason: 'expired' };
      return { valid: false, reason: 'invalid' };
    }
  }
}
