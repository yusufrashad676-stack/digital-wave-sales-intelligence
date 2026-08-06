import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception.js';
import { ErrorCode } from './error-codes.js';

export class ConflictException extends AppException {
  constructor(message = 'Resource conflict', details?: unknown) {
    super(ErrorCode.CONFLICT, message, details, HttpStatus.CONFLICT);
  }
}
