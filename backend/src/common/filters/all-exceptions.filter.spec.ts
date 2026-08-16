import assert from 'node:assert/strict';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { describe, it } from 'node:test';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../database/generated/prisma/client.js';
import { RequestContextService } from '../context/request-context.service.js';
import { NotFoundException } from '../exceptions/not-found.exception.js';
import { ErrorCode } from '../exceptions/error-codes.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

class MockResponse {
  statusCode: number | undefined;
  body: unknown;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(body: unknown): this {
    this.body = body;
    return this;
  }
}

function createHost(response: MockResponse): ArgumentsHost {
  const request = { method: 'GET', originalUrl: '/api/v1/test' } as Request;
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => response as unknown as Response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
}

function catchWith(exception: unknown): MockResponse {
  const response = new MockResponse();
  const context = new RequestContextService();
  context.run({ requestId: 'test-req', startedAt: Date.now() }, () => {
    new AllExceptionsFilter(context).catch(exception, createHost(response));
  });
  return response;
}

describe('AllExceptionsFilter', () => {
  it('maps an AppException to its status and code', () => {
    const response = catchWith(new NotFoundException('Company not found'));
    assert.equal(response.statusCode, HttpStatus.NOT_FOUND);
    assert.deepEqual(response.body, {
      error: { code: ErrorCode.RESOURCE_NOT_FOUND, message: 'Company not found' },
    });
  });

  it('maps a Nest HttpException (400) to VALIDATION_ERROR', () => {
    const response = catchWith(new BadRequestException('Invalid payload'));
    assert.equal(response.statusCode, HttpStatus.BAD_REQUEST);
    assert.deepEqual(response.body, {
      error: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid payload' },
    });
  });

  it('maps a 429 HttpException to RATE_LIMITED', () => {
    const response = catchWith(new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS));
    assert.equal(response.statusCode, HttpStatus.TOO_MANY_REQUESTS);
    assert.deepEqual(response.body, {
      error: { code: ErrorCode.RATE_LIMITED, message: 'Too many requests' },
    });
  });

  it('maps a Prisma P2002 unique violation to 409 CONFLICT', () => {
    const prismaError = Object.create(
      Prisma.PrismaClientKnownRequestError.prototype,
    ) as Prisma.PrismaClientKnownRequestError;
    prismaError.code = 'P2002';
    prismaError.message = 'Unique constraint failed';
    const response = catchWith(prismaError);
    assert.equal(response.statusCode, HttpStatus.CONFLICT);
    assert.deepEqual(response.body, {
      error: { code: ErrorCode.CONFLICT, message: 'A resource with the same unique value already exists' },
    });
  });

  it('sanitizes unknown errors to 500 INTERNAL_ERROR', () => {
    const response = catchWith(new Error('boom: SELECT * FROM secrets'));
    assert.equal(response.statusCode, HttpStatus.INTERNAL_SERVER_ERROR);
    assert.deepEqual(response.body, {
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Something went wrong' },
    });
  });
});
