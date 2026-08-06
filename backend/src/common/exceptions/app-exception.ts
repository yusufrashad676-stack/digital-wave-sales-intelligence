import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes.js';

export class AppException extends Error {
  constructor(
    public readonly code: ErrorCode | string,
    message: string,
    public readonly details?: unknown,
    public readonly httpStatus: number = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
