import type { GoogleOAuthClient } from '../interfaces/google-oauth-client.js';
import type { OAuthTokenResponse, UserInfo } from '../types/index.js';

/**
 * 로컬 개발용 가짜 OAuth 클라이언트.
 * USE_MOCK_OAUTH=true 일 때만 활성화되며, Google 호출 없이 즉시
 * 학교 도메인 사용자로 로그인된 것처럼 동작한다.
 *
 * 운영 환경에서는 절대 사용하면 안 됨. NODE_ENV !== 'production' 가드를
 * createApp 단계에서 강제한다.
 */
export class MockOAuthClient implements GoogleOAuthClient {
  constructor(private readonly redirectUri: string, private readonly mockEmail: string) {}

  buildAuthorizationUrl(state: string): string {
    const url = new URL(this.redirectUri);
    url.searchParams.set('code', 'mock-authorization-code');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCodeForToken(_code: string): Promise<OAuthTokenResponse> {
    return {
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: undefined,
    };
  }

  async getUserInfo(_accessToken: string): Promise<UserInfo> {
    return {
      email: this.mockEmail,
      name: '테스트 사용자',
      picture: 'https://picsum.photos/seed/mockuser/96/96',
      hd: this.mockEmail.split('@')[1],
      email_verified: true,
    };
  }

  async extractUserInfoFromIdToken(_idToken: string): Promise<UserInfo | null> {
    return null;
  }
}
