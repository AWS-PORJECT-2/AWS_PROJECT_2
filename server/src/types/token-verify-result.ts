import type { TokenPayload } from './token-payload.js';

export type TokenVerifyResult =
  | { valid: true; payload: TokenPayload }
  | { valid: false; reason: 'expired' | 'invalid' };
