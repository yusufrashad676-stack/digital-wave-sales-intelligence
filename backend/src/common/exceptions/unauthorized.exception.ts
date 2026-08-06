import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception.js';
import { ErrorCode } from './error-codes.js';

export class UnauthorizedException extends AppException {
  constructor(message = 'Authentication required', details?: unknown) {
    super(ErrorCode.UNAUTHORIZED, message, details, HttpStatus.UNAUTHORIZED);
  }
}
