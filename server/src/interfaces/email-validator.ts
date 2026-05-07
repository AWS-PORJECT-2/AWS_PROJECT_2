export interface EmailValidator {
  isAllowedDomain(email: string): boolean;
  extractDomain(email: string): string;
  getAllowedDomains(): string[];
}
