import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createApp } from './app.bootstrap.js';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService);

  const port = config.getOrThrow<number>('app.port');
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api/v1 (env: ${config.getOrThrow<string>('app.nodeEnv')})`);
}

void bootstrap();
