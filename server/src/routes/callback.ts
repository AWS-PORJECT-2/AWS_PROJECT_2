import type { Request, Response } from 'express';
import type { AuthService } from '../interfaces/auth-service.js';
import { AppError } from '../errors/app-error.js';
import { logger } from '../logger.js';
import { setAuthCookies } from '../utils/auth-cookies.js';
import { issueMobileAuthCode } from '../services/mobile-auth-code.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

export function createCallbackHandler(authService: AuthService) {
  return async (req: Request, res: Response): Promise<void> => {
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    // 'm_' 접두사 = 앱(WebView) 로그인. 시스템 브라우저에서 도는 흐름이라 쿠키 대신 딥링크로 복귀시킨다.
    const isMobile = typeof state === 'string' && state.startsWith('m_');
    // S3 정적 호스팅은 / 동적 라우팅을 못 하므로 명시적 .html 파일로 보낸다.
    if (!code || !state) {
      res.redirect(`${FRONTEND_URL}/${isMobile ? 'auth-return.html?error=missing_params' : 'login.html?error=missing_params'}`);
      return;
    }
    // 웹: 로그인 시작 시 심은 oauth_state 쿠키와 대조 → 로그인 CSRF/세션 픽세이션 차단. 모바일은 면제.
    if (!isMobile) {
      const cookieState = typeof req.cookies?.oauth_state === 'string' ? req.cookies.oauth_state : undefined;
      res.clearCookie('oauth_state', { path: '/api/auth' });
      if (!cookieState || cookieState !== state) {
        logger.warn({ ip: req.ip }, 'oauth_state 쿠키 불일치 — 콜백 거부(CSRF 의심)');
        res.redirect(`${FRONTEND_URL}/login.html?error=login_failed`);
        return;
      }
    }
    try {
      const result = await authService.handleCallback(code, state);
      if (isMobile) {
        // 앱: 토큰을 일회용 코드 뒤에 보관하고, 브릿지 페이지 → 딥링크로 앱에 코드만 전달.
        const exchangeCode = issueMobileAuthCode({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          rememberMe: result.rememberMe,
        });
        logger.info({ email: result.user.email }, '인증 성공(앱)');
        res.redirect(`${FRONTEND_URL}/auth-return.html?code=${encodeURIComponent(exchangeCode)}`);
        return;
      }
      // 웹: 기존대로 쿠키 심고 홈으로.
      setAuthCookies(res, result);
      logger.info({ email: result.user.email }, '인증 성공');
      res.redirect(`${FRONTEND_URL}/main.html?login=success`);
    } catch (error) {
      const errorCode = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      logger.warn({ errorCode, ip: req.ip }, '인증 실패');
      // 제재 계정은 일반 실패와 구분해 명확한 사유를 보여준다.
      const accountBlock = errorCode === 'USER_SUSPENDED' || errorCode === 'USER_BANNED' || errorCode === 'ACCOUNT_WITHDRAWN';
      const errParam = accountBlock ? errorCode.toLowerCase() : 'login_failed';
      res.redirect(`${FRONTEND_URL}/${isMobile ? 'auth-return.html' : 'login.html'}?error=${errParam}`);
    }
  };
}
