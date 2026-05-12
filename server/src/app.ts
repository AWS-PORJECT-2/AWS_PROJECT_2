import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { AllowedDomain } from './types/allowed-domain.js';
import { EmailValidatorImpl } from './services/email-validator.js';
import { GoogleOAuthClientImpl } from './services/google-oauth-client.js';
import { MockOAuthClient } from './services/mock-oauth-client.js';
import { TokenServiceImpl } from './services/token-service.js';
import { AuthServiceImpl } from './services/auth-service.js';
import { createAuthRouter } from './routes/index.js';
import { createAiRouter } from './routes/ai.js';
import { createGarmentsFetchUrlHandler } from './routes/garments-fetch-url.js';
import { createFundsCreateHandler } from './routes/funds-create.js';
import { createAuthRequired } from './middleware/auth-required.js';
import { errorHandler } from './middleware/error-handler.js';
import { ComfyUiDesignGenerator } from './services/ai/comfyui-design-generator.js';
import { CatVtonVirtualTryOn } from './services/ai/catvton-virtual-try-on.js';
import { NullAiDesignGenerator, NullAiVirtualTryOn } from './services/ai/null-ai-providers.js';
import type { AiDesignGenerator } from './interfaces/ai-design-generator.js';
import type { AiVirtualTryOn } from './interfaces/ai-virtual-try-on.js';
import { pool } from './db.js';
import { PgUserRepository } from './repositories/pg-user-repository.js';
import { PgOAuthStateRepository } from './repositories/pg-oauth-state-repository.js';
import { PgRefreshTokenRepository } from './repositories/pg-refresh-token-repository.js';
import { InMemoryUserRepository } from './repositories/user-repository.js';
import { InMemoryOAuthStateRepository } from './repositories/oauth-state-repository.js';
import { InMemoryRefreshTokenRepository } from './repositories/refresh-token-repository.js';

const defaultAllowedDomains: AllowedDomain[] = [
  { id: '550e8400-e29b-41d4-a716-446655440001', domain: 'kookmin.ac.kr', schoolName: '국민대학교', isActive: true },
];

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const USE_INMEMORY = process.env.USE_INMEMORY === 'true' && !IS_PRODUCTION;
const USE_MOCK_OAUTH = process.env.USE_MOCK_OAUTH === 'true' && !IS_PRODUCTION;
const MOCK_LOGIN_EMAIL = process.env.MOCK_LOGIN_EMAIL ?? 'test@kookmin.ac.kr';

// AI 어댑터 환경변수 — 미설정 시 NullAi* 로 fallback (라우트가 503 응답)
const AI_DESIGN_URL = process.env.AI_DESIGN_URL ?? '';
const AI_TRYON_URL = process.env.AI_TRYON_URL ?? '';
const AI_WORKFLOW_DIR = process.env.AI_COMFYUI_WORKFLOW_DIR ?? '';
const AI_TRYON_MODEL_DIR = process.env.AI_TRYON_MODEL_DIR ?? '';
const AI_TIMEOUT_DEFAULT = 60000;
const AI_TIMEOUT_MS = parsePositiveInt(process.env.AI_TIMEOUT_MS, AI_TIMEOUT_DEFAULT);

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  // 비정상 입력(빈 문자열, 'abc', NaN, 음수) 은 모두 기본값으로 흡수.
  // 그래야 setTimeout 에 NaN 이 흘러가서 즉시 abort 되는 사고를 막을 수 있다.
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function buildDesignGenerator(): AiDesignGenerator {
  if (!AI_DESIGN_URL) return new NullAiDesignGenerator();
  return new ComfyUiDesignGenerator(AI_DESIGN_URL, AI_WORKFLOW_DIR, AI_TIMEOUT_MS);
}

function buildVirtualTryOn(): AiVirtualTryOn {
  if (!AI_TRYON_URL) return new NullAiVirtualTryOn();
  return new CatVtonVirtualTryOn(AI_TRYON_URL, AI_TRYON_MODEL_DIR, AI_TIMEOUT_MS);
}

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요' },
  standardHeaders: true,
  legacyHeaders: false,
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경변수 ${name}이(가) 설정되지 않았습니다.`);
  return value;
}

function envOrDevDefault(name: string, devDefault: string): string {
  const value = process.env[name];
  if (value) return value;
  if (IS_PRODUCTION) throw new Error(`환경변수 ${name}이(가) 설정되지 않았습니다.`);
  return devDefault;
}

export function createApp(
  allowedDomains: AllowedDomain[] = defaultAllowedDomains,
  googleClientId?: string,
  googleClientSecret?: string,
  redirectUri: string = process.env.OAUTH_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback',
) {
  const app = express();
  // CloudFront / ALB 같은 프록시가 X-Forwarded-For 를 보내므로 한 단계 신뢰.
  // 안 하면 express-rate-limit 가 ERR_ERL_UNEXPECTED_X_FORWARDED_FOR 던지며 거절.
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: FRONTEND_URL, credentials: true }));
  // 옷 사진 dataURL 등을 body 로 받기 위해 한도 상향 (이미지 ~10MB 가정)
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());

  const emailValidator = new EmailValidatorImpl(allowedDomains);

  const oauthClient = USE_MOCK_OAUTH
    ? new MockOAuthClient(redirectUri, MOCK_LOGIN_EMAIL)
    : new GoogleOAuthClientImpl(
        googleClientId ?? requireEnv('GOOGLE_CLIENT_ID'),
        googleClientSecret ?? requireEnv('GOOGLE_CLIENT_SECRET'),
        redirectUri,
      );

  // dev 모드에서는 토큰 시크릿이 없으면 무작위 32바이트 hex로 생성
  if (!IS_PRODUCTION) {
    process.env.ACCESS_TOKEN_SECRET = envOrDevDefault('ACCESS_TOKEN_SECRET', randomDevSecret());
    process.env.REFRESH_TOKEN_SECRET = envOrDevDefault('REFRESH_TOKEN_SECRET', randomDevSecret());
  }
  const tokenService = new TokenServiceImpl();

  const userRepository = USE_INMEMORY ? new InMemoryUserRepository() : new PgUserRepository(pool);
  const oauthStateRepository = USE_INMEMORY ? new InMemoryOAuthStateRepository() : new PgOAuthStateRepository(pool);
  const refreshTokenRepository = USE_INMEMORY ? new InMemoryRefreshTokenRepository() : new PgRefreshTokenRepository(pool);

  const authService = new AuthServiceImpl({
    emailValidator, oauthClient, tokenService,
    userRepository, oauthStateRepository, refreshTokenRepository,
  });

  app.use('/api/auth/login', authRateLimit);
  app.use('/api/auth/refresh', authRateLimit);
  app.use('/api/auth', createAuthRouter(authService, tokenService));

  const authRequired = createAuthRequired(tokenService);

  // AI 라우터 (사장님 영역) — 인증 필요. AI 서버 미연결 시 라우트 자체는 떠 있고 503 응답
  const designGenerator = buildDesignGenerator();
  const virtualTryOn = buildVirtualTryOn();
  app.use('/api/ai', authRequired, createAiRouter(designGenerator, virtualTryOn, AI_TIMEOUT_MS));

  // 펀드 개설 (placeholder — 담당 B(B-5) 가 fund Repository 연결 후 활성화)
  app.post('/api/funds', authRequired, createFundsCreateHandler());

  // 상품 URL → 대표 이미지 추출 placeholder
  app.post('/api/garments/fetch-from-url', authRequired, createGarmentsFetchUrlHandler());

  // 정적 자산은 CloudFront(+ S3) 가 책임진다.
  // EC2 는 API 전용. 루트 경로엔 health check 만 응답해서 ALB·CloudFront origin health check 에 대비.
  app.get('/', (_req, res) => {
    res.json({ service: 'doothing-api', ok: true });
  });

  app.use(errorHandler);
  return app;
}

function randomDevSecret(): string {
  // dev 전용. 운영에서는 위 IS_PRODUCTION 가드로 진입 불가.
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
}
