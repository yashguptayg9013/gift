import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { RequestContextStore } from '../request-context';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

/** Renders every error as { error: { code, message, details, requestId } }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const requestId = RequestContextStore.get()?.requestId;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as string | Record<string, unknown>;
      if (typeof r === 'object' && r && typeof r.code === 'string') {
        body = { code: r.code, message: String(r.message), details: r.details };
      } else if (typeof r === 'object' && r && Array.isArray(r.message)) {
        body = { code: 'VALIDATION_FAILED', message: 'Request validation failed', details: r.message };
      } else {
        body = { code: httpCode(status), message: typeof r === 'string' ? r : String((r as { message?: unknown })?.message ?? exception.message) };
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          body = { code: 'DUPLICATE', message: `A record with this ${fieldList(exception.meta?.target)} already exists` };
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          body = { code: 'NOT_FOUND', message: 'Record not found' };
          break;
        case 'P2003':
          status = HttpStatus.CONFLICT;
          body = { code: 'REFERENCE_CONSTRAINT', message: 'The record is referenced by other data or a referenced record does not exist' };
          break;
        case 'P2034':
          status = HttpStatus.CONFLICT;
          body = { code: 'WRITE_CONFLICT', message: 'Concurrent update detected. Please retry.' };
          break;
        default:
          this.logger.error({ err: exception, path: req.url }, 'Unhandled Prisma error');
      }
    } else {
      this.logger.error({ err: exception, path: req.url, requestId }, 'Unhandled error');
    }

    if (status >= 500 && exception instanceof HttpException) this.logger.error({ err: exception, path: req.url, requestId });
    res.status(status).json({ error: { ...body, requestId } });
  }
}

function fieldList(target: unknown) {
  if (Array.isArray(target)) return target.join(', ');
  return typeof target === 'string' ? target : 'value';
}

function httpCode(status: number) {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
  }
}
