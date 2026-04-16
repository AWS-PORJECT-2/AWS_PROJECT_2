import { AppError } from './app-error.js';
import { ErrorCodes, type ErrorCode } from './error-codes.js';
export interface ErrorResponse { error: string; message: string; }
export function createErrorResponse(error: AppError): ErrorResponse {
  return { error: error.code, message: error.message };
}
export function createErrorResponseFromCode(errorCode: ErrorCode, message?: string): ErrorResponse {
  const def = ErrorCodes[errorCode];
  return { error: def.code, message: message ?? def.message };
}
