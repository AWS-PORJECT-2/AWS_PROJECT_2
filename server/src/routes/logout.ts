import type { Request, Response } from 'express';
import type { AuthService } from '../interfaces/auth-service.js';
import type { TokenService } from '../interfaces/token-service.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function createLogoutHandler(authService: AuthService, tokenService: TokenService) {
  return async (req: Request, res: Response): Promise<void> => {
    // 서버측 refresh 토큰 전체 폐기. access 토큰이 만료(verify=null)됐어도 refresh 쿠키로 사용자 식별을 폴백 →
    // 만료 후 로그아웃해도 세션이 확실히 정리됨(이전엔 만료 시 폐기를 건너뛰어 refresh 토큰이 서버에 남았음).
    const accessToken = req.cookies?.accessToken as string | undefined;
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    let userId = accessToken ? tokenService.verifyAccessToken(accessToken)?.userId : undefined;
    if (!userId && refreshToken) userId = tokenService.verifyRefreshToken(refreshToken)?.userId;
    if (userId) await authService.logout(userId);
    res.clearCookie('accessToken', { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/' });
    res.clearCookie('refreshToken', { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/api/auth' });
    res.json({ success: true });
  };
}
