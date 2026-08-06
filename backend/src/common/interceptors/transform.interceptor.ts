import { Injectable, NestInterceptor, type ExecutionContext, type CallHandler } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../interfaces/api-envelope.interface.js';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    return next.handle().pipe(map((data) => this.toEnvelope(data)));
  }

  private toEnvelope(data: T): unknown {
    if (isEnvelope(data)) {
      return data;
    }
    return { data };
  }
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && 'data' in value && keys.every((key) => key === 'data' || key === 'meta');
}
