import { ChevronRight, Loader2, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function App() {
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('accessToken');
    const email = params.get('email');
    const name = params.get('name');
    const errorParam = params.get('error');

    if (errorParam) {
      const messages: Record<string, string> = {
        INVALID_EMAIL_DOMAIN: '허용된 학교 이메일 계정으로만 로그인 가능합니다',
        AUTH_FAILED: 'Google 인증에 실패했습니다',
        INVALID_STATE: '로그인 세션이 만료되었습니다. 다시 시도해주세요',
        missing_params: '인증 정보가 누락되었습니다',
      };
      setError(messages[errorParam] || '로그인에 실패했습니다');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (accessToken && email && name) {
      setUser({ email, name });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleLogin = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rememberMe: false }) });
      const data = await res.json();
      if (data.authUrl) window.location.href = data.authUrl;
      else { setError(data.message || '로그인 요청에 실패했습니다'); setLoading(false); }
    } catch { setError('서버에 연결할 수 없습니다'); setLoading(false); }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-200">
      <div className="relative bg-white overflow-hidden" style={{ width: 375, height: 812, flexShrink: 0 }}>
        <div className="absolute top-0 left-0 right-0" style={{ height: 320, background: 'linear-gradient(160deg, rgba(218,178,255,0.3) 0%, rgba(116,212,255,0.3) 50%, rgba(94,233,181,0.3) 100%)' }} />
        <div className="absolute left-0 right-0" style={{ top: 280 }}>
          <svg viewBox="0 0 375 80" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}><path d="M0,40 C80,80 200,0 375,40 L375,80 L0,80 Z" fill="white" /></svg>
        </div>
        <div className="relative z-10 flex flex-col items-center pt-20">
          <h1 className="text-center" style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: '#2B5F9E' }}>doothing</h1>
          <p className="text-center mt-2" style={{ fontSize: 14, color: '#2B5F9E' }}>학교 계정으로 로그인하세요</p>
        </div>
        <div className="absolute left-0 right-0 bg-white px-6 flex flex-col items-center" style={{ top: 400 }}>
          <h2 className="mb-10 self-start" style={{ fontSize: 24, fontWeight: 700, color: '#2B5F9E' }}>로그인</h2>
          {user ? (
            <div className="w-full flex flex-col items-center gap-3">
              <CheckCircle size={48} className="text-green-500" />
              <p style={{ fontSize: 16, fontWeight: 600, color: '#374151' }}>{user.name}님, 환영합니다!</p>
              <p style={{ fontSize: 13, color: '#9ca3af' }}>{user.email}</p>
            </div>
          ) : (
            <>
              <button type="button" onClick={handleLogin} disabled={loading} className="w-full flex items-center justify-center gap-3 rounded-2xl active:opacity-90 transition-opacity disabled:opacity-50 border border-gray-200 bg-white" style={{ height: 54, fontSize: 15, fontWeight: 500, color: '#374151' }}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    학교 계정으로 로그인 <ChevronRight size={16} strokeWidth={2.5} />
                  </>
                )}
              </button>
              {error && <p className="text-center mt-4" style={{ fontSize: 13, color: '#ef4444' }}>{error}</p>}
              <p className="text-center mt-8" style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>Google 워크스페이스 기반 학교 이메일 계정으로<br />로그인할 수 있습니다</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
