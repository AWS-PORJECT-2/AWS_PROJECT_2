import { Router } from 'express';
import type { AuthService } from '../interfaces/auth-service';
import { createLoginHandler } from './login';
import { createCallbackHandler } from './callback';
import { createRefreshHandler } from './refresh';

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();
  router.post('/login', createLoginHandler(authService));
  router.get('/callback', createCallbackHandler(authService));
  router.post('/refresh', createRefreshHandler(authService));
  return router;
}
