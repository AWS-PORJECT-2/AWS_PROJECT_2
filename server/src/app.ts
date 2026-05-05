import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { AllowedDomain } from './types/allowed-domain.js';
import { EmailValidatorImpl } from './services/email-validator.js';
import { GoogleOAuthClientImpl } from './services/google-oauth-client.js';
import { TokenServiceImpl } from './services/token-service.js';
import { AuthServiceImpl } from './services/auth-service.js';
import { createAuthRouter } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';

const defaultAllowedDomains: AllowedDomain[] = [
  { id: '550e8400-e29b-41d4-a716-446655440001', domain: 'kookmin.ac.kr', schoolName: '국민대학교', isActive: true },
];

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

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

export function createApp(
  allowedDomains: AllowedDomain[] = defaultAllowedDomains,
  googleClientId: string = requireEnv('GOOGLE_CLIENT_ID'),
  googleClientSecret: string = requireEnv('GOOGLE_CLIENT_SECRET'),
  redirectUri: string = process.env.OAUTH_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback',
) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: FRONTEND_URL, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  const emailValidator = new EmailValidatorImpl(allowedDomains);
  const oauthClient = new GoogleOAuthClientImpl(googleClientId, googleClientSecret, redirectUri);
  const tokenService = new TokenServiceImpl();
  const authService = new AuthServiceImpl(emailValidator, oauthClient, tokenService);
  app.use('/api/auth/login', authRateLimit);
  app.use('/api/auth/refresh', authRateLimit);
  app.use('/api/auth', createAuthRouter(authService, tokenService));
  app.use(errorHandler);
  return app;
}
