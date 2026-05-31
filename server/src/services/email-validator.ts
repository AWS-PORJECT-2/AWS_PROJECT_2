import type { EmailValidator } from '../interfaces/email-validator.js';
import type { AllowedDomain } from '../types/allowed-domain.js';
import { AppError } from '../errors/app-error.js';

// 학교 도메인 제한과 무관하게 로그인 허용하는 개별 이메일 화이트리스트(소문자).
// 운영진/테스트 계정 등. ALLOWED_EMAILS env(쉼표구분)로도 추가 가능.
const ALLOWED_EMAILS = new Set<string>(
  ['leesangjin128@gmail.com', ...(process.env.ALLOWED_EMAILS ?? '').split(',')]
    .map((e) => e.trim().toLowerCase()).filter(Boolean),
);

export class EmailValidatorImpl implements EmailValidator {
  private readonly allowedDomains: ReadonlyArray<AllowedDomain>;
  constructor(allowedDomains: AllowedDomain[]) { this.allowedDomains = allowedDomains; }

  isAllowedDomain(email: string): boolean {
    // 개별 허용 이메일은 도메인 제한을 우회.
    if (typeof email === 'string' && ALLOWED_EMAILS.has(email.trim().toLowerCase())) return true;
    const domain = this.extractDomain(email);
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
