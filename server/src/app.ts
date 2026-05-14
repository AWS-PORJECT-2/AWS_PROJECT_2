import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';

import { pool } from './db.js';
import { errorHandler } from './middleware/error-handler.js';

import { MySQLUserRepositoryImpl } from './repositories/mysql-user-repository.js';
import { MySQLShippingAddressRepository } from './repositories/shipping-address-repository.js';
import { MySQLOrderRepository } from './repositories/order-repository.js';
import { MySQLPaymentProofRepository } from './repositories/payment-proof-repository.js';
import { MySQLPaymentConfirmationRepository } from './repositories/payment-confirmation-repository.js';
import { MySQLAnnouncementRepository } from './repositories/announcement-repository.js';
import { MySQLChatRepository } from './repositories/chat-repository.js';

import { ShippingAddressService } from './services/shipping-address-service.js';
import { PaymentOrderServiceImpl } from './services/payment-order-service.js';

import { createDevAuthRouter, createDevAuthRequired, requireAdmin } from './routes/dev-auth.js';
import { createShippingAddressesRouter } from './routes/shipping-addresses.js';
import { createPaymentOrdersRouter, createAdminPaymentOrdersRouter } from './routes/payment-orders.js';
import { createAnnouncementsRouter, createAdminAnnouncementsRouter } from './routes/announcements.js';
import { createChatRouter, createAdminChatRouter } from './routes/chat.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

export interface AppContext {
  app: express.Express;
  userRepo: MySQLUserRepositoryImpl;
  chatRepo: MySQLChatRepository;
  frontendUrl: string;
}

export async function createApp(): Promise<AppContext> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());

  // --- Repositories ---
  const userRepo = new MySQLUserRepositoryImpl(pool);
  const addressRepo = new MySQLShippingAddressRepository(pool);
  const orderRepo = new MySQLOrderRepository(pool);
  const proofRepo = new MySQLPaymentProofRepository(pool);
  const confirmRepo = new MySQLPaymentConfirmationRepository(pool);
  const announcementRepo = new MySQLAnnouncementRepository(pool);
  const chatRepo = new MySQLChatRepository(pool);

  // --- Services ---
  const addressService = new ShippingAddressService(pool, addressRepo);
  const paymentOrderService = new PaymentOrderServiceImpl(pool, orderRepo, proofRepo, confirmRepo);

  // --- Auth ---
  app.use('/api/dev-auth', createDevAuthRouter(userRepo));
  const authRequired = createDevAuthRequired(userRepo);

  // --- Announcements ---
  app.use('/api/announcements', createAnnouncementsRouter(announcementRepo));
  app.use('/api/admin/announcements', authRequired, requireAdmin, createAdminAnnouncementsRouter(announcementRepo));

  // --- Chat (REST) ---
  // /api/chat/admin 경로는 더 구체적이므로 먼저 매칭
  app.use('/api/chat/admin', authRequired, requireAdmin, createAdminChatRouter(chatRepo));
  app.use('/api/chat', authRequired, createChatRouter(chatRepo));

  // --- Shipping addresses ---
  app.use('/api/shipping-addresses', authRequired, createShippingAddressesRouter(addressService));

  // --- Payment orders ---
  app.use('/api/payment-orders', authRequired, createPaymentOrdersRouter(paymentOrderService));
  app.use('/api/admin/payment-orders', authRequired, requireAdmin, createAdminPaymentOrdersRouter(paymentOrderService));

  // --- 업로드 파일 정적 서빙 ---
  const uploadDir = process.env.UPLOAD_DIR || './uploads/payments';
  app.use('/uploads/payments', express.static(uploadDir));

  // --- 프론트엔드 정적 서빙 ---
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDir = path.resolve(__dirname, '../../frontend');

  app.get('/', (_req, res) => {
    res.sendFile(path.join(frontendDir, 'login-dev.html'));
  });

  app.use(express.static(frontendDir, { index: false, extensions: ['html'] }));

  app.use(errorHandler);
  return { app, userRepo, chatRepo, frontendUrl: FRONTEND_URL };
}
