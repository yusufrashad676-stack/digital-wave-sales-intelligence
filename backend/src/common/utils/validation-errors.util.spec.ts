import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { flattenValidationErrors } from './validation-errors.util.js';
import type { ValidationError } from 'class-validator';

describe('flattenValidationErrors', () => {
  it('maps flat constraint violations to detail entries', () => {
    const errors: ValidationError[] = [
      {
        property: 'email',
        constraints: { isEmail: 'email must be an email' },
      } as ValidationError,
      {
        property: 'password',
        constraints: { minLength: 'password must be longer than or equal to 8 characters' },
      } as ValidationError,
    ];
    const details = flattenValidationErrors(errors);
    assert.deepEqual(details, [
      { field: 'email', code: 'isEmail', message: 'email must be an email' },
      { field: 'password', code: 'minLength', message: 'password must be longer than or equal to 8 characters' },
    ]);
  });

  it('flattens nested child errors with dotted paths', () => {
    const errors: ValidationError[] = [
      {
        property: 'address',
        children: [
          {
            property: 'street',
            constraints: { isNotEmpty: 'street should not be empty' },
          } as ValidationError,
        ],
      } as ValidationError,
    ];
    assert.deepEqual(flattenValidationErrors(errors), [
      { field: 'address.street', code: 'isNotEmpty', message: 'street should not be empty' },
    ]);
  });
});
