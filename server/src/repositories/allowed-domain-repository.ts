import type { AllowedDomain } from '../types/index.js';
/**
 * Allowed domain repository interface.
 * IMPORTANT: All domain lookups and storage MUST use lowercase-normalized values.
 * The DB enforces uniqueness via LOWER() functional index (see migration 002),
 * and the application layer must always pass lowercased domains to stay consistent.
 */
export interface AllowedDomainRepository { findActiveDomains(): Promise<AllowedDomain[]>; findByDomain(domain: string): Promise<AllowedDomain | null>; }
export class InMemoryAllowedDomainRepository implements AllowedDomainRepository {
  private readonly domains = new Map<string, AllowedDomain>();
  constructor(initial?: AllowedDomain[]) { if (initial) for (const d of initial) this.domains.set(d.domain.toLowerCase(), { ...d }); }
  async findActiveDomains() { return [...this.domains.values()].filter(d => d.isActive); }
  async findByDomain(domain: string) { return this.domains.get(domain.toLowerCase()) ?? null; }
}
