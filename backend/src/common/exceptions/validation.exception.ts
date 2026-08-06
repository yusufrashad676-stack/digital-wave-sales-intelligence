import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception.js';
import { ErrorCode } from './error-codes.js';

export interface ValidationErrorDetail {
  field: string;
  code: string;
  message: string;
}

export class ValidationException extends AppException {
  constructor(details: ValidationErrorDetail[], message = 'Invalid request payload') {
    super(ErrorCode.VALIDATION_ERROR, message, details, HttpStatus.BAD_REQUEST);
  }
}
