import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain error with a stable machine-readable code. The global filter renders it as
 * { error: { code, message, details } } with the given HTTP status.
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  notFound: (entity: string, id?: string) =>
    new AppError('NOT_FOUND', `${entity}${id ? ` "${id}"` : ''} not found`, HttpStatus.NOT_FOUND),
  conflict: (message: string, details?: unknown) => new AppError('CONFLICT', message, HttpStatus.CONFLICT, details),
  invalidState: (message: string, details?: unknown) =>
    new AppError('INVALID_STATE', message, HttpStatus.CONFLICT, details),
  validation: (message: string, details?: unknown) =>
    new AppError('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST, details),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError('FORBIDDEN', message, HttpStatus.FORBIDDEN),
  insufficientStock: (message: string, details?: unknown) =>
    new AppError('INSUFFICIENT_STOCK', message, HttpStatus.UNPROCESSABLE_ENTITY, details),
  rule: (code: string, message: string, details?: unknown) =>
    new AppError(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details),
};
