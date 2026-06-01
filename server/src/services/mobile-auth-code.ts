import { randomUUID } from 'crypto';

/**
 * 앱(WebView) 로그인 브릿지용 일회용 코드 저장소.
 *
 * 앱은 구글 OAuth 를 시스템 브라우저(Custom Tab)에서 처리하므로, 발급된 세션 쿠키는
 * 브라우저 쪽 쿠키 저장소에 들어가 앱 WebView 와 공유되지 않는다. 그래서 콜백에서
 * 토큰을 일회용 코드 뒤에 보관해 두고, 앱이 딥링크로 복귀한 뒤 WebView 가
 * /api/auth/mobile-exchange?code=... 를 직접 호출하면 그때 WebView 쿠키로 심는다.
 *
 * - 단일 PM2 프로세스 운영이라 인메모리로 충분(코드 TTL 60초, 1회 소비 후 즉시 폐기).
 * - 코드는 추측 불가능한 randomUUID, 1회용, 짧은 수명 → 토큰을 URL/딥링크에 직접 싣지 않는다.
 */

interface CodeEntry {
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
  expiresAt: number;
}

const TTL_MS = 60 * 1000;
const store = new Map<string, CodeEntry>();

function sweep(): void {
  const now = Date.now();
  for (const [code, entry] of store) {
    if (now > entry.expiresAt) store.delete(code);
  }
}

export function issueMobileAuthCode(tokens: {
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
}): string {
  sweep();
  const code = randomUUID();
  store.set(code, { ...tokens, expiresAt: Date.now() + TTL_MS });
  return code;
}

export function consumeMobileAuthCode(code: string): {
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
} | null {
  const entry = store.get(code);
  if (!entry) return null;
  store.delete(code); // 1회용: 조회 즉시 폐기
  if (Date.now() > entry.expiresAt) return null;
  return { accessToken: entry.accessToken, refreshToken: entry.refreshToken, rememberMe: entry.rememberMe };
}
