import { Router } from 'express';
import type { AuthService } from '../interfaces/auth-service.js';
import type { TokenService } from '../interfaces/token-service.js';
import { createLoginHandler } from './login.js';
import { createCallbackHandler } from './callback.js';
import { createRefreshHandler } from './refresh.js';
import { createMeHandler } from './me.js';

export function createAuthRouter(authService: AuthService, tokenService: TokenService): Router {
  const router = Router();
  router.post('/login', createLoginHandler(authService));
  router.get('/callback', createCallbackHandler(authService));
  router.post('/refresh', createRefreshHandler(authService));
  router.get('/me', createMeHandler(tokenService));
  return router;
}
