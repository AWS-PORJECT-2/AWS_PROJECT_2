import type { EmailValidator } from '../interfaces/email-validator.js';
import type { AllowedDomain } from '../types/allowed-domain.js';
import { AppError } from '../errors/app-error.js';

// 학교 도메인 제한과 무관하게 로그인 허용하는 개별 이메일 화이트리스트(소문자).
// 운영진/테스트 계정 등은 소스 하드코딩 대신 ALLOWED_EMAILS env(쉼표구분)로만 구성한다.
const ALLOWED_EMAILS = new Set<string>(
  (process.env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
);

export class EmailValidatorImpl implements EmailValidator {
  private readonly allowedDomains: ReadonlyArray<AllowedDomain>;
  constructor(allowedDomains: AllowedDomain[]) { this.allowedDomains = allowedDomains; }

  isAllowedDomain(email: string): boolean {
    // 개별 허용 이메일은 도메인 제한을 우회.
    if (typeof email === 'string' && ALLOWED_EMAILS.has(email.trim().toLowerCase())) return true;
    const domain = this.extractDomain(email); // 형식 검증(잘못된 이메일은 throw)
    // 테스트용 임시 개방: ALLOW_ANY_EMAIL_DOMAIN=true 면 학교 도메인 제한 해제(형식·구글 이메일 인증은 유지).
    //  env 만 끄면(또는 제거) 즉시 @kookmin.ac.kr 제한으로 복귀. (env 는 호출 시점에 읽어 재시작만으로 토글)
    if (process.env.ALLOW_ANY_EMAIL_DOMAIN === 'true') return true;
    return this.allowedDomains.some((d) => d.isActive && d.domain.toLowerCase() === domain.toLowerCase());
  }

  extractDomain(email: string): string {
    if (!email || typeof email !== 'string') throw new AppError('INVALID_EMAIL_FORMAT');
    const trimmed = email.trim();
    if (!trimmed) throw new AppError('INVALID_EMAIL_FORMAT');
    const parts = trimmed.split('@');
    if (parts.length !== 2) throw new AppError('INVALID_EMAIL_FORMAT');
    const [local, domain] = parts;
    if (!local || local.includes(' ')) throw new AppError('INVALID_EMAIL_FORMAT');
    if (!domain || domain.includes(' ')) throw new AppError('INVALID_EMAIL_FORMAT');
    return domain.toLowerCase();
  }

  getAllowedDomains(): string[] { return this.allowedDomains.filter((d) => d.isActive).map((d) => d.domain); }
}
