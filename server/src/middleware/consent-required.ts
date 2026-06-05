import type { Request, Response, NextFunction } from 'express';

/**
 * 약관·개인정보 동의 게이트(서버 강제).
 *
 * 동의 팝업은 클라이언트 UX 일 뿐 — 사용자가 팝업을 닫거나 개발자도구/직접 API 호출로 우회하면
 * 동의 없이도 개인정보가 들어가는 행위(배송지 저장·프로젝트 개설·후원/결제 등)가 가능했다.
 * 이 미들웨어는 가입 시 동의(termsAgreedAt)가 없으면 해당 행위를 서버에서 차단한다.
 *
 * req.termsAgreed 는 authRequired 가 user 조회 시 채워둠 → 추가 DB 조회 없음.
 * 반드시 authRequired 뒤에 배치할 것(앞에 두면 req.termsAgreed 가 undefined).
 *
 * 비동의 응답은 403 + code:'CONSENT_REQUIRED' → 프론트가 이 코드를 받으면 동의 게이트를 다시 띄움.
 *
 * 읽기(GET/HEAD/OPTIONS)는 통과시키고 쓰기(POST/PATCH/PUT/DELETE)만 차단한다.
 * → 라우터 전체(app.use)에 걸어도 목록 조회 등은 안 막힘, 데이터가 들어가는 행위만 동의 강제.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export function consentRequired(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method) || req.termsAgreed) { next(); return; }
  res.status(403).json({
    error: 'CONSENT_REQUIRED',
    code: 'CONSENT_REQUIRED',
    message: '서비스 이용약관과 개인정보 수집·이용에 동의해야 이용할 수 있습니다.',
  });
}
