import type { GoogleOAuthClient } from '../interfaces/google-oauth-client';
import type { OAuthTokenResponse, UserInfo } from '../types';
import { AppError } from '../errors/app-error';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export class GoogleOAuthClientImpl implements GoogleOAuthClient {
  constructor(private readonly clientId: string, private readonly clientSecret: string, private readonly redirectUri: string) {}

  buildAuthorizationUrl(state: string): string {
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    let response: Response;
    try {
      response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: this.clientId, client_secret: this.clientSecret, redirect_uri: this.redirectUri, grant_type: 'authorization_code' }).toString(),
      });
    } catch { throw new AppError('GOOGLE_UNAVAILABLE'); }
    if (!response.ok) throw new AppError('AUTH_FAILED');
    return (await response.json()) as OAuthTokenResponse;
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    let response: Response;
    try { response = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } }); }
    catch { throw new AppError('GOOGLE_UNAVAILABLE'); }
    if (!response.ok) throw new AppError('AUTH_FAILED');
    return (await response.json()) as UserInfo;
  }
}
