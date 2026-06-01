import type { Request, Response } from 'express';
import { logger } from '../logger.js';
import { setAuthCookies } from '../utils/auth-cookies.js';
import { consumeMobileAuthCode } from '../services/mobile-auth-code.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

/**
 * 앱 WebView 가 딥링크 복귀 후 직접 호출하는 교환 엔드포인트.
 * 일회용 코드를 세션 쿠키로 바꿔 WebView 쿠키 저장소에 심고 홈으로 보낸다.
 */
export function createMobileExchangeHandler() {
  return (req: Request, res: Response): void => {
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    if (!code) { res.redirect(`${FRONTEND_URL}/login.html?error=missing_params`); return; }
    const tokens = consumeMobileAuthCode(code);
    if (!tokens) {
      logger.warn({ ip: req.ip }, '앱 로그인 코드 교환 실패(만료/무효)');
      res.redirect(`${FRONTEND_URL}/login.html?error=INVALID_STATE`);
      return;
    }
    setAuthCookies(res, tokens);
    res.redirect(`${FRONTEND_URL}/main.html?login=success`);
  };
}
