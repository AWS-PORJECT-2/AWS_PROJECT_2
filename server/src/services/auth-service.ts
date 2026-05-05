import { randomUUID } from 'crypto';
import type { AuthService } from '../interfaces/auth-service.js';
import type { EmailValidator } from '../interfaces/email-validator.js';
import type { GoogleOAuthClient } from '../interfaces/google-oauth-client.js';
import type { TokenService } from '../interfaces/token-service.js';
import type { UserRepository } from '../repositories/user-repository.js';
import type { OAuthStateRepository } from '../repositories/oauth-state-repository.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token-repository.js';
import type { AuthResult, User } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { TokenServiceImpl } from './token-service.js';
import { logger } from '../logger.js';

const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

export interface AuthServiceDeps {
  emailValidator: EmailValidator;
  oauthClient: GoogleOAuthClient;
  tokenService: TokenService;
  userRepository: UserRepository;
  oauthStateRepository: OAuthStateRepository;
  refreshTokenRepository: RefreshTokenRepository;
}

export class AuthServiceImpl implements AuthService {
  private readonly emailValidator: EmailValidator;
  private readonly oauthClient: GoogleOAuthClient;
  private readonly tokenService: TokenService;
  private readonly userRepo: UserRepository;
  private readonly oauthStateRepo: OAuthStateRepository;
  private readonly refreshTokenRepo: RefreshTokenRepository;

  constructor(deps: AuthServiceDeps) {
    this.emailValidator = deps.emailValidator;
    this.oauthClient = deps.oauthClient;
    this.tokenService = deps.tokenService;
    this.userRepo = deps.userRepository;
    this.oauthStateRepo = deps.oauthStateRepository;
    this.refreshTokenRepo = deps.refreshTokenRepository;
  }

  async initiateLogin(rememberMe: boolean): Promise<{ authUrl: string; state: string }> {
    const state = randomUUID();
    const now = new Date();
    await this.oauthStateRepo.save({ state, rememberMe, createdAt: now, expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS) });
    return { authUrl: this.oauthClient.buildAuthorizationUrl(state), state };
  }

  async handleCallback(code: string, state: string): Promise<AuthResult> {
    const oauthState = await this.oauthStateRepo.findByState(state);
    if (!oauthState) throw new AppError('INVALID_STATE');
    const rememberMe = oauthState.rememberMe;
    await this.oauthStateRepo.delete(state);
    if (new Date() > oauthState.expiresAt) throw new AppError('INVALID_STATE');

    const tokenResponse = await this.oauthClient.exchangeCodeForToken(code);

    let userInfo = tokenResponse.id_token
      ? await this.oauthClient.extractUserInfoFromIdToken(tokenResponse.id_token)
      : null;
    if (!userInfo) {
      userInfo = await this.oauthClient.getUserInfo(tokenResponse.access_token);
    }

    if (userInfo.email_verified === false) throw new AppError('AUTH_FAILED');
    if (!this.emailValidator.isAllowedDomain(userInfo.email)) throw new AppError('INVALID_EMAIL_DOMAIN');
    if (userInfo.hd && !this.emailValidator.isAllowedDomain(`user@${userInfo.hd}`)) throw new AppError('INVALID_EMAIL_DOMAIN');

    const user = await this.findOrCreateUser(userInfo.email, userInfo.name, userInfo.picture);
    const accessToken = this.tokenService.generateAccessToken(user);
    const refreshToken = this.tokenService.generateRefreshToken(user, rememberMe);
    const tokenHash = TokenServiceImpl.hashToken(refreshToken);
    const now = new Date();
    await this.refreshTokenRepo.save({ id: randomUUID(), userId: user.id, token: tokenHash, rememberMe, expiresAt: new Date(now.getTime() + (rememberMe ? 30*24*60*60*1000 : 24*60*60*1000)), createdAt: now });
    return { accessToken, refreshToken, rememberMe, user: { id: user.id, email: user.email, name: user.name } };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.tokenService.verifyRefreshToken(refreshToken);
    if (!payload) throw new AppError('INVALID_REFRESH_TOKEN');
    const tokenHash = TokenServiceImpl.hashToken(refreshToken);
    const storedToken = await this.refreshTokenRepo.findByTokenHash(tokenHash);
    if (!storedToken) {
      logger.warn({ userId: payload.userId }, '토큰 재사용 감지 - 전체 토큰 폐기');
      await this.refreshTokenRepo.deleteByUserId(payload.userId);
      throw new AppError('INVALID_REFRESH_TOKEN');
    }
    if (new Date() > storedToken.expiresAt) {
      await this.refreshTokenRepo.deleteByTokenHash(tokenHash);
      throw new AppError('INVALID_REFRESH_TOKEN');
    }
    const user = await this.userRepo.findByEmail(payload.email);
    if (!user) throw new AppError('INVALID_REFRESH_TOKEN');

    // 기존 refresh token 즉시 무효화
    await this.refreshTokenRepo.deleteByTokenHash(tokenHash);

    // 새 토큰 발급 (rotation)
    const newAccessToken = this.tokenService.generateAccessToken(user);
    const newRefreshToken = this.tokenService.generateRefreshToken(user, storedToken.rememberMe);
    const newTokenHash = TokenServiceImpl.hashToken(newRefreshToken);
    const now = new Date();
    await this.refreshTokenRepo.save({
      id: randomUUID(), userId: user.id, token: newTokenHash, rememberMe: storedToken.rememberMe,
      expiresAt: new Date(now.getTime() + (storedToken.rememberMe ? 30*24*60*60*1000 : 24*60*60*1000)),
      createdAt: now,
    });
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string): Promise<void> {
    await this.refreshTokenRepo.deleteByUserId(userId);
  }

  private async findOrCreateUser(email: string, name: string, picture?: string): Promise<User> {
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      await this.userRepo.updateLastLogin(existing.id);
      return { ...existing, lastLoginAt: new Date() };
    }
    const domain = email.split('@')[1] ?? '';
    const now = new Date();
    const user: User = { id: randomUUID(), email: email.toLowerCase(), name, schoolDomain: domain.toLowerCase(), picture, createdAt: now, lastLoginAt: now };
    return this.userRepo.create(user);
  }
}
