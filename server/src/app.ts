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
import { createFundsCreateHandler } from './routes/funds-create.js';
import { createAdminFundsListHandler, createAdminFundApproveHandler, createAdminFundRejectHandler, createAdminDeleteRequestsHandler, createAdminFundDeleteHandler, createAdminSetRewardsHandler, createAdminFundUpdateHandler } from './routes/admin-funds.js';
import { createFundDeleteRequestHandler } from './routes/me-funds.js';
import { createAdminUsersListHandler, createAdminSetUserRoleHandler } from './routes/admin-users.js';
import { createAdminMeHandler, createAdminStatsHandler, createAdminLogsHandler, createAdminPendingCountsHandler } from './routes/admin-insights.js';
import { PgReportRepository } from './repositories/pg-report-repository.js';
import { createReportCreateHandler, createAdminReportsListHandler, createAdminReportResolveHandler } from './routes/reports-routes.js';
import { PgRewardOrderRepository } from './repositories/pg-reward-order-repository.js';
import { createMeFundsHandler, createMeFundUpdateHandler, createFollowingFeedHandler, createMeFundAnalyticsHandler } from './routes/me-funds.js';
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
import {
  createScheduledListHandler, createBoostBannersHandler,
  createSubscribeHandler, createUnsubscribeHandler,
} from './routes/groupbuys-plan-routes.js';
import {
  createLikeHandler, createUnlikeHandler, createMyLikesHandler,
} from './routes/likes-routes.js';
import { PgCommentRepository } from './repositories/pg-comment-repository.js';
import {
  createBackingHandler, createMyBackingsHandler, createReportDepositorHandler,
  createAdminDepositsListHandler, createAdminConfirmDepositHandler,
  createMyOrdersHandler, createOrderCancelRequestHandler, createOrderChangeHandler,
  createAdminOrderCancelRequestsHandler, createAdminOrderRefundHandler, createAdminOrderCancelHandler,
} from './routes/reward-orders.js';
import { createAuthRequired, createOptionalAuth } from './middleware/auth-required.js';
import { PgFollowRepository } from './repositories/pg-follow-repository.js';
import { createFollowStatusHandler } from './routes/follows.js';
import { errorHandler } from './middleware/error-handler.js';
import { uuidParamGuard } from './middleware/uuid-param.js';
import { createDevAuthRouter } from './routes/dev-auth.js';
import { GeminiImageService } from './services/ai/gemini-image-service.js';
import { GeminiTextService } from './services/ai/gemini-text-service.js';
import { createAiStoryDraftHandler } from './routes/ai-story-draft.js';
import {
  createMeDraftsListHandler, createMeDraftCreateHandler, createMeDraftGetHandler,
  createMeDraftUpdateHandler, createMeDraftDeleteHandler,
} from './routes/me-drafts.js';
import { PgProjectDraftRepository } from './repositories/pg-project-draft-repository.js';
import { PgNotificationRepository } from './repositories/pg-notification-repository.js';
import {
  createMyNotificationsHandler, createMarkNotificationReadHandler, createMarkAllNotificationsReadHandler,
} from './routes/notifications-routes.js';
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

// 로그인 시작(OAuth state 생성) — per-IP. 공유 IP(공유기·캠퍼스 NAT)에서 여러 사용자가 막히지 않게 넉넉히.
//  (OAuth 라 비밀번호 brute-force 대상이 아니고, 남용 시 oauth_state 행만 생성되며 5분 TTL 로 만료.)
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 토큰 갱신 — 프론트가 페이지 로드마다 자동 호출. 그래서 (1) 한도를 크게,
//  (2) refresh_token 쿠키가 '없는' 요청(로그아웃 상태의 자동 probe)은 카운트에서 제외 → 비로그인 PC 의
//  페이지 열람이 공유 IP 의 로그인 한도까지 소진시키던 문제를 차단. (유효 토큰 갱신만 집계.)
const refreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  skip: (req) => !req.cookies || !req.cookies.refreshToken,
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

  // 경로 파라미터 UUID 가드 — :id/:orderId 는 모두 UUID 컬럼이므로 비-UUID 입력은 SQL(22P02)까지 가기 전에 400 으로 차단.
  //  (핸들러가 자체 try/catch 로 500 을 반환하는 잔여 경로까지 일괄 커버. :idOrSlug 는 슬러그 허용이라 가드 대상 아님.)
  //  서브라우터(announcements/chat/payment-methods/addresses)는 각 팩토리에서 router.param 으로 동일 가드 적용.
  app.param('id', uuidParamGuard);
  app.param('orderId', uuidParamGuard);

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
  // 서버 기반 알림(024_notifications) — pool 만 의존하므로 먼저 구성해 auth 서비스에도 주입.
  const notificationRepository = new PgNotificationRepository(pool);

  const authService = new AuthServiceImpl({
    emailValidator, oauthClient, tokenService,
    userRepository, oauthStateRepository, refreshTokenRepository,
    notificationRepository,
  });

  app.use('/api/auth/login', loginRateLimit);
  app.use('/api/auth/refresh', refreshRateLimit);
  app.use('/api/auth', createAuthRouter(authService, tokenService, userRepository));

  const authRequired = createAuthRequired(tokenService, userRepository);
  // soft-auth: 토큰 있으면 req.userId 채우고, 없거나 무효여도 통과(공개 GET 의 viewer 플래그용).
  const optionalAuth = createOptionalAuth(tokenService);

  // ─── 개발 전용 인증 (운영 환경에서는 절대 노출 안 됨) ───
  // 이중 게이트: NODE_ENV!=='production' 이면서 ENABLE_DEV_AUTH==='true' 일 때만 마운트.
  // NODE_ENV 가 실수로 development 로 남아도 ENABLE_DEV_AUTH 미설정이면 백도어가 열리지 않는다(심층 방어).
  if (!IS_PRODUCTION && process.env.ENABLE_DEV_AUTH === 'true') {
    app.use('/api/dev-auth', createDevAuthRouter(userRepository, tokenService, emailValidator));
    logger.warn('⚠️  개발 전용 /api/dev-auth 라우트 활성화 (ENABLE_DEV_AUTH=true) — 운영에서는 절대 켜지 말 것');
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
  // 팔로우/댓글 저장소 — 펀드 개설 알림(팔로워 대상)에서도 쓰므로 먼저 구성.
  const followRepository = new PgFollowRepository(pool);
  const commentRepository = new PgCommentRepository(pool);

  // 펀드 개설 → groupbuys INSERT → 피드(GET /api/groupbuys) 노출
  //   + 알림(best-effort): 작성자 본인(fund_submitted) / 작성자 팔로워(creator_new_fund)
  app.post('/api/funds', authRequired, writeRateLimit, createFundsCreateHandler(groupBuyRepository, notificationRepository, followRepository));

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

  // 공용: 공동구매 목록 + 단일 상세 (공개; soft-auth 로 viewer 의 isLiked/maker.isFollowing 채움)
  app.get('/api/groupbuys', optionalAuth, createGroupBuysListV2Handler(groupBuyRepository));
  // 요금제 기능 — 고정 경로(/scheduled, /boost-banners)는 '/:id' 보다 먼저 등록(라우트 섀도잉 방지).
  app.get('/api/groupbuys/scheduled', createScheduledListHandler(groupBuyRepository));   // 공개예정 목록
  app.get('/api/groupbuys/boost-banners', createBoostBannersHandler(groupBuyRepository)); // Boost 배너(홈 히어로)
  // 공개예정 알림 구독/취소 — :id 하위 고정 세그먼트(/subscribe)라 :id 충돌 없음.
  app.post('/api/groupbuys/:id/subscribe', authRequired, createSubscribeHandler(groupBuyRepository));
  app.delete('/api/groupbuys/:id/subscribe', authRequired, createUnsubscribeHandler(groupBuyRepository));
  app.get('/api/groupbuys/:id', optionalAuth, createGroupBuyDetailHandler(groupBuyRepository, userRepository));

  // NOTE: 레거시 Toss 단건결제/참여(orders·participations·payment-refund/events·config/toss·garments-fetch)
  //  HTTP 라우트는 모두 제거됨(프론트 미사용, reward_orders 무통장+모의결제 플로우로 단일화).
  //  단, paymentService/orderRepository/repos 와 toss webhook 은 스케줄러·웹훅이 참조하므로 유지한다.

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
  app.use('/api/chat', createChatRouter(chatRepository, authRequired, requireAdmin, notificationRepository));

  // --- 관리자 펀드 심사 (승인/반려) ---
  app.get('/api/admin/funds', authRequired, requireAdmin, createAdminFundsListHandler(groupBuyRepository));
  // 관리자 대리개설 대행 작성/수정 — 제공된 필드만 갱신(creatorId 불변).
  app.patch('/api/admin/funds/:id', authRequired, requireAdmin, createAdminFundUpdateHandler(groupBuyRepository));
  app.post('/api/admin/funds/:id/approve', authRequired, requireAdmin, createAdminFundApproveHandler(groupBuyRepository, notificationRepository));
  app.post('/api/admin/funds/:id/reject', authRequired, requireAdmin, createAdminFundRejectHandler(groupBuyRepository, notificationRepository));
  app.post('/api/admin/funds/:id/rewards', authRequired, requireAdmin, createAdminSetRewardsHandler(groupBuyRepository));

  // --- 리워드 후원(무통장입금) + 관리자 입금확인 ---
  const rewardOrderRepository = new PgRewardOrderRepository(pool);
  app.post('/api/funds/:id/back', authRequired, writeRateLimit, createBackingHandler(groupBuyRepository, rewardOrderRepository, addressRepository, paymentMethodRepository, notificationRepository));
  // --- 찜(좋아요, 026_project_likes) — 서버 저장으로 모든 사용자에게 반영 + 기기간 유지 ---
  // /:id/like 는 고정 하위 세그먼트라 /api/funds(POST) · /api/funds/:id/back 과 충돌 없음.
  app.post('/api/funds/:id/like', authRequired, createLikeHandler(groupBuyRepository));
  app.delete('/api/funds/:id/like', authRequired, createUnlikeHandler(groupBuyRepository));
  // --- 내 프로필/계정 (소셜 계약) ---
  app.patch('/api/me', authRequired, createUpdateMeHandler(userRepository));
  app.patch('/api/me/notifications', authRequired, createUpdateNotificationsHandler(userRepository));
  app.post('/api/me/consent', authRequired, createConsentHandler(userRepository));
  app.delete('/api/me', authRequired, createDeleteMeHandler(userRepository, refreshTokenRepository, groupBuyRepository, rewardOrderRepository));
  app.get('/api/me/funds', authRequired, createMeFundsHandler(groupBuyRepository));
  // 창작자 본인 펀드 수정 — 기본정보·스토리만(화이트리스트). creatorId/가격/상태/일정 등은 변경 불가.
  app.patch('/api/me/funds/:id', authRequired, writeRateLimit, createMeFundUpdateHandler(groupBuyRepository));
  // 본인 펀드 분석(요금제 분석 기능) — 본인 소유 아니면 404.
  app.get('/api/me/funds/:id/analytics', authRequired, createMeFundAnalyticsHandler(groupBuyRepository));
  app.get('/api/me/backings', authRequired, createMyBackingsHandler(rewardOrderRepository));
  // 내 주문 목록(취소 신청 화면용) + 본인 주문 취소 신청(#4).
  app.get('/api/me/orders', authRequired, createMyOrdersHandler(rewardOrderRepository));
  // 펀딩(리워드) 변경 — 본인 pledged 주문의 티어만 교체(/cancel-request 보다 먼저든 뒤든 :id 충돌 없음, 고정 세그먼트).
  app.post('/api/me/orders/:id/change', authRequired, writeRateLimit, createOrderChangeHandler(rewardOrderRepository, groupBuyRepository));
  app.post('/api/me/orders/:id/cancel-request', authRequired, writeRateLimit, createOrderCancelRequestHandler(rewardOrderRepository, groupBuyRepository, notificationRepository));
  // 내가 찜한 펀드 id 목록 — 기기간 유지(서버 저장).
  app.get('/api/me/likes', authRequired, createMyLikesHandler(groupBuyRepository));

  // --- 서버 기반 알림(024_notifications) — 본인 알림 조회/읽음 처리 ---
  app.get('/api/me/notifications', authRequired, createMyNotificationsHandler(notificationRepository));
  app.post('/api/me/notifications/read-all', authRequired, createMarkAllNotificationsReadHandler(notificationRepository));
  app.post('/api/me/notifications/:id/read', authRequired, createMarkNotificationReadHandler(notificationRepository));

  // --- 만들기 폼 임시저장(project_drafts) — 본인 것만 CRUD ---
  const projectDraftRepository = new PgProjectDraftRepository(pool);
  app.get('/api/me/drafts', authRequired, createMeDraftsListHandler(projectDraftRepository));
  app.post('/api/me/drafts', authRequired, writeRateLimit, createMeDraftCreateHandler(projectDraftRepository));
  app.get('/api/me/drafts/:id', authRequired, createMeDraftGetHandler(projectDraftRepository));
  app.put('/api/me/drafts/:id', authRequired, writeRateLimit, createMeDraftUpdateHandler(projectDraftRepository));
  app.delete('/api/me/drafts/:id', authRequired, createMeDraftDeleteHandler(projectDraftRepository));
  app.post('/api/me/backings/:orderId/report', authRequired, createReportDepositorHandler(rewardOrderRepository));
  app.get('/api/admin/deposits', authRequired, requireAdmin, createAdminDepositsListHandler(rewardOrderRepository));
  app.post('/api/admin/deposits/:id/confirm', authRequired, requireAdmin, createAdminConfirmDepositHandler(rewardOrderRepository, groupBuyRepository, notificationRepository));
  // 펀딩(주문) 취소 신청 처리(#4) — 관리자: 목록 조회 → 환불 표시 → 최종 취소.
  app.get('/api/admin/order-cancel-requests', authRequired, requireAdmin, createAdminOrderCancelRequestsHandler(rewardOrderRepository));
  app.post('/api/admin/orders/:id/refund', authRequired, requireAdmin, createAdminOrderRefundHandler(rewardOrderRepository));
  app.post('/api/admin/orders/:id/cancel', authRequired, requireAdmin, createAdminOrderCancelHandler(rewardOrderRepository, groupBuyRepository, notificationRepository));

  // --- 펀드 삭제 요청(작성자) → 관리자 삭제+환불 (항목 11) ---
  app.post('/api/me/funds/:id/delete-request', authRequired, createFundDeleteRequestHandler(groupBuyRepository));
  app.get('/api/admin/fund-delete-requests', authRequired, requireAdmin, createAdminDeleteRequestsHandler(groupBuyRepository));
  app.post('/api/admin/funds/:id/delete', authRequired, requireAdmin, createAdminFundDeleteHandler(groupBuyRepository, rewardOrderRepository, notificationRepository));

  // --- 사용자 관리 (항목 10) ---
  app.get('/api/admin/users', authRequired, requireAdmin, createAdminUsersListHandler(userRepository));
  app.post('/api/admin/users/:id/role', authRequired, requireAdmin, createAdminSetUserRoleHandler(userRepository));

  // --- 관리자 통계 + 로그/오류 (콘솔 진입 가드 포함) ---
  app.get('/api/admin/me', authRequired, requireAdmin, createAdminMeHandler(userRepository));
  app.get('/api/admin/stats', authRequired, requireAdmin, createAdminStatsHandler(pool));
  // 사이드바 배지용 단일 대기 카운트 — 가벼운 COUNT 집계.
  app.get('/api/admin/pending-counts', authRequired, requireAdmin, createAdminPendingCountsHandler(pool));
  app.get('/api/admin/logs', authRequired, requireAdmin, createAdminLogsHandler(pool));

  // --- 신고(027_reports) — 사용자 접수 + 관리자 처리 ---
  const reportRepository = new PgReportRepository(pool);
  app.post('/api/reports', authRequired, writeRateLimit, createReportCreateHandler(reportRepository, groupBuyRepository, userRepository, notificationRepository));
  app.get('/api/admin/reports', authRequired, requireAdmin, createAdminReportsListHandler(reportRepository));
  app.post('/api/admin/reports/:id/resolve', authRequired, requireAdmin, createAdminReportResolveHandler(reportRepository));

  // --- 유저/메이커 공개 + 팔로우 + 댓글 (소셜 계약) ---
  // followRepository / commentRepository 는 위(펀드 개설 알림 의존)에서 이미 구성됨.

  // 팔로잉 피드 — 내가 팔로우한 창작자들의 공개(open) 펀드 최신순.
  app.get('/api/me/following-feed', authRequired, createFollowingFeedHandler(followRepository, groupBuyRepository));

  // 댓글
  app.get('/api/comments', optionalAuth, createCommentsListHandler(commentRepository));
  // 댓글 작성 → 알림(best-effort): 펀드 댓글은 창작자(project_comment), 대댓글은 원댓글 작성자(comment_reply).
  app.post('/api/comments', authRequired, writeRateLimit, createCommentCreateHandler(commentRepository, groupBuyRepository, notificationRepository));
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
  app.get('/api/users/:idOrSlug/funds', optionalAuth, createUserFundsHandler(userRepository, groupBuyRepository));

  // 공개 프로필(가장 일반적인 패턴이므로 위 구체 경로들 뒤에 등록) — soft-auth.
  app.get('/api/users/:idOrSlug', optionalAuth, createPublicProfileHandler(userRepository));

  (app as any).chatRepository = chatRepository;
  // Socket.io(server.ts)에서 관리자 답변 시 inquiry_reply 알림을 보내도록 노출.
  (app as any).notificationRepository = notificationRepository;

  // Start scheduler (only in non-test environments)
  if (process.env.NODE_ENV !== 'test') {
    const lockProvider = new PgDistributedLockProvider(pool);
    // 알림 의존성 주입 — 마감임박/성공·실패/공개오픈 알림(best-effort). 미주입 시 기존 결제·전환만.
    const scheduler = new PaymentScheduler(
      paymentService, groupBuyRepository, orderRepository, lockProvider, undefined,
      { notificationRepo: notificationRepository, rewardOrderRepo: rewardOrderRepository },
    );
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
      // 비-/api 경로의 SPA 폴백은 새 wz 홈(main.html) 으로. (구 index.html 은 리다이렉트 스텁)
      res.sendFile(join(frontendPath, 'main.html'));
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
