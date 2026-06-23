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
import type { PointService } from '../interfaces/point-service.js';
import { AppError } from '../errors/app-error.js';
import { accessBlock, isSuspensionExpired } from '../utils/account-status.js';
import { TokenServiceImpl } from './token-service.js';
import { notify } from './notify.js';
import { logger } from '../logger.js';

const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

// 리프레시 회전 grace 윈도우 — 동시/재시도 갱신으로 같은 토큰이 거의 동시에 들어와도
// 정상 사용자를 전체 로그아웃시키지 않기 위함. 회전 직후 N초 동안 직전 토큰 해시 →
// 이미 발급된 새 토큰쌍을 기억해두고, 그 사이 같은 토큰으로 다시 오면 같은 결과를 멱등하게 돌려준다.
// (단일 프로세스 운영 기준. 윈도우를 벗어난/한 번도 본 적 없는 토큰 재사용은 여전히 도난으로 간주해 전체 폐기.)
const REFRESH_GRACE_MS = 10 * 1000;

export interface AuthServiceDeps {
  emailValidator: EmailValidator;
  oauthClient: GoogleOAuthClient;
  tokenService: TokenService;
  userRepository: UserRepository;
  oauthStateRepository: OAuthStateRepository;
  refreshTokenRepository: RefreshTokenRepository;
  // 선택: 신규 가입 시 환영 알림(best-effort). 미주입 시 알림만 생략(가입 흐름 영향 없음).
  notificationRepository?: NotificationRepository;
  // 선택: 신규 가입 시 1회성 포인트 적립(best-effort). 미주입 시 적립만 생략(가입 흐름 영향 없음).
  pointService?: PointService;
}

export class AuthServiceImpl implements AuthService {
  private readonly emailValidator: EmailValidator;
  private readonly oauthClient: GoogleOAuthClient;
  private readonly tokenService: TokenService;
  private readonly userRepo: UserRepository;
  private readonly oauthStateRepo: OAuthStateRepository;
  private readonly refreshTokenRepo: RefreshTokenRepository;
  private readonly notificationRepo?: NotificationRepository;
  private readonly pointService?: PointService;
  // 회전 grace 캐시: 직전(이미 폐기된) 토큰 해시 → 그 회전으로 발급된 새 토큰쌍 + 만료시각.
  private readonly recentRotations = new Map<string, { result: { accessToken: string; refreshToken: string }; expiresAt: number; userId: string }>();

  constructor(deps: AuthServiceDeps) {
    this.emailValidator = deps.emailValidator;
    this.oauthClient = deps.oauthClient;
    this.tokenService = deps.tokenService;
    this.userRepo = deps.userRepository;
    this.oauthStateRepo = deps.oauthStateRepository;
    this.refreshTokenRepo = deps.refreshTokenRepository;
    this.notificationRepo = deps.notificationRepository;
    this.pointService = deps.pointService;
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
      // 직전에 정상 회전된 토큰이 동시/재시도로 다시 들어온 경우(짧은 grace 윈도우 내) → 도난이 아니라 경합.
      //  이미 발급한 새 토큰쌍을 멱등하게 돌려준다(전체 폐기 X). 단 grace 반환 전에도 제재/탈퇴/존재 게이트를
      //  재확인해, 회전~재요청 사이에 정지/차단/탈퇴된 계정이 grace 로 우회하지 못하게 한다(R2 회귀 보강).
      const graced = this.takeRecentRotation(tokenHash);
      if (graced) {
        const gUser = await this.userRepo.findByEmail(payload.email);
        const gBlock = gUser ? accessBlock(gUser) : null;
        if (!gUser || gBlock) {
          this.clearGraceForUser(payload.userId);
          await this.refreshTokenRepo.deleteByUserId(payload.userId);
          throw new AppError(gBlock ? gBlock.code : 'INVALID_REFRESH_TOKEN');
        }
        return graced;
      }
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
    const result = { accessToken: newAccessToken, refreshToken: newRefreshToken };
    // 회전 직후 grace 윈도우에 기록 — 직전 토큰으로의 동시/재시도 갱신을 멱등 처리하기 위함(userId 동봉: 로그아웃/제재 시 정리).
    this.rememberRotation(tokenHash, result, user.id);
    return result;
  }

  // grace 캐시에서 직전 회전 결과를 반환(만료분은 정리). 없으면 null.
  //  ⚠️ 윈도우(10s) 내에는 삭제하지 않고 멱등 반환한다 — 동시/재시도 N건이 같은 새 토큰쌍을 받아야 정상 사용자가
  //     강제 로그아웃되지 않기 때문. 보안은 호출부의 user 재조회+accessBlock 재검증 + logout 시 clearGraceForUser 로 보장.
  private takeRecentRotation(oldTokenHash: string): { accessToken: string; refreshToken: string } | null {
    const entry = this.recentRotations.get(oldTokenHash);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.recentRotations.delete(oldTokenHash);
      return null;
    }
    return entry.result;
  }

  private rememberRotation(oldTokenHash: string, result: { accessToken: string; refreshToken: string }, userId: string): void {
    const nowMs = Date.now();
    // 만료 항목 정리(맵 무한 증가 방지) — 회전마다 1회 스윕.
    for (const [hash, entry] of this.recentRotations) {
      if (nowMs > entry.expiresAt) this.recentRotations.delete(hash);
    }
    this.recentRotations.set(oldTokenHash, { result, expiresAt: nowMs + REFRESH_GRACE_MS, userId });
  }

  // 해당 사용자의 grace 엔트리 전부 제거 — 로그아웃/제재 시 직전 토큰의 grace 우회를 막는다.
  //  (제재/탈퇴 경로는 별도 호출이 없어도 refreshToken 의 grace 재검증이 막지만, 로그아웃은 여기서 즉시 무효화한다.)
  clearGraceForUser(userId: string): void {
    for (const [hash, entry] of this.recentRotations) {
      if (entry.userId === userId) this.recentRotations.delete(hash);
    }
  }

  async logout(userId: string): Promise<void> {
    this.clearGraceForUser(userId);
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
    // 첫 회원가입 1회성 포인트 적립(best-effort, 멱등) — 실패해도 가입 흐름은 막지 않음.
    //  기존 사용자 로그인에는 호출하지 않음(신규 생성 분기에서만 실행).
    if (this.pointService) {
      try {
        await this.pointService.earnOnce(created.id, 'signup');
      } catch (err) {
        logger.warn({ err, userId: created.id }, '가입 포인트 적립 실패(무시)');
      }
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
