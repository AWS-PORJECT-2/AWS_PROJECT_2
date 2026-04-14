import { randomUUID } from 'crypto';
import type { AuthService } from '../interfaces/auth-service';
import type { EmailValidator } from '../interfaces/email-validator';
import type { GoogleOAuthClient } from '../interfaces/google-oauth-client';
import type { TokenService } from '../interfaces/token-service';
import type { AuthResult, OAuthState, User, RefreshToken } from '../types';
import { AppError } from '../errors/app-error';
import { TokenServiceImpl } from './token-service';

const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

export class AuthServiceImpl implements AuthService {
  private readonly emailValidator: EmailValidator;
  private readonly oauthClient: GoogleOAuthClient;
  private readonly tokenService: TokenService;
  private readonly oauthStates = new Map<string, OAuthState>();
  private readonly users = new Map<string, User>();
  private readonly refreshTokens = new Map<string, RefreshToken>();

  constructor(emailValidator: EmailValidator, oauthClient: GoogleOAuthClient, tokenService: TokenService) {
    this.emailValidator = emailValidator; this.oauthClient = oauthClient; this.tokenService = tokenService;
  }

  async initiateLogin(rememberMe: boolean): Promise<{ authUrl: string; state: string }> {
    const state = randomUUID();
    const now = new Date();
    this.oauthStates.set(state, { state, rememberMe, createdAt: now, expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS) });
    return { authUrl: this.oauthClient.buildAuthorizationUrl(state), state };
  }

  async handleCallback(code: string, state: string): Promise<AuthResult> {
    const oauthState = this.oauthStates.get(state);
    if (!oauthState) throw new AppError('INVALID_STATE');
    const rememberMe = oauthState.rememberMe;
    this.oauthStates.delete(state);
    if (new Date() > oauthState.expiresAt) throw new AppError('INVALID_STATE');

    const tokenResponse = await this.oauthClient.exchangeCodeForToken(code);
    const userInfo = await this.oauthClient.getUserInfo(tokenResponse.access_token);
    if (!this.emailValidator.isAllowedDomain(userInfo.email)) throw new AppError('INVALID_EMAIL_DOMAIN');

    const user = this.findOrCreateUser(userInfo.email, userInfo.name, userInfo.picture);
    const accessToken = this.tokenService.generateAccessToken(user);
    const refreshToken = this.tokenService.generateRefreshToken(user, rememberMe);
    const tokenHash = TokenServiceImpl.hashToken(refreshToken);
    const now = new Date();
    this.refreshTokens.set(tokenHash, { id: randomUUID(), userId: user.id, token: tokenHash, rememberMe, expiresAt: new Date(now.getTime() + (rememberMe ? 30*24*60*60*1000 : 24*60*60*1000)), createdAt: now });
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name } };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = this.tokenService.verifyRefreshToken(refreshToken);
    if (!payload) throw new AppError('INVALID_REFRESH_TOKEN');
    const tokenHash = TokenServiceImpl.hashToken(refreshToken);
    if (!this.refreshTokens.get(tokenHash)) throw new AppError('INVALID_REFRESH_TOKEN');
    const user = this.findUserById(payload.userId);
    if (!user) throw new AppError('INVALID_REFRESH_TOKEN');
    return { accessToken: this.tokenService.generateAccessToken(user) };
  }

  private findOrCreateUser(email: string, name: string, picture?: string): User {
    const existing = this.users.get(email.toLowerCase());
    if (existing) { existing.lastLoginAt = new Date(); return existing; }
    const domain = email.split('@')[1] ?? '';
    const now = new Date();
    const user: User = { id: randomUUID(), email: email.toLowerCase(), name, schoolDomain: domain.toLowerCase(), picture, createdAt: now, lastLoginAt: now };
    this.users.set(user.email, user);
    return user;
  }

  private findUserById(userId: string): User | undefined {
    for (const user of this.users.values()) { if (user.id === userId) return user; }
    return undefined;
  }
}
