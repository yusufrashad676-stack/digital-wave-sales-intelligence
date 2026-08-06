import { Injectable, Logger, NestInterceptor, type ExecutionContext, type CallHandler } from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import { RequestContextService } from '../context/request-context.service.js';

@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly requestContext: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const response = http.getResponse<Response>();
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        const requestId = this.requestContext.getRequestId();
        this.logger.log(
          `${request.method} ${request.originalUrl} ${response.statusCode} ${durationMs.toFixed(1)}ms [${requestId}]`,
        );
      }),
    );
  }
}
