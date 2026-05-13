import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';

import { pool } from './db.js';
import { logger } from './logger.js';
import { errorHandler } from './middleware/error-handler.js';

import { MySQLUserRepositoryImpl } from './repositories/mysql-user-repository.js';
import { MySQLShippingAddressRepository } from './repositories/shipping-address-repository.js';
import { MySQLOrderRepository } from './repositories/order-repository.js';
import { MySQLPaymentProofRepository } from './repositories/payment-proof-repository.js';
import { MySQLPaymentConfirmationRepository } from './repositories/payment-confirmation-repository.js';

import { ShippingAddressService } from './services/shipping-address-service.js';
import { PaymentOrderServiceImpl } from './services/payment-order-service.js';

import { createDevAuthRouter, createDevAuthRequired, requireAdmin } from './routes/dev-auth.js';
import { createShippingAddressesRouter } from './routes/shipping-addresses.js';
import { createPaymentOrdersRouter, createAdminPaymentOrdersRouter } from './routes/payment-orders.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

export async function createApp() {
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

  // --- Services ---
  const addressService = new ShippingAddressService(pool, addressRepo);
  const paymentOrderService = new PaymentOrderServiceImpl(pool, orderRepo, proofRepo, confirmRepo);

  // --- Auth (개발용 간이 인증) ---
  app.use('/api/dev-auth', createDevAuthRouter(userRepo));
  const authRequired = createDevAuthRequired(userRepo);

  // --- Shipping addresses (인증 필요) ---
  app.use('/api/shipping-addresses', authRequired, createShippingAddressesRouter(addressService));

  // --- Payment orders ---
  app.use('/api/payment-orders', authRequired, createPaymentOrdersRouter(paymentOrderService));
  app.use('/api/admin/payment-orders', authRequired, requireAdmin, createAdminPaymentOrdersRouter(paymentOrderService));

  // --- 프론트엔드 정적 서빙 ---
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDir = path.resolve(__dirname, '../../frontend');

  app.get('/', (_req, res) => {
    res.sendFile(path.join(frontendDir, 'login-dev.html'));
  });

  app.use(express.static(frontendDir, { index: false, extensions: ['html'] }));

  app.use(errorHandler);
  return app;
}
