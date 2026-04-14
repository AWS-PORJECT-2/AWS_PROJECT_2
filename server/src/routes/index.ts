import { Router } from 'express';
import type { AuthService } from '../interfaces/auth-service';
import type { TokenService } from '../interfaces/token-service';
import { createLoginHandler } from './login';
import { createCallbackHandler } from './callback';
import { createRefreshHandler } from './refresh';
import { createMeHandler } from './me';

export function createAuthRouter(authService: AuthService, tokenService: TokenService): Router {
  const router = Router();
  router.post('/login', createLoginHandler(authService));
  router.get('/callback', createCallbackHandler(authService));
  router.post('/refresh', createRefreshHandler(authService));
  router.get('/me', createMeHandler(tokenService));
  return router;
}
