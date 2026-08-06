import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception.js';
import { ErrorCode } from './error-codes.js';

export class NotFoundException extends AppException {
  constructor(message = 'Resource not found', details?: unknown) {
    super(ErrorCode.RESOURCE_NOT_FOUND, message, details, HttpStatus.NOT_FOUND);
  }
}
