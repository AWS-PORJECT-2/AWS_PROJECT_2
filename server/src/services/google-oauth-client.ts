import { OAuth2Client } from 'google-auth-library';
import type { GoogleOAuthClient } from '../interfaces/google-oauth-client.js';
import type { OAuthTokenResponse, UserInfo } from '../types/index.js';
import { AppError } from '../errors/app-error.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export class GoogleOAuthClientImpl implements GoogleOAuthClient {
  private readonly oauth2Client: OAuth2Client;

  constructor(private readonly clientId: string, private readonly clientSecret: string, private readonly redirectUri: string) {
    this.oauth2Client = new OAuth2Client(clientId);
  }

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

  private classifyHttpError(status: number): AppError {
    if (status === 429 || status >= 500) return new AppError('GOOGLE_UNAVAILABLE');
    return new AppError('AUTH_FAILED');
  }

  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    let response: Response;
    try {
      response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: this.clientId, client_secret: this.clientSecret, redirect_uri: this.redirectUri, grant_type: 'authorization_code' }).toString(),
      });
    } catch { throw new AppError('GOOGLE_UNAVAILABLE'); }
    if (!response.ok) throw this.classifyHttpError(response.status);

    // 200 OK 라도 응답 본문이 비정상이면 그 다음 단계에서 access_token=undefined 로
    // Authorization 헤더가 깨진다. 여기서 명시적으로 검증한다.
    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data.access_token !== 'string' || !data.access_token) {
      throw new AppError('AUTH_FAILED');
    }
    return {
      access_token: data.access_token,
      token_type: typeof data.token_type === 'string' ? data.token_type : 'Bearer',
      expires_in: typeof data.expires_in === 'number' ? data.expires_in : 0,
      id_token: typeof data.id_token === 'string' ? data.id_token : undefined,
      refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
    };
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    let response: Response;
    try { response = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } }); }
    catch { throw new AppError('GOOGLE_UNAVAILABLE'); }
    if (!response.ok) throw this.classifyHttpError(response.status);
    const data = await response.json() as Record<string, unknown>;
    if (typeof data.email !== 'string' || typeof data.name !== 'string') {
      throw new AppError('AUTH_FAILED');
    }
    return {
      email: data.email,
      name: data.name,
      picture: typeof data.picture === 'string' ? data.picture : undefined,
      hd: typeof data.hd === 'string' ? data.hd : undefined,
      email_verified: typeof data.email_verified === 'boolean' ? data.email_verified : undefined,
    };
  }

  async extractUserInfoFromIdToken(idToken: string): Promise<UserInfo | null> {
    try {
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload || typeof payload.email !== 'string' || typeof payload.name !== 'string') return null;
      return {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        hd: payload.hd,
        email_verified: payload.email_verified,
      };
    } catch { return null; }
  }
}
