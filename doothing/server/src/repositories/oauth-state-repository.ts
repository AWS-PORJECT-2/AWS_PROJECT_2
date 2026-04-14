import type { OAuthState } from '../types';
export interface OAuthStateRepository { save(state: OAuthState): Promise<void>; findByState(state: string): Promise<OAuthState | null>; delete(state: string): Promise<void>; deleteExpired(): Promise<void>; }
export class InMemoryOAuthStateRepository implements OAuthStateRepository {
  private readonly states = new Map<string, OAuthState>();
  async save(state: OAuthState) { this.states.set(state.state, { ...state }); }
  async findByState(state: string) { return this.states.get(state) ?? null; }
  async delete(state: string) { this.states.delete(state); }
  async deleteExpired() { const now = new Date(); for (const [k, v] of this.states) { if (v.expiresAt <= now) this.states.delete(k); } }
}
