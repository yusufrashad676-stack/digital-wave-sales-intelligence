import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception.js';
import { ErrorCode } from './error-codes.js';

export class ForbiddenException extends AppException {
  constructor(message = 'Access forbidden', details?: unknown) {
    super(ErrorCode.FORBIDDEN, message, details, HttpStatus.FORBIDDEN);
  }
}
