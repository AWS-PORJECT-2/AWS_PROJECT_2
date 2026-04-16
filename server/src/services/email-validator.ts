import type { EmailValidator } from '../interfaces/email-validator';
import type { AllowedDomain } from '../types/allowed-domain';
import { AppError } from '../errors/app-error';

export class EmailValidatorImpl implements EmailValidator {
  private readonly allowedDomains: ReadonlyArray<AllowedDomain>;
  constructor(allowedDomains: AllowedDomain[]) { this.allowedDomains = allowedDomains; }

  isAllowedDomain(email: string): boolean {
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
