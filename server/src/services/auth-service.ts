import { randomUUID } from 'crypto';
import type { AuthService } from '../interfaces/auth-service.js';
import type { EmailValidator } from '../interfaces/email-validator.js';
import type { GoogleOAuthClient } from '../interfaces/google-oauth-client.js';
import type { TokenService } from '../interfaces/token-service.js';
import type { UserRepository } from '../repositories/user-repository.js';
import type { OAuthStateRepository } from '../repositories/oauth-state-repository.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token-repository.js';
import type { AuthResult, User } from '../types/index.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import { AppError } from '../errors/app-error.js';
import { accessBlock, isSuspensionExpired } from '../utils/account-status.js';
import { TokenServiceImpl } from './token-service.js';
import { notify } from './notify.js';
import { logger } from '../logger.js';

const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

export interface AuthServiceDeps {
  emailValidator: EmailValidator;
  oauthClient: GoogleOAuthClient;
  tokenService: TokenService;
  userRepository: UserRepository;
  oauthStateRepository: OAuthStateRepository;
  refreshTokenRepository: RefreshTokenRepository;
  // 선택: 신규 가입 시 환영 알림(best-effort). 미주입 시 알림만 생략(가입 흐름 영향 없음).
  notificationRepository?: NotificationRepository;
}

export class AuthServiceImpl implements AuthService {
  private readonly emailValidator: EmailValidator;
  private readonly oauthClient: GoogleOAuthClient;
  private readonly tokenService: TokenService;
  private readonly userRepo: UserRepository;
  private readonly oauthStateRepo: OAuthStateRepository;
  private readonly refreshTokenRepo: RefreshTokenRepository;
  private readonly notificationRepo?: NotificationRepository;

  constructor(deps: AuthServiceDeps) {
    this.emailValidator = deps.emailValidator;
    this.oauthClient = deps.oauthClient;
    this.tokenService = deps.tokenService;
    this.userRepo = deps.userRepository;
    this.oauthStateRepo = deps.oauthStateRepository;
    this.refreshTokenRepo = deps.refreshTokenRepository;
    this.notificationRepo = deps.notificationRepository;
  }

  async initiateLogin(rememberMe: boolean, mobile = false): Promise<{ authUrl: string; state: string }> {
    // 모바일(앱) 로그인은 state 앞에 'm_' 를 붙여 콜백에서 구분한다(별도 redirect_uri/마이그레이션 불필요).
    const state = (mobile ? 'm_' : '') + randomUUID();
    const now = new Date();
    await this.oauthStateRepo.save({ state, rememberMe, createdAt: now, expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS) });
    return { authUrl: this.oauthClient.buildAuthorizationUrl(state), state };
  }

  async handleCallback(code: string, state: string): Promise<AuthResult> {
    const oauthState = await this.oauthStateRepo.findByState(state);
    if (!oauthState) throw new AppError('INVALID_STATE');
    if (new Date() > oauthState.expiresAt) {
      // 만료된 state 도 즉시 삭제하여 재시도 시 INVALID_STATE 로 일관되게 떨어지게 한다.
      await this.oauthStateRepo.delete(state);
      throw new AppError('INVALID_STATE');
    }
    const rememberMe = oauthState.rememberMe;
    await this.oauthStateRepo.delete(state);

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

    // 제재 게이트 — 정지/차단/탈퇴 계정은 access 토큰 재발급 거부(폐기 누락/경합 시의 우회 차단).
    const block = accessBlock(user);
    if (block) {
      await this.refreshTokenRepo.deleteByUserId(user.id);
      logger.warn({ userId: user.id, status: user.status }, '제재 계정 refresh 차단');
      throw new AppError(block.code);
    }
    if (isSuspensionExpired(user)) await this.userRepo.clearExpiredSuspension(user.id);

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
    const lower = email.toLowerCase();
    const isAdminEmail = ADMIN_EMAILS.has(lower);
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      // 제재 게이트(로그인 시점) — 차단 계정은 로그인 거부. 만료된 기간정지는 자동 복구 후 진행.
      const block = accessBlock(existing);
      if (block) {
        logger.warn({ userId: existing.id, status: existing.status }, '제재 계정 로그인 차단');
        throw new AppError(block.code);
      }
      if (isSuspensionExpired(existing)) await this.userRepo.clearExpiredSuspension(existing.id);
      await this.userRepo.updateLastLogin(existing.id);
      // ADMIN_EMAILS 에 포함되면 로그인 시 ADMIN 으로 승격(멱등). 자동 강등은 하지 않음.
      if (isAdminEmail && existing.role !== 'ADMIN') {
        await this.userRepo.setRole(existing.id, 'ADMIN');
        logger.info({ userId: existing.id, email: lower }, 'ADMIN_EMAILS 일치 — ADMIN 승격');
        return { ...existing, role: 'ADMIN', lastLoginAt: new Date() };
      }
      return { ...existing, lastLoginAt: new Date() };
    }
    const domain = email.split('@')[1] ?? '';
    const now = new Date();
    const user: User = { id: randomUUID(), email: lower, name, schoolDomain: domain.toLowerCase(), picture, role: isAdminEmail ? 'ADMIN' : 'USER', createdAt: now, lastLoginAt: now };
    const created = await this.userRepo.create(user);
    // 첫 회원가입 환영 알림(best-effort) — 실패해도 가입 흐름은 막지 않음.
    if (this.notificationRepo) {
      await notify(this.notificationRepo, {
        userId: created.id,
        type: 'welcome',
        title: '두띵에 오신 것을 환영해요',
        body: '관심 있는 프로젝트를 후원하고, 직접 프로젝트를 열어보세요.',
      });
    }
    return created;
  }
}

// 환경변수 ADMIN_EMAILS(콤마 구분) → 소문자 Set. 로그인 시 자동 ADMIN 승격에 사용.
const ADMIN_EMAILS: ReadonlySet<string> = new Set(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
