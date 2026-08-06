import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from '../context/request-context.service.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const headerId = req.header('x-request-id');
    const requestId = headerId && REQUEST_ID_PATTERN.test(headerId) ? headerId : randomUUID();
    this.requestContext.run({ requestId, startedAt: Date.now() }, () => next());
  }
}
