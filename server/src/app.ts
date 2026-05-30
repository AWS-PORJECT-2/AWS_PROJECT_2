import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
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
import { createAdminFundsListHandler, createAdminFundApproveHandler, createAdminFundRejectHandler, createAdminDeleteRequestsHandler, createAdminFundDeleteHandler, createAdminSetRewardsHandler, createAdminFundUpdateHandler } from './routes/admin-funds.js';
import { createFundDeleteRequestHandler } from './routes/me-funds.js';
import { createAdminUsersListHandler, createAdminSetUserRoleHandler } from './routes/admin-users.js';
import { createAdminMeHandler, createAdminStatsHandler, createAdminLogsHandler } from './routes/admin-insights.js';
import { PgRewardOrderRepository } from './repositories/pg-reward-order-repository.js';
import { createMeFundsHandler } from './routes/me-funds.js';
import {
  createUpdateMeHandler, createDeleteMeHandler,
  createUpdateNotificationsHandler, createConsentHandler,
} from './routes/me-profile-routes.js';
import {
  createUserSearchHandler, createPublicProfileHandler, createUserFundsHandler,
  createFollowHandler as createUserFollowHandler, createUnfollowHandler as createUserUnfollowHandler,
  createFollowersHandler, createFollowingHandler,
} from './routes/users-routes.js';
import {
  createCommentsListHandler, createCommentCreateHandler, createCommentDeleteHandler,
} from './routes/comments-routes.js';
import {
  createGroupBuysListHandler as createGroupBuysListV2Handler,
  createGroupBuyDetailHandler,
} from './routes/groupbuys-routes.js';
import { PgCommentRepository } from './repositories/pg-comment-repository.js';
import {
  createBackingHandler, createMyBackingsHandler, createReportDepositorHandler,
  createAdminDepositsListHandler, createAdminConfirmDepositHandler,
} from './routes/reward-orders.js';
import { createAuthRequired, createOptionalAuth } from './middleware/auth-required.js';
import { PgFollowRepository } from './repositories/pg-follow-repository.js';
import { createFollowStatusHandler } from './routes/follows.js';
import { errorHandler } from './middleware/error-handler.js';
import { createDevAuthRouter } from './routes/dev-auth.js';
import { GeminiImageService } from './services/ai/gemini-image-service.js';
import { GeminiTextService } from './services/ai/gemini-text-service.js';
import { createAiStoryDraftHandler } from './routes/ai-story-draft.js';
import {
  createMeDraftsListHandler, createMeDraftCreateHandler, createMeDraftGetHandler,
  createMeDraftUpdateHandler, createMeDraftDeleteHandler,
} from './routes/me-drafts.js';
import { PgProjectDraftRepository } from './repositories/pg-project-draft-repository.js';
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
import { createOrderShippingHandler, createOrderStatusCountsHandler } from './routes/orders-shipping.js';
import { createOrderTrackingHandler, createOrderTrackingUpdateHandler } from './routes/orders-tracking.js';
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

// Announcement, Chat, Admin imports
import { PgAnnouncementRepository } from './repositories/pg-announcement-repository.js';
import { PgChatRepository } from './repositories/pg-chat-repository.js';
import { createAnnouncementsRouter } from './routes/announcements.js';
import { createChatRouter } from './routes/chat.js';
import { createRequireAdmin } from './middleware/require-admin.js';
import { createEmailService } from './services/email-notification.js';
export type { EmailNotificationService } from './services/email-notification.js';

const defaultAllowedDomains: AllowedDomain[] = [
  { id: '550e8400-e29b-41d4-a716-446655440001', domain: 'kookmin.ac.kr', schoolName: '국민대학교', isActive: true },
];

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const USE_MOCK_OAUTH = process.env.USE_MOCK_OAUTH === 'true' && !IS_PRODUCTION;
const MOCK_LOGIN_EMAIL = process.env.MOCK_LOGIN_EMAIL ?? 'test@kookmin.ac.kr';

// AI (Gemini nano-banana) — GEMINI_API_KEY 미설정 시 라우터 미등록 → 404 응답
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

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요' },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI(과금) 보호 — 1분당 8회. Gemini 일일한도·dedup 위에 HTTP 레벨 방어 추가.
const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  message: { error: 'RATE_LIMITED', message: 'AI 생성 요청이 너무 잦습니다. 잠시 후 다시 시도해주세요' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 쓰기(펀드 개설·후원 등) 남용 방지 — 15분당 40회.
const writeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
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
  app.use(helmet({ contentSecurityPolicy: false, crossOriginOpenerPolicy: false, crossOriginEmbedderPolicy: false, originAgentCluster: false }));
  app.use(compression());
  app.use(cors({ origin: FRONTEND_URL, credentials: true }));

  // 웹훅은 raw body가 필요하므로 전역 JSON 파서보다 먼저 등록 (아래에서 등록)
  // 웹훅 외 라우트용 JSON 파서 — webhook 경로는 제외
  app.use((req, res, next) => {
    if (req.path === '/api/payments/webhook') return next();
    // 대표 영상(video data URL) + 만들기 폼 임시저장(data JSONB) 이 커서 50mb 로 상향.
    express.json({ limit: '50mb' })(req, res, next);
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

  const authRequired = createAuthRequired(tokenService, userRepository);
  // soft-auth: 토큰 있으면 req.userId 채우고, 없거나 무효여도 통과(공개 GET 의 viewer 플래그용).
  const optionalAuth = createOptionalAuth(tokenService);

  // ─── 개발 전용 인증 (운영 환경에서는 절대 노출 안 됨) ───
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api/dev-auth', createDevAuthRouter(userRepository, tokenService));
    logger.info('⚠️  개발 전용 /api/dev-auth 라우트 활성화 (운영 환경에서는 비활성)');
  }

  // AI 라우터 (Gemini nano-banana) — GEMINI_API_KEY 가 있어야만 라우트 등록.
  // 키가 없으면 /api/ai/* 는 그냥 404. 실수로 빈 키 환경에서 호출되는 사고 차단.
  const gemini = GeminiImageService.fromEnv();
  if (gemini) {
    app.use('/api/ai', authRequired, aiRateLimit, createAiRouter(gemini, AI_TIMEOUT_MS));
  }

  // AI 스토리 초안 — 텍스트 모델. 키 미설정 시에도 라우트는 등록하고 핸들러에서 503 응답
  //  (이미지 라우터의 404 미등록과 달리, 프론트가 503 미연결 안내를 받게).
  const geminiText = GeminiTextService.fromEnv();
  app.post('/api/ai/story-draft', authRequired, aiRateLimit, createAiStoryDraftHandler(geminiText, AI_TIMEOUT_MS));

  // --- 공동구매(=펀드) 저장소 ---
  const groupBuyRepository = new PgGroupBuyRepository(pool);

  // 펀드 개설 → groupbuys INSERT → 피드(GET /api/groupbuys) 노출
  app.post('/api/funds', authRequired, writeRateLimit, createFundsCreateHandler(groupBuyRepository));

  // 상품 URL → 대표 이미지 추출 placeholder
  app.post('/api/garments/fetch-from-url', authRequired, createGarmentsFetchUrlHandler());

  // --- Payment System ---
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

  // 공용: 공동구매 목록 + 단일 상세 (공개; 상세는 soft-auth 로 maker.isFollowing 채움)
  app.get('/api/groupbuys', createGroupBuysListV2Handler(groupBuyRepository));
  app.get('/api/groupbuys/:id', optionalAuth, createGroupBuyDetailHandler(groupBuyRepository));
  app.post('/api/payments/:orderId/refund', authRequired, createPaymentRefundHandler(paymentService));
  app.get('/api/me/orders', authRequired, createMeOrdersHandler(paymentService));
  app.get('/api/admin/payments/:id/events', authRequired, createPaymentEventsHandler(paymentService));

  // --- Order Preparation & Confirmation (Toss Payments v2 security) ---
  app.post('/api/orders/prepare', authRequired, createOrderPrepareHandler(orderRepository));
  app.post('/api/payments/confirm', authRequired, createOrderConfirmHandler(orderRepository, pgClient));

  // --- 배송 상태 관리 ---
  app.patch('/api/orders/:id/shipping', authRequired, createOrderShippingHandler(orderRepository));
  app.get('/api/orders/status-counts', authRequired, createOrderStatusCountsHandler(orderRepository));

  // --- 택배 추적 ---
  app.get('/api/orders/:id/tracking', authRequired, createOrderTrackingHandler(orderRepository));
  // 운송장 등록 — 현재 admin 역할 미구현으로 주문 소유자만 허용. 추후 admin 미들웨어 추가 시 교체.
  app.patch('/api/orders/:id/tracking', authRequired, createOrderTrackingUpdateHandler(orderRepository));

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

  // --- Announcements & Chat ---
  const announcementRepository = new PgAnnouncementRepository(pool);
  const chatRepository = new PgChatRepository(pool);
  const requireAdmin = createRequireAdmin(userRepository);

  app.use('/api/announcements', createAnnouncementsRouter(announcementRepository, authRequired, requireAdmin));
  app.use('/api/chat', createChatRouter(chatRepository, authRequired, requireAdmin));

  // --- 관리자 펀드 심사 (승인/반려) ---
  app.get('/api/admin/funds', authRequired, requireAdmin, createAdminFundsListHandler(groupBuyRepository));
  // 관리자 대리개설 대행 작성/수정 — 제공된 필드만 갱신(creatorId 불변).
  app.patch('/api/admin/funds/:id', authRequired, requireAdmin, createAdminFundUpdateHandler(groupBuyRepository));
  app.post('/api/admin/funds/:id/approve', authRequired, requireAdmin, createAdminFundApproveHandler(groupBuyRepository));
  app.post('/api/admin/funds/:id/reject', authRequired, requireAdmin, createAdminFundRejectHandler(groupBuyRepository));
  app.post('/api/admin/funds/:id/rewards', authRequired, requireAdmin, createAdminSetRewardsHandler(groupBuyRepository));

  // --- 리워드 후원(무통장입금) + 관리자 입금확인 ---
  const rewardOrderRepository = new PgRewardOrderRepository(pool);
  app.post('/api/funds/:id/back', authRequired, writeRateLimit, createBackingHandler(groupBuyRepository, rewardOrderRepository, addressRepository));
  // --- 내 프로필/계정 (소셜 계약) ---
  app.patch('/api/me', authRequired, createUpdateMeHandler(userRepository));
  app.patch('/api/me/notifications', authRequired, createUpdateNotificationsHandler(userRepository));
  app.post('/api/me/consent', authRequired, createConsentHandler(userRepository));
  app.delete('/api/me', authRequired, createDeleteMeHandler(userRepository, refreshTokenRepository));
  app.get('/api/me/funds', authRequired, createMeFundsHandler(groupBuyRepository));
  app.get('/api/me/backings', authRequired, createMyBackingsHandler(rewardOrderRepository));

  // --- 만들기 폼 임시저장(project_drafts) — 본인 것만 CRUD ---
  const projectDraftRepository = new PgProjectDraftRepository(pool);
  app.get('/api/me/drafts', authRequired, createMeDraftsListHandler(projectDraftRepository));
  app.post('/api/me/drafts', authRequired, writeRateLimit, createMeDraftCreateHandler(projectDraftRepository));
  app.get('/api/me/drafts/:id', authRequired, createMeDraftGetHandler(projectDraftRepository));
  app.put('/api/me/drafts/:id', authRequired, writeRateLimit, createMeDraftUpdateHandler(projectDraftRepository));
  app.delete('/api/me/drafts/:id', authRequired, createMeDraftDeleteHandler(projectDraftRepository));
  app.post('/api/me/backings/:orderId/report', authRequired, createReportDepositorHandler(rewardOrderRepository));
  app.get('/api/admin/deposits', authRequired, requireAdmin, createAdminDepositsListHandler(rewardOrderRepository));
  app.post('/api/admin/deposits/:id/confirm', authRequired, requireAdmin, createAdminConfirmDepositHandler(rewardOrderRepository));

  // --- 펀드 삭제 요청(작성자) → 관리자 삭제+환불 (항목 11) ---
  app.post('/api/me/funds/:id/delete-request', authRequired, createFundDeleteRequestHandler(groupBuyRepository));
  app.get('/api/admin/fund-delete-requests', authRequired, requireAdmin, createAdminDeleteRequestsHandler(groupBuyRepository));
  app.post('/api/admin/funds/:id/delete', authRequired, requireAdmin, createAdminFundDeleteHandler(groupBuyRepository, rewardOrderRepository));

  // --- 사용자 관리 (항목 10) ---
  app.get('/api/admin/users', authRequired, requireAdmin, createAdminUsersListHandler(userRepository));
  app.post('/api/admin/users/:id/role', authRequired, requireAdmin, createAdminSetUserRoleHandler(userRepository));

  // --- 관리자 통계 + 로그/오류 (콘솔 진입 가드 포함) ---
  app.get('/api/admin/me', authRequired, requireAdmin, createAdminMeHandler(userRepository));
  app.get('/api/admin/stats', authRequired, requireAdmin, createAdminStatsHandler(pool));
  app.get('/api/admin/logs', authRequired, requireAdmin, createAdminLogsHandler(pool));

  // --- 유저/메이커 공개 + 팔로우 + 댓글 (소셜 계약) ---
  const followRepository = new PgFollowRepository(pool);
  const commentRepository = new PgCommentRepository(pool);

  // 댓글
  app.get('/api/comments', optionalAuth, createCommentsListHandler(commentRepository));
  app.post('/api/comments', authRequired, writeRateLimit, createCommentCreateHandler(commentRepository));
  app.delete('/api/comments/:id', authRequired, createCommentDeleteHandler(commentRepository));

  // 유저 검색 — '/search' 는 '/:idOrSlug' 보다 먼저 등록(라우트 섀도잉 방지).
  app.get('/api/users/search', createUserSearchHandler(userRepository));

  // 팔로우 (구 상태조회 GET /api/users/:id/follow 호환 유지) + POST/DELETE
  app.get('/api/users/:id/follow', optionalAuth, createFollowStatusHandler(followRepository));
  app.post('/api/users/:id/follow', authRequired, createUserFollowHandler(followRepository));
  app.delete('/api/users/:id/follow', authRequired, createUserUnfollowHandler(followRepository));
  app.get('/api/users/:id/followers', optionalAuth, createFollowersHandler(followRepository));
  app.get('/api/users/:id/following', optionalAuth, createFollowingHandler(followRepository));

  // 메이커 공구 목록 — '/:idOrSlug/funds' 는 '/:idOrSlug' 보다 먼저.
  app.get('/api/users/:idOrSlug/funds', createUserFundsHandler(userRepository, groupBuyRepository));

  // 공개 프로필(가장 일반적인 패턴이므로 위 구체 경로들 뒤에 등록) — soft-auth.
  app.get('/api/users/:idOrSlug', optionalAuth, createPublicProfileHandler(userRepository));

  // --- Email Notification Service (export for socket/scheduler use) ---
  const emailService = createEmailService();
  (app as any).emailService = emailService;
  (app as any).chatRepository = chatRepository;

  // Start scheduler (only in non-test environments)
  if (process.env.NODE_ENV !== 'test') {
    const lockProvider = new PgDistributedLockProvider(pool);
    const scheduler = new PaymentScheduler(paymentService, groupBuyRepository, orderRepository, lockProvider);
    scheduler.start();
    logger.info('결제 스케줄러가 시작되었습니다');
  }

  // 프론트엔드 정적 서빙:
  //  - FRONTEND_DIR 지정 시 그 경로 서빙 (EC2 단일 포트 운영)
  //  - 아니면 개발 환경에서 ../../frontend 직접 서빙
  //  - 운영에서 FRONTEND_DIR 미지정이면 API 전용 (CloudFront+S3 가 정적 담당)
  const frontendDir = process.env.FRONTEND_DIR;
  if (frontendDir) {
    app.use(express.static(frontendDir, { extensions: ['html'] }));
  } else if (!IS_PRODUCTION) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const frontendPath = resolve(__dirname, '../../frontend');
    app.use(express.static(frontendPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(join(frontendPath, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({ service: 'doothing-api', ok: true });
    });
  }

  app.use(errorHandler);
  return app;
}

function randomDevSecret(): string {
  // dev 전용. 운영에서는 위 IS_PRODUCTION 가드로 진입 불가.
  // 그래도 Math.random 은 약한 엔트로피 — staging 등에 누출되면 위험하므로 crypto 사용.
  return randomBytes(32).toString('hex');
}
