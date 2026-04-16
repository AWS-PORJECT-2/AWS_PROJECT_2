import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) { res.status(err.httpStatus).json(createErrorResponse(err)); return; }
  res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
}
