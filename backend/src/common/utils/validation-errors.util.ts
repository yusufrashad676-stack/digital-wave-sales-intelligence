import type { ValidationError } from 'class-validator';
import type { ValidationErrorDetail } from '../exceptions/validation.exception.js';

export function flattenValidationErrors(errors: ValidationError[], parentPath = ''): ValidationErrorDetail[] {
  const details: ValidationErrorDetail[] = [];
  for (const error of errors) {
    const field = parentPath.length > 0 ? `${parentPath}.${error.property}` : error.property;
    if (error.constraints) {
      for (const [code, message] of Object.entries(error.constraints)) {
        details.push({ field, code, message });
      }
    }
    if (error.children && error.children.length > 0) {
      details.push(...flattenValidationErrors(error.children, field));
    }
  }
  return details;
}
