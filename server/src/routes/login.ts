import type { AuthService } from '../interfaces/auth-service';
import { AppError } from '../errors/app-error';
import { createErrorResponse } from '../errors/error-response';

export function createLoginHandler(authService: AuthService) {
  return async (req: { body: Record<string, unknown> }, res: { status: (code: number) => { json: (body: unknown) => void }; json: (body: unknown) => void }): Promise<void> => {
    const { rememberMe } = req.body;
    try { res.json(await authService.initiateLogin(rememberMe === true)); }
    catch (error) {
      if (error instanceof AppError) res.status(error.httpStatus).json(createErrorResponse(error));
      else res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
