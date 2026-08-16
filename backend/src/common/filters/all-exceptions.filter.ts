import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../database/generated/prisma/client.js';
import { RequestContextService } from '../context/request-context.service.js';
import { AppException } from '../exceptions/app-exception.js';
import { ErrorCode } from '../exceptions/error-codes.js';
import type { ErrorResponse } from '../interfaces/error-response.interface.js';

interface MappedError {
  status: number;
  code: string;
  message: string;
}

const HTTP_STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.RESOURCE_NOT_FOUND,
  [HttpStatus.METHOD_NOT_ALLOWED]: ErrorCode.METHOD_NOT_ALLOWED,
  [HttpStatus.NOT_ACCEPTABLE]: ErrorCode.NOT_ACCEPTABLE,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

const PRISMA_ERROR_TO_MAPPED: Record<string, MappedError> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    code: ErrorCode.CONFLICT,
    message: 'A resource with the same unique value already exists',
  },
  P2003: {
    status: HttpStatus.CONFLICT,
    code: ErrorCode.CONFLICT,
    message: 'The operation violates a referential constraint',
  },
  P2025: { status: HttpStatus.NOT_FOUND, code: ErrorCode.RESOURCE_NOT_FOUND, message: 'Resource not found' },
};

const INTERNAL_ERROR: MappedError = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  code: ErrorCode.INTERNAL_ERROR,
  message: 'Something went wrong',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const resolved = this.resolve(exception);
    const requestId = this.requestContext.getRequestId();
    const startedAt = this.requestContext.get()?.startedAt;
    const durationMs = startedAt !== undefined ? Date.now() - startedAt : undefined;
    const context = `[${requestId}] ${request.method} ${request.originalUrl} -> ${resolved.status}`;

    if (resolved.status >= 500) {
      const detail = exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
      this.logger.error(`${context} (${resolved.code})`, detail);
    } else {
      this.logger.warn(`${context} (${resolved.code}) ${durationMs !== undefined ? `${durationMs}ms` : ''}`);
    }

    response
      .status(resolved.status)
      .json({ error: { code: resolved.code, message: resolved.message } } satisfies ErrorResponse);
  }

  private resolve(exception: unknown): MappedError {
    if (exception instanceof AppException) {
      return { status: exception.httpStatus, code: exception.code, message: exception.message };
    }

    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = PRISMA_ERROR_TO_MAPPED[exception.code];
      return mapped ?? INTERNAL_ERROR;
    }

    return INTERNAL_ERROR;
  }

  private resolveHttpException(exception: HttpException): MappedError {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const message = extractMessage(payload, exception);
    const code = HTTP_STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR;
    return { status, code, message };
  }
}

function extractMessage(payload: string | object, exception: HttpException): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload !== null && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && message.every((item): item is string => typeof item === 'string')) {
      return message.join(', ');
    }
  }
  return exception.message;
}
