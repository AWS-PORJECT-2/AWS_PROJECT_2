import { ErrorCodes, type ErrorCode } from './error-codes.js';
export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  constructor(errorCode: ErrorCode, message?: string) {
    const definition = ErrorCodes[errorCode];
    super(message ?? definition.message);
    this.httpStatus = definition.httpStatus;
    this.code = definition.code;
    this.name = 'AppError';
  }
}
