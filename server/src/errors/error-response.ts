import { AppError } from './app-error.js';
export interface ErrorResponse { error: string; message: string; }
export function createErrorResponse(error: AppError): ErrorResponse {
  return { error: error.code, message: error.message };
}
