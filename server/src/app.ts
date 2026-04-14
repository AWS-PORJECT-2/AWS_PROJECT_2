import 'dotenv/config';
import express from 'express';
import type { AllowedDomain } from './types/allowed-domain';
import { EmailValidatorImpl } from './services/email-validator';
import { GoogleOAuthClientImpl } from './services/google-oauth-client';
import { TokenServiceImpl } from './services/token-service';
import { AuthServiceImpl } from './services/auth-service';
import { createAuthRouter } from './routes/index';
import { errorHandler } from './middleware/error-handler';

const sampleAllowedDomains: AllowedDomain[] = [
  { id: '550e8400-e29b-41d4-a716-446655440000', domain: 'school.ac.kr', schoolName: '샘플대학교', isActive: true },
  { id: '550e8400-e29b-41d4-a716-446655440001', domain: 'kookmin.ac.kr', schoolName: '국민대학교', isActive: true },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경변수 ${name}이(가) 설정되지 않았습니다.`);
  return value;
}

export function createApp(
  allowedDomains: AllowedDomain[] = sampleAllowedDomains,
  googleClientId: string = requireEnv('GOOGLE_CLIENT_ID'),
  googleClientSecret: string = requireEnv('GOOGLE_CLIENT_SECRET'),
  redirectUri: string = process.env.OAUTH_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback',
) {
  const app = express();
  app.use(express.json());
  const emailValidator = new EmailValidatorImpl(allowedDomains);
  const oauthClient = new GoogleOAuthClientImpl(googleClientId, googleClientSecret, redirectUri);
  const tokenService = new TokenServiceImpl();
  const authService = new AuthServiceImpl(emailValidator, oauthClient, tokenService);
  app.use('/api/auth', createAuthRouter(authService));
  app.use(errorHandler);
  return app;
}
