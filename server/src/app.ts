import 'dotenv/config';
import { randomBytes } from 'node:crypto';
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
// Payment system imports
import {
  PgGroupBuyRepository,
  PgParticipationRepository,
  PgOrderRepository,
  PgPaymentRepository,
  PgPaymentEventRepository,
  PgRefundRepository,
} from './repositories/index.js';
import { TossPaymentsClient } from './services/toss-payments-client.js';
import { PaymentServiceImpl } from './services/payment-service.js';
import { PaymentScheduler } from './services/scheduler.js';
import { PgDistributedLockProvider } from './services/distributed-lock.js';
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
  PgPaymentMethodRepository,
  PgAddressRepository,
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

  const userRepository = new PgUserRepository(pool);
  const oauthStateRepository = new PgOAuthStateRepository(pool);
  const refreshTokenRepository = new PgRefreshTokenRepository(pool);

  const authService = new AuthServiceImpl({
    emailValidator, oauthClient, tokenService,
    userRepository, oauthStateRepository, refreshTokenRepository,
  });

  app.use('/api/auth/login', authRateLimit);
  app.use('/api/auth/refresh', authRateLimit);
  app.use('/api/auth', createAuthRouter(authService, tokenService, userRepository));

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
  const groupBuyRepository = new PgGroupBuyRepository(pool);
  const participationRepository = new PgParticipationRepository(pool);
  const orderRepository = new PgOrderRepository(pool);
  const paymentRepository = new PgPaymentRepository(pool);
  const paymentEventRepository = new PgPaymentEventRepository(pool);
  const refundRepository = new PgRefundRepository(pool);

  const tossSecretKey = envOrDevDefault('TOSS_SECRET_KEY', 'test_sk_000000000000000000000000000');
  const tossWebhookSecret = envOrDevDefault('TOSS_WEBHOOK_SECRET', 'dev-toss-webhook-secret');

  const pgClient = new TossPaymentsClient(tossSecretKey);

  const paymentService = new PaymentServiceImpl({
    pgClient,
    pool,
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
  const paymentMethodRepository = new PgPaymentMethodRepository(pool);
  const addressRepository = new PgAddressRepository(pool);

  const paymentMethodService = createPaymentMethodService({ paymentMethodRepository });
  const addressService = createAddressService({ addressRepository });

  app.use('/api/payment-methods', authRequired, createPaymentMethodsHandlers(paymentMethodService));
  app.use('/api/addresses', authRequired, createAddressesHandlers(addressService));

  // Start scheduler (only in non-test environments)
  if (process.env.NODE_ENV !== 'test') {
    const lockProvider = new PgDistributedLockProvider(pool);
    const scheduler = new PaymentScheduler(paymentService, groupBuyRepository, orderRepository, lockProvider);
    scheduler.start();
    logger.info('결제 스케줄러가 시작되었습니다');
  }

  // 정적 자산은 CloudFront(+ S3) 가 책임진다. EC2 는 API 전용.
  // 루트 경로엔 health check 만 — CloudFront origin health check 대비.
  app.get('/', (_req, res) => {
    res.json({ service: 'doothing-api', ok: true });
  });

  app.use(errorHandler);
  return app;
}

function randomDevSecret(): string {
  // dev 전용. 운영에서는 위 IS_PRODUCTION 가드로 진입 불가.
  // 그래도 Math.random 은 약한 엔트로피 — staging 등에 누출되면 위험하므로 crypto 사용.
  return randomBytes(32).toString('hex');
}
