import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
// Payment system imports
import {
  InMemoryGroupBuyRepository, PgGroupBuyRepository,
  InMemoryParticipationRepository, PgParticipationRepository,
  InMemoryOrderRepository, PgOrderRepository,
  InMemoryPaymentRepository, PgPaymentRepository,
  InMemoryPaymentEventRepository, PgPaymentEventRepository,
  InMemoryRefundRepository, PgRefundRepository,
} from './repositories/index.js';
import { InMemoryPgClient } from './services/in-memory-pg-client.js';
import { TossPaymentsClient } from './services/toss-payments-client.js';
import { PaymentServiceImpl } from './services/payment-service.js';
import { PaymentScheduler } from './services/scheduler.js';
import { InMemoryLockProvider, PgDistributedLockProvider } from './services/distributed-lock.js';
import { createPaymentWebhookHandler } from './routes/payment-webhook.js';
import { createGroupBuyParticipateHandler } from './routes/groupbuy-participate.js';
import { createGroupBuyCancelParticipationHandler } from './routes/groupbuy-cancel-participation.js';
import { createGroupBuyGetParticipationHandler } from './routes/groupbuy-get-participation.js';
import { createPaymentRefundHandler } from './routes/payment-refund.js';
import { createMeOrdersHandler } from './routes/me-orders.js';
import { createPaymentEventsHandler } from './routes/payment-events.js';
import { createOrderPrepareHandler } from './routes/orders-prepare.js';
import { createOrderConfirmHandler } from './routes/orders-confirm.js';
import { logger } from './logger.js';

// Payment method & address imports
import {
  InMemoryPaymentMethodRepository, PgPaymentMethodRepository,
  InMemoryAddressRepository, PgAddressRepository,
} from './repositories/index.js';
import { createPaymentMethodService } from './services/payment-method-service-impl.js';
import { createAddressService } from './services/address-service-impl.js';
import { createPaymentMethodsHandlers } from './routes/payment-methods-routes.js';
import { createAddressesHandlers } from './routes/addresses-routes.js';

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
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: FRONTEND_URL, credentials: true }));

  // 웹훅은 raw body가 필요하므로 전역 JSON 파서보다 먼저 등록 (아래에서 등록)
  // 웹훅 외 라우트용 JSON 파서 — webhook 경로는 제외
  app.use((req, res, next) => {
    if (req.path === '/api/payments/webhook') return next();
    express.json({ limit: '15mb' })(req, res, next);
  });
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

  // --- Payment System ---
  const groupBuyRepository = USE_INMEMORY ? new InMemoryGroupBuyRepository() : new PgGroupBuyRepository(pool);
  const participationRepository = USE_INMEMORY ? new InMemoryParticipationRepository() : new PgParticipationRepository(pool);
  const orderRepository = USE_INMEMORY ? new InMemoryOrderRepository() : new PgOrderRepository(pool);
  const paymentRepository = USE_INMEMORY ? new InMemoryPaymentRepository() : new PgPaymentRepository(pool);
  const paymentEventRepository = USE_INMEMORY ? new InMemoryPaymentEventRepository() : new PgPaymentEventRepository(pool);
  const refundRepository = USE_INMEMORY ? new InMemoryRefundRepository() : new PgRefundRepository(pool);

  const tossSecretKey = envOrDevDefault('TOSS_SECRET_KEY', 'test_sk_000000000000000000000000000');
  const tossWebhookSecret = envOrDevDefault('TOSS_WEBHOOK_SECRET', 'dev-toss-webhook-secret');

  const pgClient = USE_INMEMORY
    ? new InMemoryPgClient()
    : new TossPaymentsClient(tossSecretKey);

  const paymentService = new PaymentServiceImpl({
    pgClient,
    pool: USE_INMEMORY ? null : pool,
    groupBuyRepository,
    participationRepository,
    orderRepository,
    paymentRepository,
    paymentEventRepository,
    refundRepository,
  });

  // Payment routes (webhook - no auth, raw body for HMAC verification)
  app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), createPaymentWebhookHandler(paymentService, pgClient, tossWebhookSecret));

  // Payment routes (authenticated)
  app.post('/api/groupbuys/:id/participate', authRequired, createGroupBuyParticipateHandler(paymentService));
  app.delete('/api/groupbuys/:id/participate', authRequired, createGroupBuyCancelParticipationHandler(paymentService));
  app.get('/api/groupbuys/:id/participation', authRequired, createGroupBuyGetParticipationHandler(paymentService));
  app.post('/api/payments/:orderId/refund', authRequired, createPaymentRefundHandler(paymentService));
  app.get('/api/me/orders', authRequired, createMeOrdersHandler(paymentService));
  app.get('/api/admin/payments/:id/events', authRequired, createPaymentEventsHandler(paymentService));

  // --- Order Preparation & Confirmation (Toss Payments v2 security) ---
  app.post('/api/orders/prepare', authRequired, createOrderPrepareHandler(orderRepository));
  app.post('/api/payments/confirm', authRequired, createOrderConfirmHandler(orderRepository, pgClient));

  // --- Toss Config (클라이언트 키만 노출, 시크릿 절대 X) ---
  app.get('/api/config/toss', (_req, res) => {
    res.json({
      clientKey: envOrDevDefault('TOSS_CLIENT_KEY', 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq'),
    });
  });

  // --- Payment Methods & Addresses ---
  const paymentMethodRepository = USE_INMEMORY
    ? new InMemoryPaymentMethodRepository()
    : new PgPaymentMethodRepository(pool);
  const addressRepository = USE_INMEMORY
    ? new InMemoryAddressRepository()
    : new PgAddressRepository(pool);

  const paymentMethodService = createPaymentMethodService({ paymentMethodRepository });
  const addressService = createAddressService({ addressRepository });

  app.use('/api/payment-methods', authRequired, createPaymentMethodsHandlers(paymentMethodService));
  app.use('/api/addresses', authRequired, createAddressesHandlers(addressService));

  // Start scheduler (only in non-test environments)
  if (process.env.NODE_ENV !== 'test') {
    const lockProvider = USE_INMEMORY ? new InMemoryLockProvider() : new PgDistributedLockProvider(pool);
    const scheduler = new PaymentScheduler(paymentService, groupBuyRepository, orderRepository, lockProvider);
    scheduler.start();
    logger.info('결제 스케줄러가 시작되었습니다');
  }

  // frontend/ 정적 서빙: 백엔드와 동일 origin에서 페이지를 제공해
  // CORS·쿠키 흐름을 단순화한다.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDir = path.resolve(__dirname, '../../frontend');

  // / 진입 시 access token 쿠키 유무로 분기:
  //  - 로그인 상태 → index.html (메인 화면)
  //  - 비로그인   → landing.html (사이트 소개 + 로그인 진입)
  app.get('/', (req, res) => {
    const token = req.cookies?.accessToken;
    if (token && tokenService.verifyAccessToken(token)) {
      res.sendFile(path.join(frontendDir, 'index.html'));
    } else {
      res.sendFile(path.join(frontendDir, 'landing.html'));
    }
  });

  app.use(express.static(frontendDir, { index: false, extensions: ['html'] }));

  app.use(errorHandler);
  return app;
}

function randomDevSecret(): string {
  // dev 전용. 운영에서는 위 IS_PRODUCTION 가드로 진입 불가.
  // 그래도 Math.random 은 약한 엔트로피 — staging 등에 누출되면 위험하므로 crypto 사용.
  return randomBytes(32).toString('hex');
}
