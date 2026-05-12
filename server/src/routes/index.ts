import { Router } from 'express';
import type { AuthService } from '../interfaces/auth-service.js';
import type { TokenService } from '../interfaces/token-service.js';
import type { UserRepository } from '../repositories/user-repository.js';
import { createLoginHandler } from './login.js';
import { createCallbackHandler } from './callback.js';
import { createRefreshHandler } from './refresh.js';
import { createMeHandler } from './me.js';
import { createLogoutHandler } from './logout.js';

export function createAuthRouter(
  authService: AuthService,
  tokenService: TokenService,
  userRepo: UserRepository,
): Router {
  const router = Router();
  router.post('/login', createLoginHandler(authService));
  router.get('/callback', createCallbackHandler(authService));
  router.post('/refresh', createRefreshHandler(authService));
  router.get('/me', createMeHandler(tokenService, userRepo));
  router.post('/logout', createLogoutHandler(authService, tokenService));
  return router;
}
