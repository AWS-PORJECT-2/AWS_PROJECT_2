import type { OAuthTokenResponse, UserInfo } from '../types';
export interface GoogleOAuthClient {
  buildAuthorizationUrl(state: string): string;
  exchangeCodeForToken(code: string): Promise<OAuthTokenResponse>;
  getUserInfo(accessToken: string): Promise<UserInfo>;
  extractUserInfoFromIdToken(idToken: string): UserInfo | null;
}
