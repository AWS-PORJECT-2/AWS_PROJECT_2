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
    return (await response.json()) as OAuthTokenResponse;
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    let response: Response;
    try { response = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } }); }
    catch { throw new AppError('GOOGLE_UNAVAILABLE'); }
    if (!response.ok) throw this.classifyHttpError(response.status);
    const data = await response.json() as Record<string, unknown>;
    return {
      email: data.email as string,
      name: data.name as string,
      picture: data.picture as string | undefined,
      hd: data.hd as string | undefined,
      email_verified: data.email_verified as boolean | undefined,
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
