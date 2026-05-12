import type { OAuthState } from '../types/index.js';
export interface OAuthStateRepository {
  save(state: OAuthState): Promise<void>;
  findByState(state: string): Promise<OAuthState | null>;
  delete(state: string): Promise<void>;
  deleteExpired(): Promise<void>;
}
