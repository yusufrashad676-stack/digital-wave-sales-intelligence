import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception.js';
import { ErrorCode } from './error-codes.js';

export class ServiceUnavailableException extends AppException {
  constructor(
    code: string = ErrorCode.SERVICE_UNAVAILABLE,
    message = 'Service temporarily unavailable',
    details?: unknown,
  ) {
    super(code, message, details, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
