import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception.js';

export class BusinessRuleException extends AppException {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, details, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
