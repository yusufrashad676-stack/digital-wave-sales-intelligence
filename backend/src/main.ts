import 'reflect-metadata';

import { Logger, ValidationPipe, type ValidationError } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { RequestContextService } from './common/context/request-context.service.js';
import { ValidationException } from './common/exceptions/validation.exception.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { AccessLogInterceptor } from './common/interceptors/access-log.interceptor.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { flattenValidationErrors } from './common/utils/validation-errors.util.js';

const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'];

function buildValidationException(errors: ValidationError[]): ValidationException {
  return new ValidationException(flattenValidationErrors(errors));
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  app.use(helmet());

  const origins = config.getOrThrow<string[]>('cors.origins');
  const corsOptions: CorsOptions = {
    origin: origins.length > 0 ? origins : false,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
  };
  app.enableCors(corsOptions);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: buildValidationException,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(app.get(RequestContextService)));
  app.useGlobalInterceptors(new TransformInterceptor(), new AccessLogInterceptor(app.get(RequestContextService)));

  const port = config.getOrThrow<number>('app.port');
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api/v1 (env: ${config.getOrThrow<string>('app.nodeEnv')})`);
}

void bootstrap();
