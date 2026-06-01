import type { Response } from 'express';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * 인증 성공 후 access/refresh 토큰을 httpOnly 쿠키로 심는다.
 * 웹 콜백(callback.ts)과 앱 교환(mobile-exchange.ts)이 동일한 쿠키 정책을 쓰도록 공유.
 */
export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; rememberMe: boolean },
): void {
  const refreshMaxAge = tokens.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/', maxAge: 15 * 60 * 1000,
  });
  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/api/auth', maxAge: refreshMaxAge,
  });
}
